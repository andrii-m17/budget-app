// Rev 2.32.27 (MB-3) — екран підключення Monobank: чисті функції, охорона токена, відкат перемикача картки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['MONO_ERROR_TEXTS', 'monoErrorMessage', 'monoConnectionState', 'MONO_PENDING_FRESH_MS', 'MONO_MONTHS_GEN', 'formatLastEvent', 'MONO_CARD_TYPES', 'monoAccountLabel', 'monoAccountDetail']);

test('monoErrorMessage: усі 9 кодів сервера мають зрозумілий текст; мережа й невідоме — теж', function(){
  const codes = ['invalid_token_format', 'invalid_token', 'rate_limited', 'bank_rate_limited', 'bank_error', 'bank_unreachable', 'webhook_failed', 'server_key_error', 'db_error'];
  codes.forEach(function(k){ const t = c.monoErrorMessage(k); assert.ok(t && t.length > 5 && !/_/.test(t), k); });
  assert.equal(c.monoErrorMessage('invalid_token'), 'Токен недійсний. Перевірте й спробуйте ще раз');
  assert.equal(c.monoErrorMessage('rate_limited'), 'Банк дозволяє одну спробу на хвилину. Спробуйте за хвилину'); // Rev 2.32.428 (MONO-PENDING)
  assert.equal(c.monoErrorMessage('webhook_failed'), 'Не вдалося підключити. Спробуйте ще раз за хвилину');
  assert.equal(c.monoErrorMessage('bank_error'), 'Не вдалося підключити. Спробуйте ще раз за хвилину');
  assert.equal(c.monoErrorMessage('db_error'), 'Не вдалося підключити. Спробуйте ще раз за хвилину');
  assert.equal(c.monoErrorMessage('network'), 'Немає зв\'язку');
  assert.equal(c.monoErrorMessage('щось_нове'), 'Сталася помилка. Спробуйте пізніше');
});
test('monoConnectionState: none / active / pending (свіжий, старий, невідомий, із connected_at) / error / disconnected (MONO-PENDING)', function(){
  const NOW = Date.parse('2026-11-20T12:00:00Z'), iso = function(msAgo){ return new Date(NOW - msAgo).toISOString(); };
  assert.equal(c.monoConnectionState(null), 'none');
  assert.equal(c.monoConnectionState({}), 'none');
  assert.equal(c.monoConnectionState({ status: 'disconnected' }), 'none');
  assert.equal(c.monoConnectionState({ status: 'active', connected_at: iso(1000) }), 'connected');
  assert.equal(c.monoConnectionState({ status: 'active' }), 'connected', 'active без connected_at лишається «Підключено»');
  assert.equal(c.monoConnectionState({ status: 'pending', connected_at: iso(5000) }), 'connected', 'pending із connected_at — як раніше');
  assert.equal(c.monoConnectionState({ status: 'pending', updated_at: iso(30000) }, { now: NOW }), 'connecting', 'pending без connected_at, спроба 30 с тому');
  assert.equal(c.monoConnectionState({ status: 'pending', updated_at: iso(119999) }, { now: NOW }), 'connecting', 'межа 2 хв: ще в дорозі');
  assert.equal(c.monoConnectionState({ status: 'pending', updated_at: iso(120000) }, { now: NOW }), 'incomplete', 'рівно 2 хв — вже не в дорозі');
  assert.equal(c.monoConnectionState({ status: 'pending', updated_at: iso(3 * 3600 * 1000) }, { now: NOW }), 'incomplete', 'старий pending');
  assert.equal(c.monoConnectionState({ status: 'pending' }, { now: NOW }), 'incomplete', 'час спроби невідомий (колонка не читається, запиту на цьому пристрої нема)');
  assert.equal(c.monoConnectionState({ status: 'pending' }), 'incomplete');
  assert.equal(c.monoConnectionState({ status: 'pending' }, { now: NOW, lastAttemptAt: NOW - 20000 }), 'connecting', 'запит на цьому пристрої 20 с тому');
  assert.equal(c.monoConnectionState({ status: 'pending' }, { now: NOW, lastAttemptAt: NOW - 200000 }), 'incomplete');
  assert.equal(c.monoConnectionState({ status: 'pending' }, { now: NOW, lastAttemptAt: null }), 'incomplete', 'відповідь на запит уже прийшла');
  assert.equal(c.monoConnectionState({ status: 'pending', updated_at: iso(-5000) }, { now: NOW }), 'incomplete', 'час у майбутньому (розбіжність годинників) не вважається свіжим');
  assert.equal(c.monoConnectionState({ status: 'error' }), 'error');
});
test('екран Monobank: стани connecting/incomplete у розмітці; запит читає лише видані колонки (без updated_at)', function(){
  assert.match(SRC, /st === 'incomplete' \? \{ label: 'Підключення не завершено', dot: 'err' \}/);
  assert.match(SRC, /st === 'connecting' \? \{ label: 'Стан', detail: 'Підключаю…', dot: true \}/);
  assert.match(SRC, /if\(st === 'error' \|\| st === 'incomplete'\) stateRows\.push\(monoRowHtml\(\{ label: 'Оновити токен', action: 'refresh-token'/);
  assert.equal((SRC.match(/from\('mono_connections'\)\.select\('([^']*)'\)/g) || []).every(function(x){ return x.indexOf('updated_at') === -1 && x.indexOf('created_at') === -1; }), true, 'ролі authenticated не видано SELECT(updated_at): запит із ним зламав би весь екран');
});
test('formatLastEvent: сьогодні, HH:MM / вчора / дата / немає', function(){
  const now = new Date(2026, 9, 12, 18, 0);
  assert.equal(c.formatLastEvent(new Date(2026, 9, 12, 14, 32), now), 'сьогодні, 14:32');
  assert.equal(c.formatLastEvent(new Date(2026, 9, 11, 23, 59), now), 'вчора');
  assert.equal(c.formatLastEvent(new Date(2026, 9, 5, 9, 0), now), '5 жовтня');
  assert.equal(c.formatLastEvent(null, now), 'немає');
  assert.equal(c.formatLastEvent('нісенітниця', now), 'немає');
  assert.equal(c.formatLastEvent(new Date(2026, 9, 12, 0, 1), new Date(2026, 9, 12, 0, 5)), 'сьогодні, 00:01');
});
test('monoAccountLabel/Detail: «•••• 1234», тип картки, скарбничка', function(){
  assert.equal(c.monoAccountLabel({ masked_pan: '537541******1234' }), '•••• 1234');
  assert.equal(c.monoAccountLabel({ masked_pan: '', is_jar: true }), 'Скарбничка');
  assert.equal(c.monoAccountDetail({ account_type: 'black' }), 'Чорна');
  assert.equal(c.monoAccountDetail({ account_type: 'white' }), 'Біла');
  assert.equal(c.monoAccountDetail({ is_jar: true }), 'скарбничка');
});

// ---------- охорона токена ----------
function block(name){ const m = SRC.match(new RegExp('async function ' + name + '\\(\\)\\{([\\s\\S]*?)\\n\\}\\n')); assert.ok(m, name); return m[1]; }
const monoRegionRaw = SRC.slice(SRC.indexOf('/* ============ Monobank: екран підключення'), SRC.indexOf('function showTextToast(text, kind){'));
const monoRegion = monoRegionRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
test('C1: токен ніде не зберігається і не логується: немає localStorage/sessionStorage/console/innerHTML з токеном у блоці MB-3', function(){
  assert.ok(monoRegion.length > 3000);
  assert.ok(!/localStorage|sessionStorage|indexedDB|console\./.test(monoRegion), 'сховища/консоль у блоці Monobank');
  const connect = block('onMonoConnectTap');
  assert.ok(!/pushDebugEvent\([^)]*raw/.test(connect), 'токен не йде в рекордер');
  assert.ok(!/showTextToast\([^)]*raw/.test(connect));
  assert.ok(!/innerHTML[^;]*raw/.test(connect));
  // події рекордера — лише ok/errorCode
  const events = [...monoRegion.matchAll(/type: 'mono-(connect|disconnect)'[^}]*\}/g)].map(function(m){ return m[0]; });
  assert.ok(events.length >= 3);
  events.forEach(function(e){ assert.ok(!/token|raw/.test(e), e); });
});
test('C1: поле очищується ДО відповіді (до виклику invoke), кнопка вимкнена на час запиту', function(){
  const connect = block('onMonoConnectTap');
  assert.ok(connect.indexOf("input.value = ''") !== -1 && connect.indexOf("input.value = ''") < connect.indexOf('functions.invoke'));
  assert.match(connect, /if\(monoState\.busy\) return;/);
  assert.match(SRC, /\(monoState\.busy \? ' disabled' : ''\)/);
});
test('C1: поле токена — абстрактний id і атрибути без автокорекції', function(){
  assert.match(SRC, /id="fldmono1" class="mono-token-input" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Вставте з буфера"/);
  assert.ok(!/(name|phone|tel|mail|addr|user|login|first|last|fio|contact)/i.test('fldmono1'));
});
test('C2: помилки показуються через monoErrorMessage; код з тіла відповіді (error.context) читається', function(){
  const connect = block('onMonoConnectTap');
  assert.match(connect, /monoErrorMessage\(code\)/);
  assert.match(SRC, /err\.context\.json\(\)/);
});
test('C3: відключення — діалог (Скасувати основна, небезпечна «Відключити») і action:disconnect', function(){
  assert.match(SRC, /confirmBtn\.textContent = 'Відключити';/);
  assert.match(SRC, /body: \{ action: 'disconnect' \}/);
  assert.match(SRC, /Нові операції надходити не будуть\. Уже отримані «Вхідні» залишаться\./);
});

// ---------- C4: перемикач картки ----------
test('C4: перемикач картки — миттєво, update({tracked}) за власним рядком, відкат з тостом при помилці', async function(){
  const calls = [];
  const state = { accounts: [{ id: 'acc-1', tracked: true }] };
  let failNext = true;
  const g = {
    monoState: state, safeId: function(x){ return String(x); }, renders: 0, toasts: [],
    renderMonoScreen: function(){ g.renders++; },
    showTextToast: function(t){ g.toasts.push(t); },
    getSupabaseClient: function(){ return { from: function(){ return { update: function(v){ calls.push(v); return { eq: async function(){ return { error: failNext ? { message: 'x' } : null }; } }; } }; } }; },
  };
  const ctx = buildSandbox(g, ['onMonoToggleAccount']);
  const btn = { getAttribute: function(){ return 'acc-1'; } };
  await ctx.onMonoToggleAccount(btn);
  assert.deepEqual(j(calls), [{ tracked: false }]);
  assert.equal(state.accounts[0].tracked, true);       // відкат
  assert.equal(g.toasts.length, 1);
  failNext = false;
  await ctx.onMonoToggleAccount(btn);
  assert.equal(state.accounts[0].tracked, false);       // збережено
  assert.equal(g.toasts.length, 1);
});
test('C5: рядок «Monobank» у «Сервісі», екран без ✕, закриття при перемиканні вкладки', function(){
  assert.match(SRC, /id="mono-btn" onclick="openMonoScreen\(\)"/);
  assert.match(SRC, /if\(isMonoOpen\) closeMonoScreen\(\);/);
  const screen = SRC.slice(SRC.indexOf('<div class="mono-screen hidden"'), SRC.indexOf('<div id="mono-body"></div>'));
  assert.ok(!/drawer-close|✕/.test(screen));
  assert.match(screen, /<span>Сервіс<\/span>/);
});
test('екранування: усі значення з даних у блоці Monobank проходять escapeHtml/escapeAttr/safeId', function(){
  assert.match(SRC, /escapeHtml\(o\.label\)/);
  assert.match(SRC, /escapeHtml\(o\.detail\)/);
  assert.match(SRC, /escapeAttr\(safeId\(o\.switchFor\)\)/);
});
