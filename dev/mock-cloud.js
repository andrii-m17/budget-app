// Rev 2.32.75 (K3) — мок Cloud для тестового середовища (НЕ завантажується на робочому origin; див. loadMockCloudIfNeeded в index.html).
// Емулятор в пам'яті: PostgREST (eq, neq, gt, gte, lt, lte, is, in, ilike, order, limit, offset, select-колонки, single/maybeSingle,
// count, insert/upsert/update/delete), RPC sync_heads, GoTrue (вхід, оновлення, вихід, user), Edge Functions (заглушка), Realtime (заглушка
// з ручним емітом). Дані — детермінований генератор за seed; усе синтетичне (загальні назви, без реальних імен і сум).
// Працює і в браузері (window.MockCloud), і в Node (module.exports) — тести не потребують мережі.
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.MockCloud = api;
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';
  const FIXTURES = ['empty', 'one', 'typical', 'large', 'invalid', 'hostile', 'edge-dates', 'two-devices'];
  const SYNC_TABLES = ['categories', 'subcategories', 'dictionary', 'bank_accounts', 'installment_accounts', 'hidden_entities', 'expenses', 'incomes', 'debts'];
  const SESSION_KEY = 'sb-mock-auth-token';

  function rng(seed){ // mulberry32
    let a = seed >>> 0;
    return function(){ a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function makeIds(r){
    return function(){
      const h = function(n){ let s = ''; for(let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16); return s; };
      return h(8) + '-' + h(4) + '-4' + h(3) + '-a' + h(3) + '-' + h(12);
    };
  }
  const pad = function(n){ return String(n).padStart(2, '0'); };
  function isoDate(y, m, d){ return y + '-' + pad(m) + '-' + pad(d); }

  // generateFixture(name, opts): { familyId, users, tables:{...}, notifications }. opts.seed, opts.anchor ('YYYY-MM-DD', «сьогодні» набору).
  function generateFixture(name, opts){
    if(FIXTURES.indexOf(name) === -1) name = 'typical';
    const o = opts || {};
    const r = rng(o.seed || 20261015);
    const uuid = makeIds(r);
    const anchor = o.anchor || new Date().toISOString().slice(0, 10);
    const ay = +anchor.slice(0, 4), am = +anchor.slice(5, 7);
    const stamp = function(daysAgo){ return new Date(Date.parse(anchor + 'T09:00:00Z') - daysAgo * 86400000).toISOString(); };
    const familyId = uuid();
    const users = [{ id: uuid(), display_name: 'Користувач А', email: 'user-a@example.test', push_name: null, gender: null }, { id: uuid(), display_name: 'Користувач Б', email: 'user-b@example.test', push_name: null, gender: null }];
    const T = {}; SYNC_TABLES.forEach(function(t){ T[t] = []; });
    const fx = { name: name, familyId: familyId, users: users, tables: T, anchor: anchor, notifications: [], meta: { twoDevices: name === 'two-devices' } };
    if(name === 'empty') return fx;
    const base = function(extra, daysAgo){ const c = stamp(daysAgo || 30); return Object.assign({ family_id: familyId, created_at: c, updated_at: c, deleted_at: null, created_by: users[0].id, updated_by: users[0].id }, extra); };
    const hostile = name === 'hostile';
    const catNames = hostile ? ['<img src=x onerror=alert(1)>', '"><script>alert(2)</script>', '🍎'.repeat(40), 'А'.repeat(200), 'RTL ‮abc'] : ["Продукти", "Транспорт", "Дім", "Здоров'я", "Розваги", "Інше"];
    const types = ["Обов'язкова", 'Гнучка', 'Скорочувана'];
    const cats = catNames.map(function(n, i){ return base({ id: uuid(), name: n, active: true, type: types[i % 3] }); });
    const subs = [];
    cats.forEach(function(c, i){ for(let k = 1; k <= 2; k++) subs.push(base({ id: uuid(), name: (hostile ? '<b>' + k + '</b>' : 'Підкатегорія ' + (i + 1) + '.' + k), category_id: c.id, active: true, deactivated_via: null })); });
    const dict = cats.slice(0, 4).map(function(c, i){ return base({ id: uuid(), keyword: 'слово' + (i + 1), category_id: c.id, subcategory_id: null, deleted_via: null }); });
    const banks = [base({ id: uuid(), name: 'Картка 1', credit_limit: 20000, payment_day: name === 'edge-dates' ? 31 : 15 }), base({ id: uuid(), name: 'Картка 2', credit_limit: 10000, payment_day: null })];
    const insts = [base({ id: uuid(), name: 'Розстрочка 1', initial_amount: 12000, due_day: name === 'edge-dates' ? 31 : 10 })];
    T.categories = cats; T.subcategories = subs; T.dictionary = dict; T.bank_accounts = banks; T.installment_accounts = insts;
    const nExp = { one: 1, typical: 120, large: 5000, invalid: 12, hostile: 30, 'edge-dates': 14, 'two-devices': 120 }[name];
    const months = name === 'large' ? 36 : 3;
    const exp = [];
    for(let i = 0; i < nExp; i++){
      const mOff = Math.floor(r() * months);
      let y = ay, m = am - mOff; while(m < 1){ m += 12; y--; }
      const c = cats[Math.floor(r() * cats.length)];
      exp.push(base({ id: uuid(), amount: 50 + Math.floor(r() * 2000), expense_date: isoDate(y, m, 1 + Math.floor(r() * 28)), category: c.name, subcategory: null,
        note: hostile ? ['<img src=x onerror=alert(1)>', '"><svg onload=alert(3)>', 'Я'.repeat(200), '😀🎉', "'; DROP TABLE x;--"][i % 5] : 'Витрата ' + (i + 1),
        linked_installment_id: null, source: null, external_id: null }, 1 + (i % 60)));
    }
    if(name === 'invalid'){
      exp[0].amount = -5; exp[1].amount = 1.5; exp[2].amount = '12'; exp[3].expense_date = null; exp[4].category = 'Немає такої'; exp[5].amount = 2147483647; exp[6].amount = 0; exp[7].note = null;
    }
    if(name === 'edge-dates'){
      ['2024-02-29', isoDate(ay, am, 1), isoDate(ay, am, 28), isoDate(ay - 1, 12, 31), isoDate(ay, 1, 1), isoDate(ay + 1, 1, 1), isoDate(ay, am, 30), isoDate(ay, 3, 31)].forEach(function(d, i){ if(exp[i]) exp[i].expense_date = d; });
    }
    T.expenses = exp;
    const inc = [];
    for(let m = 0; m < Math.min(months, 3); m++){ let y = ay, mm = am - m; while(mm < 1){ mm += 12; y--; } inc.push(base({ id: uuid(), amount: 30000, income_date: isoDate(y, mm, 5), note: 'Дохід ' + (m + 1) }, 5 + m)); }
    if(name !== 'one') T.incomes = inc;
    if(name !== 'one'){
      T.debts = [base({ id: uuid(), bank_account_id: banks[0].id, installment_account_id: null, name: banks[0].name, kind: 'card', month: isoDate(ay, am, 1), balance: 4000, min_payment: 400, min_payment_done: false, monthly_payment: null }),
        base({ id: uuid(), bank_account_id: null, installment_account_id: insts[0].id, name: insts[0].name, kind: 'installment', month: isoDate(ay, am, 1), balance: 9000, min_payment: null, min_payment_done: null, monthly_payment: 1000 })];
    }
    return fx;
  }

  // ---- стан і PostgREST ----
  function createState(fixture){
    const tables = {};
    Object.keys(fixture.tables).forEach(function(t){ tables[t] = JSON.parse(JSON.stringify(fixture.tables[t])); });
    const state = { fixture: fixture.name, familyId: fixture.familyId, users: fixture.users, tables: tables, purgedAt: null, log: [], seq: 0, realtime: new Set(), clock: null, idN: 0, maxRows: 1000 }; // maxRows — як стандартний max-rows PostgREST: одна відповідь не більша за 1000 рядків (0 = без обмеження)
    tables.family_members = fixture.users.map(function(u){ return { family_id: fixture.familyId, user_id: u.id }; });
    tables.users = fixture.users.map(function(u){ return Object.assign({}, u); });
    tables.user_notifications = (fixture.notifications || []).slice();
    return state;
  }
  const nowIso = function(st){ return st && st.clock ? st.clock() : new Date().toISOString(); };
  const KEYS = { hidden_entities: ['family_id', 'entity_type', 'entity_id'], notification_settings: ['user_id'] };
  const rowKey = function(table, row){ return (KEYS[table] || ['id']).map(function(k){ return String(row[k]); }).join('|'); };
  function cmp(a, b){
    const ta = Date.parse(a), tb = Date.parse(b);
    if(typeof a === 'string' && typeof b === 'string' && !isNaN(ta) && !isNaN(tb) && /\d{4}-\d\d-\d\d/.test(a)) return ta - tb;
    const na = Number(a), nb = Number(b);
    if(!isNaN(na) && !isNaN(nb) && a !== '' && b !== '' && a !== null) return na - nb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  function matcher(key, expr){
    const i = expr.indexOf('.'); const op = expr.slice(0, i); const val = expr.slice(i + 1);
    switch(op){
      case 'eq': return function(r){ return r[key] !== null && r[key] !== undefined && String(r[key]) === val; };
      case 'not': { const inner = matcher(key, val); return function(r){ return !inner(r); }; } // not.is.null тощо (PURGE-1: DELETE лише надгробка)
      case 'neq': return function(r){ return String(r[key]) !== val; };
      case 'gt': return function(r){ return r[key] != null && cmp(r[key], val) > 0; };
      case 'gte': return function(r){ return r[key] != null && cmp(r[key], val) >= 0; };
      case 'lt': return function(r){ return r[key] != null && cmp(r[key], val) < 0; };
      case 'lte': return function(r){ return r[key] != null && cmp(r[key], val) <= 0; };
      case 'is': return function(r){ const v = r[key]; return val === 'null' ? (v === null || v === undefined) : val === 'true' ? v === true : v === false; };
      case 'in': { const list = val.replace(/^\(|\)$/g, '').split(',').map(function(x){ return x.replace(/^"|"$/g, ''); }); return function(r){ return r[key] != null && list.indexOf(String(r[key])) !== -1; }; }
      case 'ilike': { const re = new RegExp('^' + val.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', 'i'); return function(r){ return r[key] != null && re.test(String(r[key])); }; }
      default: return function(){ return true; };
    }
  }
  // or=(a.gt."X",and(b.eq."X",c.gt."Y")): логічні групи PostgREST (значення можуть бути в лапках); повертає предикат
  function splitTop(str){
    const out = []; let depth = 0, inQ = false, cur = '';
    for(let i = 0; i < str.length; i++){
      const ch = str[i];
      if(ch === '"') inQ = !inQ;
      if(!inQ && ch === '(') depth++;
      if(!inQ && ch === ')') depth--;
      if(!inQ && depth === 0 && ch === ','){ out.push(cur); cur = ''; } else cur += ch;
    }
    if(cur) out.push(cur);
    return out;
  }
  function logicMatcher(kind, inner){
    const preds = splitTop(inner).map(function(term){
      const am = term.match(/^(and|or)\((.*)\)$/);
      if(am) return logicMatcher(am[1], am[2]);
      const m = term.match(/^([a-z_0-9]+)\.(.*)$/);
      const rest = m[2]; const dot = rest.indexOf('.');
      let val = rest.slice(dot + 1); if(/^".*"$/.test(val)) val = val.slice(1, -1);
      return matcher(m[1], rest.slice(0, dot) + '.' + val);
    });
    return kind === 'and' ? function(r){ return preds.every(function(f){ return f(r); }); } : function(r){ return preds.some(function(f){ return f(r); }); };
  }
  const RESERVED = ['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'];
  function filtersOf(params){
    const fs = [];
    params.forEach(function(v, k){
      if(RESERVED.indexOf(k) !== -1) return;
      if(k === 'or' || k === 'and'){ const m = v.match(/^\((.*)\)$/); fs.push(logicMatcher(k, m ? m[1] : v)); return; }
      fs.push(matcher(k, v));
    });
    return fs;
  }
  function project(rows, select){
    if(!select || select === '*') return rows;
    const cols = select.split(',').map(function(c){ return c.trim(); }).filter(Boolean);
    return rows.map(function(r){ const o = {}; cols.forEach(function(c){ o[c] = r[c] === undefined ? null : r[c]; }); return o; });
  }
  function bump(state, table, hard){
    if(hard && SYNC_TABLES.indexOf(table) !== -1) state.purgedAt = nowIso(state);
  }
  function emit(state, table, eventType, row){
    state.realtime.forEach(function(ch){ ch.handlers.forEach(function(h){ if(h.filter && h.filter.table === table && (h.filter.event === '*' || h.filter.event === eventType)) { try{ h.cb({ eventType: eventType, table: table, new: row || {}, old: {} }); }catch(e){} } }); });
  }

  function jsonResponse(status, body, headers){
    const h = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
    return new Response(body === undefined ? null : JSON.stringify(body), { status: status, headers: h });
  }
  function headerOf(init, input, name){
    const h = (init && init.headers) || (input && input.headers) || {};
    if(typeof h.get === 'function') return h.get(name) || '';
    const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name.toLowerCase(); });
    return k ? String(h[k]) : '';
  }
  function b64url(s){
    const b = typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s)));
    return b.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  function makeSession(state, ms){
    const exp = Math.floor((ms || Date.now()) / 1000) + 365 * 86400;
    const u = state.users[0];
    const jwt = b64url('{"alg":"HS256","typ":"JWT"}') + '.' + b64url(JSON.stringify({ sub: u.id, role: 'authenticated', aud: 'authenticated', exp: exp, email: u.email })) + '.mock';
    return { access_token: jwt, token_type: 'bearer', expires_in: 365 * 86400, expires_at: exp, refresh_token: 'mock-refresh',
      user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {}, created_at: nowIso(state) } };
  }
  function headsOf(state){
    const tables = {};
    SYNC_TABLES.forEach(function(t){ let max = null; (state.tables[t] || []).forEach(function(r){ if(r.updated_at && (!max || cmp(r.updated_at, max) > 0)) max = r.updated_at; }); tables[t] = max; });
    const hash = function(s){ let h = 0; for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };
    return { tables: tables, members_hash: hash(state.users.map(function(u){ return u.id + '|' + u.display_name; }).join(',')), family_hash: hash(state.familyId),
      unread_notifications: (state.tables.user_notifications || []).filter(function(n){ return !n.read_at; }).length, mono_new: (state.tables.mono_inbox || []).filter(function(n){ return n.status === 'new'; }).length,
      purged_at: state.purgedAt, server_time: nowIso(state) };
  }

  // handle(state, url, init, input) → Promise<Response>
  async function handle(state, url, init, input){
    const u = new URL(url, 'https://mock.invalid');
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const path = u.pathname;
    let m;
    if((m = path.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/i))){
      state.log.push({ kind: 'rpc', name: m[1], method: method });
      if(m[1] === 'sync_heads') return jsonResponse(200, headsOf(state));
      if(m[1] === 'mono_refund_candidates') return jsonResponse(200, []);
      return jsonResponse(200, null);
    }
    if((m = path.match(/\/rest\/v1\/([a-z_0-9]+)/i))) return handleRest(state, m[1], method, u, init, input);
    if(/\/auth\/v1\//.test(path)){
      state.log.push({ kind: 'auth', path: path, method: method });
      if(/\/token$/.test(path)) return jsonResponse(200, makeSession(state));
      if(/\/user$/.test(path)) return jsonResponse(200, makeSession(state).user);
      if(/\/logout$/.test(path)) return new Response(null, { status: 204 });
      return jsonResponse(404, { error: 'not_found' });
    }
    if(/\/functions\/v1\//.test(path)){ state.log.push({ kind: 'function', path: path, method: method }); return jsonResponse(200, { ok: true }); }
    return jsonResponse(404, { error: 'not_found' });
  }
  async function handleRest(state, table, method, u, init, input){
    state.log.push({ kind: 'rest', table: table, method: method });
    const rows = state.tables[table] || (state.tables[table] = []);
    const params = u.searchParams;
    const fs = filtersOf(params);
    const accept = headerOf(init, input, 'Accept');
    const prefer = headerOf(init, input, 'Prefer');
    const wantRep = /return=representation/.test(prefer);
    let body = null;
    if(method === 'POST' || method === 'PATCH' || method === 'PUT'){
      const raw = (init && init.body) || (input && typeof input.text === 'function' ? await input.text() : null);
      try{ body = raw ? JSON.parse(raw) : null; }catch(e){ body = null; }
    }
    const sel = function(list){ return project(list, params.get('select')); };
    const respond = function(list, status, matched, offset){
      if(/pgrst\.object/.test(accept)){
        if(list.length !== 1) return jsonResponse(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains ' + list.length + ' rows' });
        return jsonResponse(status || 200, list[0]);
      }
      const total = matched != null ? matched : list.length, o = offset || 0; // count: загальна кількість збігів до limit/max-rows, як у PostgREST
      return jsonResponse(status || 200, list, /count=/.test(prefer) ? { 'Content-Range': (list.length ? o + '-' + (o + list.length - 1) : '*') + '/' + total } : {});
    };
    if(method === 'GET' || method === 'HEAD'){
      let list = rows.filter(function(r){ return fs.every(function(f){ return f(r); }); });
      const order = params.get('order');
      if(order){
        const specs = order.split(',').map(function(x){ const p = x.split('.'); return { k: p[0], d: p[1] === 'desc' ? -1 : 1 }; });
        list = list.slice().sort(function(a, b){ for(const s of specs){ const c = cmp(a[s.k] == null ? '' : a[s.k], b[s.k] == null ? '' : b[s.k]); if(c) return c * s.d; } return 0; });
      }
      const matchedTotal = list.length;
      const off = +params.get('offset') || 0, lim = params.get('limit');
      list = lim !== null ? list.slice(off, off + (+lim)) : list.slice(off);
      if(state.maxRows > 0 && list.length > state.maxRows) list = list.slice(0, state.maxRows);
      if(method === 'HEAD') return jsonResponse(200, null, { 'Content-Range': '0-' + Math.max(0, list.length - 1) + '/' + list.length });
      return respond(JSON.parse(JSON.stringify(sel(list))), 200, matchedTotal, off);
    }
    const ts = nowIso(state);
    if(method === 'POST'){
      const items = Array.isArray(body) ? body : (body ? [body] : []);
      const upsert = /merge-duplicates|ignore-duplicates/.test(prefer);
      const out = [];
      items.forEach(function(it){
        const row = Object.assign({}, it);
        if(!KEYS[table] && !row.id) row.id = 'mock-' + (++state.idN);
        if(SYNC_TABLES.indexOf(table) !== -1){ if(!row.created_at) row.created_at = ts; if(!row.updated_at) row.updated_at = ts; if(row.deleted_at === undefined) row.deleted_at = null; }
        const conflict = (params.get('on_conflict') || '').split(',').filter(Boolean);
        const keys = conflict.length ? conflict : (KEYS[table] || ['id']);
        const ex = rows.find(function(r){ return keys.every(function(k){ return String(r[k]) === String(row[k]); }); });
        if(ex && upsert){ if(!/ignore-duplicates/.test(prefer)){ Object.assign(ex, row); out.push(ex); } }
        else if(ex){ out.push(null); }
        else { rows.push(row); out.push(row); }
        emit(state, table, ex ? 'UPDATE' : 'INSERT', row);
      });
      const done = out.filter(Boolean);
      return wantRep ? respond(JSON.parse(JSON.stringify(sel(done))), 201) : new Response(null, { status: 201 });
    }
    if(method === 'PATCH' || method === 'PUT'){
      const hit = rows.filter(function(r){ return fs.every(function(f){ return f(r); }); });
      hit.forEach(function(r){ Object.assign(r, body || {}); emit(state, table, 'UPDATE', r); });
      return wantRep ? respond(JSON.parse(JSON.stringify(sel(hit)))) : new Response(null, { status: 204 });
    }
    if(method === 'DELETE'){
      const keep = [], gone = [];
      rows.forEach(function(r){ (fs.every(function(f){ return f(r); }) ? gone : keep).push(r); });
      state.tables[table] = keep;
      if(gone.length) bump(state, table, true);
      gone.forEach(function(r){ emit(state, table, 'DELETE', r); });
      return wantRep ? respond(JSON.parse(JSON.stringify(sel(gone)))) : new Response(null, { status: 204 });
    }
    return jsonResponse(405, { message: 'method not allowed' });
  }

  // «Інший пристрій»: змінює стан сервера й (як справжній Realtime) емітить подію.
  // op: 'update' (patch), 'softdelete', 'harddelete' (оновлює purged_at, надгробка немає), 'insert' (row).
  function simulateOtherDevice(state, spec){
    const rows = state.tables[spec.table] || (state.tables[spec.table] = []);
    const ts = nowIso(state);
    if(spec.op === 'insert'){ const row = Object.assign({ family_id: state.familyId, created_at: ts, updated_at: ts, deleted_at: null }, spec.row); rows.push(row); emit(state, spec.table, 'INSERT', row); return row; }
    const row = rows.find(function(r){ return String(r[spec.key || 'id']) === String(spec.id); });
    if(!row) return null;
    if(spec.op === 'update'){ Object.assign(row, spec.patch || {}, { updated_at: ts }); emit(state, spec.table, 'UPDATE', row); return row; }
    if(spec.op === 'softdelete'){ row.deleted_at = ts; row.updated_at = ts; emit(state, spec.table, 'UPDATE', row); return row; }
    if(spec.op === 'harddelete'){ state.tables[spec.table] = rows.filter(function(r){ return r !== row; }); bump(state, spec.table, true); emit(state, spec.table, 'DELETE', row); return row; }
    return null;
  }

  function attachRealtimeTo(state, client){
    client.channel = function(){
      const ch = { handlers: [], on: function(type, filter, cb){ this.handlers.push({ filter: filter, cb: cb }); return this; },
        subscribe: function(cb){ state.realtime.add(this); if(typeof cb === 'function') try{ cb('SUBSCRIBED'); }catch(e){} return this; } };
      return ch;
    };
    client.removeChannel = function(ch){ state.realtime.delete(ch); return Promise.resolve('ok'); };
  }

  // ---- публічний API (браузер: window.MockCloud; Node: require) ----
  let current = null;
  function init(opts){
    const o = opts || {};
    const fx = generateFixture(o.fixture || 'typical', o);
    current = createState(fx);
    if(typeof o.maxRows === 'number') current.maxRows = o.maxRows; // обмеження відповіді (як max-rows PostgREST); 0 = без обмеження
    try{
      if(typeof localStorage !== 'undefined' && o.seedSession !== false) localStorage.setItem(SESSION_KEY, JSON.stringify(makeSession(current)));
    }catch(e){}
    return current;
  }
  return {
    FIXTURES: FIXTURES, SYNC_TABLES: SYNC_TABLES, SESSION_KEY: SESSION_KEY,
    generateFixture: generateFixture, createState: createState, handle: handle, headsOf: headsOf, makeSession: makeSession,
    simulateOtherDevice: simulateOtherDevice, attachRealtimeTo: attachRealtimeTo,
    init: init,
    get state(){ return current; },
    fetch: function(input, init){ if(!current) init0(); const url = typeof input === 'string' ? input : input.url; return handle(current, url, init, typeof input === 'string' ? null : input); },
    attachRealtime: function(client){ if(!current) init0(); attachRealtimeTo(current, client); },
    otherDevice: function(spec){ return simulateOtherDevice(current, spec); },
  };
  function init0(){ throw new Error('MockCloud.init() не викликано'); }
});
