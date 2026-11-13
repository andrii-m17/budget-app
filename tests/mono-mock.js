// MONO-ACC: мок бази й банку для тестів mono-webhook. Лише синтетичні дані.
// Мок повторює семантику серверних функцій контракту (mono_webhook_ingest, mono_apply_accounts,
// mono_ingest_batch, mono_backfill_release) настільки, наскільки це потрібно сценаріям; кожен виклик
// виконується синхронно всередині async-обгортки, тому два «одночасні» виклики серіалізуються, як рядкове блокування в Postgres.
'use strict';

const NOW0 = Date.parse('2026-11-13T12:00:00Z');
const SECRET = 'synthetic-test-secret-0123456789abcdef-xyz';
const TOKEN = 'SYNTHTOKEN-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MAX_BACK_MS = 2682000 * 1000;

function makeWorld(opts) {
  opts = opts || {};
  const w = {
    now: opts.now || NOW0,
    conn: {
      user_id: 'user-1', status: 'active', token_ciphertext: opts.ct || null, webhook_token_hash: opts.hash || null,
      last_error: null, accounts_refreshed_at: null,
      last_event_at: opts.lastEventAt === undefined ? new Date(NOW0 - 4 * 86400000).toISOString() : opts.lastEventAt,
    },
    accounts: new Map(), inbox: new Map(), events: [], notified: 0, calls: [], fetches: [], logs: [], bg: [], failRpc: {},
    bank: { clientInfo: null, statement: null },
  };
  w.addAccount = function (id, o) {
    o = o || {};
    w.accounts.set(id, { id: id, pan: o.pan === undefined ? '1111********2222' : o.pan, type: o.type === undefined ? 'black' : o.type,
      cur: o.cur === undefined ? 980 : o.cur, jar: !!o.jar, tracked: o.tracked === undefined ? true : o.tracked,
      backfill_from: o.backfill_from || null, seq: w.accounts.size + 1 });
  };
  w.addInbox = function (tx, account) { w.inbox.set(tx, { tx: tx, account: account, source: 'seed' }); };

  function ingest(item, source) {
    const acc = w.accounts.get(String(item.account || '').trim());
    if (!acc || !acc.tracked) return 'untracked';
    const tx = item.id == null ? '' : String(item.id).trim();
    if (!tx || tx.length > 64) return 'invalid';
    const amount = typeof item.amount === 'number' ? item.amount : (/^-?\d+$/.test(String(item.amount)) ? Number(item.amount) : null);
    if (amount === null || !Number.isFinite(amount)) return 'invalid';
    let res = amount >= 0 ? 'skipped' : 'new';
    let dup = false;
    if (w.inbox.has(tx)) dup = true; else w.inbox.set(tx, { tx: tx, account: acc.id, source: source, status: res });
    w.conn.last_event_at = new Date(w.now).toISOString();
    return dup ? 'duplicate' : res;
  }

  const fns = {
    mono_webhook_ingest(a) {
      if (a.p_token_hash !== w.conn.webhook_token_hash || w.conn.status === 'disconnected') return { result: 'no_connection' };
      const item = a.p_item || {};
      if (item.probe === true) { w.events.push({ kind: 'probe', result: 'ok', tail: '' }); return { result: 'probe', user_id: w.conn.user_id }; }
      const acc = String(item.account || '').trim();
      let res, refresh = false, bf = null;
      if (!acc || acc.length > 64) res = 'invalid';
      else if (!w.accounts.has(acc)) {
        res = 'unknown_account';
        if (a.p_after_refresh) w.conn.last_error = 'unknown_account';
        else {
          const t = w.conn.accounts_refreshed_at;
          if (t === null || w.now - t >= 3600000) { w.conn.accounts_refreshed_at = w.now; refresh = true; }
        }
      } else {
        const row = w.accounts.get(acc);
        res = ingest(item, 'webhook');
        if (res === 'new' || res === 'skipped' || res === 'duplicate') {
          bf = row.backfill_from; row.backfill_from = null;
          if (w.conn.last_error === 'unknown_account') w.conn.last_error = null;
        }
        if (res === 'new') w.notified++;
      }
      w.events.push({ kind: 'statement', result: res, tail: acc.slice(-4) });
      return { result: res, user_id: w.conn.user_id, refresh_allowed: refresh, backfill_from: bf,
        token_ciphertext: (refresh || bf) ? w.conn.token_ciphertext : undefined };
    },
    mono_apply_accounts(a) {
      const list = Array.isArray(a.p_accounts) ? a.p_accounts.filter(function (x) { return x && String(x.id || '').trim(); }) : [];
      if (!list.length) return { error: 'empty' };
      const vFrom = w.conn.last_event_at ? new Date(Math.max(Date.parse(w.conn.last_event_at), w.now - MAX_BACK_MS)).toISOString() : null;
      let added = 0, replaced = 0, removed = 0;
      const present = new Set(list.map(function (x) { return String(x.id).trim().slice(0, 64); }));
      list.forEach(function (x) {
        const id = String(x.id).trim().slice(0, 64);
        const ex = w.accounts.get(id);
        if (ex) {
          ex.pan = x.masked_pan || ''; ex.type = x.type || null; ex.cur = x.currency_code; ex.jar = !!x.is_jar;
          if (a.p_mark_backfill && ex.tracked && vFrom) ex.backfill_from = ex.backfill_from || vFrom;
          return;
        }
        let old = null;
        if (!x.is_jar && x.masked_pan) {
          Array.from(w.accounts.values()).filter(function (o) {
            return !o.jar && o.pan === x.masked_pan && o.type === (x.type || null) && o.cur === x.currency_code && !present.has(o.id);
          }).sort(function (p, q) { return q.seq - p.seq; }).slice(0, 1).forEach(function (o) { old = o; });
        }
        let tracked;
        if (old) { tracked = old.tracked; replaced++; }
        else { tracked = !x.is_jar && x.currency_code === 980 && ['fop', 'eAid'].indexOf(x.type || '') < 0; added++; }
        w.addAccount(id, { pan: x.masked_pan || '', type: x.type || null, cur: x.currency_code, jar: !!x.is_jar, tracked: tracked,
          backfill_from: tracked ? vFrom : null });
      });
      Array.from(w.accounts.keys()).forEach(function (id) { if (!present.has(id)) { w.accounts.delete(id); removed++; } });
      return { added: added, replaced: replaced, removed: removed };
    },
    mono_ingest_batch(a) {
      if (!Array.isArray(a.p_items)) return { error: 'invalid' };
      const acc = w.accounts.get(a.p_account);
      if (!acc || !acc.tracked) return { error: 'untracked' };
      const c = { new: 0, duplicate: 0, skipped: 0, invalid: 0 };
      a.p_items.forEach(function (it) {
        const r = ingest(Object.assign({}, it, { account: a.p_account }), 'backfill');
        if (r === 'new') c.new++; else if (r === 'duplicate') c.duplicate++; else if (r === 'skipped') c.skipped++; else c.invalid++;
      });
      const partial = a.p_items.length >= 500;
      w.events.push({ kind: 'backfill', result: (partial ? 'partial' : 'ok') + ' new=' + c.new, tail: a.p_account.slice(-4) });
      return { new: c.new, duplicate: c.duplicate, skipped: c.skipped, invalid: c.invalid, partial: partial };
    },
    mono_backfill_release(a) {
      const acc = w.accounts.get(a.p_account);
      if (acc && a.p_from) acc.backfill_from = acc.backfill_from && acc.backfill_from < a.p_from ? acc.backfill_from : a.p_from;
      w.events.push({ kind: 'backfill', result: 'released ' + (a.p_reason || ''), tail: a.p_account.slice(-4) });
      return null;
    },
  };

  w.rpc = async function (name, args) {
    w.calls.push({ name: name, args: args });
    if (w.failRpc[name]) return { data: null, error: { message: 'boom' } };
    return { data: fns[name](args), error: null };
  };
  w.fetch = async function (url, init) {
    const u = new URL(url);
    w.fetches.push({ path: u.pathname, token: init && init.headers && init.headers['X-Token'] });
    if (u.pathname === '/personal/client-info') return w.bank.clientInfo();
    if (u.pathname.indexOf('/personal/statement/') === 0) return w.bank.statement(u.pathname);
    throw new Error('unexpected bank call ' + u.pathname);
  };
  w.deps = function () {
    return { rpc: w.rpc, fetch: w.fetch, secret: function () { return SECRET; }, now: function () { return w.now; },
      waitUntil: function (p) { w.bg.push(p); }, log: function (c) { w.logs.push(c); } };
  };
  w.drain = async function () { while (w.bg.length) { const p = w.bg.splice(0); await Promise.all(p); } };
  w.count = function (name) { return w.calls.filter(function (c) { return c.name === name; }).length; };
  w.fetchCount = function (prefix) { return w.fetches.filter(function (f) { return f.path.indexOf(prefix) === 0; }).length; };
  return w;
}

function json(body, status) { return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
function stmtItem(id, o) { return Object.assign({ id: id, time: Math.floor(NOW0 / 1000) - 3600, amount: -10000, description: 'Shop', mcc: 5411, originalMcc: 5411, hold: false }, o || {}); }

module.exports = { makeWorld, json, stmtItem, NOW0, SECRET, TOKEN };
