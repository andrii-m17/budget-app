// Rev 2.32.299 (LOGIN-RET): вхід по Return. Пароль: Return = вхід рівно один раз; пошта: Return → пароль лише без kb-мітки (iPhone: kbEnterKey);
// захист від повторного входу (Return + кнопка); розмітка й правила полів не змінені.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function env(o) {
  o = o || {};
  const e = { signCalls: 0, blurs: 0, focused: [], resolve: null, pushed: [], errText: '', timers: [] };
  const els = {
    'cloud-auth-error': { textContent: '' },
    cldfielda1: { id: 'cldfielda1', value: o.email === undefined ? 'a@x.test' : o.email, getAttribute: function (n) { return n === 'data-kb-enter' ? (o.kbMark || null) : null; }, blur: function () { e.blurs++; } },
    'cloud-password': { id: 'cloud-password', value: o.password === undefined ? 'pw' : o.password, getAttribute: function () { return null; }, blur: function () { e.blurs++; }, focus: function (opt) { e.focused.push(opt || null); } },
  };
  e.els = els;
  const globals = {
    cloudSignInBusy: false,
    setTimeout: function (fn, ms) { e.timers.push({ fn: fn, ms: ms, off: false }); return e.timers.length; },
    clearTimeout: function (id) { if (e.timers[id - 1]) e.timers[id - 1].off = true; },
    document: { getElementById: function (id) { return els[id] || null; } },
    navigator: { onLine: o.online !== false },
    NEED_NETWORK_TEXT: 'Потрібна мережа.',
    setCloudAuthOffline: function () {}, pushDebugEvent: function (ev) { e.pushed.push(ev); },
    loadSupabaseSdk: async function () { if (o.sdkFail) throw new Error('sdk'); },
    getSupabaseClient: function () {
      return { auth: { signInWithPassword: function () {
        e.signCalls++;
        if (o.throwSign) return Promise.reject(new Error('мережа'));
        return new Promise(function (r) { e.resolve = function (v) { r(v || { error: null }); }; if (o.instant) r({ error: null }); });
      } } };
    },
  };
  e.c = buildSandbox(globals, ['CLOUD_SIGNIN_BUSY_MAX_MS', 'loginEnterKey', 'signInCloudAccount', 'signInCloudAccountRun']);
  return e;
}
const key = function (target, o) { const ev = Object.assign({ key: 'Enter', target: target, defaultPrevented: false, isComposing: false, shiftKey: false, prevented: 0 }, o || {}); ev.preventDefault = function () { ev.prevented++; ev.defaultPrevented = true; }; return ev; };
const tick = function () { return new Promise(function (r) { setTimeout(r, 5); }); };

test('пароль: Return = вхід рівно один раз, поле втрачає фокус, подію погашено', async function () {
  const e = env();
  const ev = key(e.els['cloud-password']);
  e.c.loginEnterKey(ev);
  await tick();
  assert.equal(e.signCalls, 1); assert.equal(ev.prevented, 1); assert.equal(e.blurs, 1);
  e.resolve(); await tick();
});

test('пароль: другий Return, поки вхід триває, і дотик по кнопці під час входу ігноруються; після завершення вхід знову можливий', async function () {
  const e = env();
  e.c.loginEnterKey(key(e.els['cloud-password'])); await tick();
  e.c.loginEnterKey(key(e.els['cloud-password'])); await tick();
  e.c.signInCloudAccount(); await tick(); // «кнопка»
  assert.equal(e.signCalls, 1, 'Return + Return + кнопка = один виклик');
  e.resolve({ error: null }); await tick();
  assert.equal(e.els['cloud-password'].value, '', 'успішний вхід очищає пароль (як і раніше)');
  e.els['cloud-password'].value = 'pw';
  e.c.signInCloudAccount(); await tick();
  assert.equal(e.signCalls, 2, 'після завершення прапорець знято');
  e.resolve(); await tick();
});

test('прапорець «вхід триває» скидається після помилки сервера, мережевого винятку, збою SDK й порожніх полів', async function () {
  const a = env(); a.c.signInCloudAccount(); await tick(); a.resolve({ error: { message: 'Invalid', status: 400 } }); await tick();
  assert.match(a.els['cloud-auth-error'].textContent, /Не вдалося увійти/); a.c.signInCloudAccount(); await tick(); assert.equal(a.signCalls, 2);
  const b = env({ throwSign: true }); await b.c.signInCloudAccount().catch(function () {}); await b.c.signInCloudAccount().catch(function () {}); assert.equal(b.signCalls, 2, 'виняток: прапорець знято');
  const c = env({ sdkFail: true }); await c.c.signInCloudAccount(); await c.c.signInCloudAccount(); assert.equal(c.signCalls, 0);
  assert.match(c.els['cloud-auth-error'].textContent, /Немає з'єднання/);
  const d = env({ email: '' }); await d.c.signInCloudAccount(); assert.equal(d.els['cloud-auth-error'].textContent, 'Вкажіть email і пароль.'); assert.equal(d.signCalls, 0);
  const f = env({ online: false }); await f.c.signInCloudAccount(); assert.equal(f.els['cloud-auth-error'].textContent, 'Потрібна мережа.'); assert.equal(f.signCalls, 0);
  await f.c.signInCloudAccount(); assert.equal(f.els['cloud-auth-error'].textContent, 'Потрібна мережа.', 'офлайн: прапорець не залипає');
});

test('завислий запит: прапорець знімається запобіжником 20 с (повторний вхід знову можливий); запобіжник прибирається після нормального завершення', async function () {
  const e = env();
  e.c.signInCloudAccount(); await tick();
  e.c.signInCloudAccount(); await tick();
  assert.equal(e.signCalls, 1, 'поки запит у польоті, повтор ігнорується');
  const guard = e.timers.filter(function (x) { return x.ms === 20000; });
  assert.equal(guard.length, 1); assert.equal(guard[0].off, false);
  guard[0].fn(); // минуло 20 с без відповіді
  e.c.signInCloudAccount(); await tick();
  assert.equal(e.signCalls, 2, 'після запобіжника вхід знову можливий');
  e.resolve(); await tick();
  const ok = env({ instant: true }); await ok.c.signInCloudAccount(); await tick();
  assert.equal(ok.timers.filter(function (x) { return x.ms === 20000; })[0].off, true, 'запобіжник скасовано після завершення');
});

test('пароль: не-Enter, Shift/Ctrl+Enter, складання тексту (IME), уже погашена подія нічого не роблять', async function () {
  const e = env();
  [key(e.els['cloud-password'], { key: 'a' }), key(e.els['cloud-password'], { shiftKey: true }), key(e.els['cloud-password'], { ctrlKey: true }), key(e.els['cloud-password'], { isComposing: true }), key(e.els['cloud-password'], { defaultPrevented: true })].forEach(function (ev) { e.c.loginEnterKey(ev); });
  await tick();
  assert.equal(e.signCalls, 0); assert.equal(e.blurs, 0);
});

test('порожнє поле пароля: Return показує підказку, а не сервер', async function () {
  const e = env({ password: '' });
  e.c.loginEnterKey(key(e.els['cloud-password'])); await tick();
  assert.equal(e.signCalls, 0); assert.equal(e.els['cloud-auth-error'].textContent, 'Вкажіть email і пароль.');
});

test('пошта: без kb-мітки Return переводить фокус на пароль без прокрутки; з міткою kbHintsApply (iPhone) обробник виходить, нічого не гасить', function () {
  const e = env();
  const ev = key(e.els.cldfielda1);
  e.c.loginEnterKey(ev);
  assert.equal(ev.prevented, 1); assert.deepEqual(JSON.parse(JSON.stringify(e.focused)), [{ preventScroll: true }]); assert.equal(e.signCalls, 0);
  const k = env({ kbMark: 'next' });
  const ev2 = key(k.els.cldfielda1);
  k.c.loginEnterKey(ev2);
  assert.equal(ev2.prevented, 0, 'подію не гасимо: kbEnterKey зробить перехід'); assert.equal(k.focused.length, 0);
  const none = env(); none.els['cloud-password'] = undefined; delete none.els['cloud-password'];
  none.c.loginEnterKey(key(none.els.cldfielda1)); // поля пароля немає в DOM (cloud-lazy): без винятків
});

test('розмітка: id/type/autocomplete без змін, без <form>, пароль має enterkeyhint="go", пошта БЕЗ enterkeyhint (kbHintsApply бачить поле), обидва мають loginEnterKey', function () {
  const email = SRC.match(/<input type="email" id="cldfielda1"[^>]*>/)[0];
  const pw = SRC.match(/<input type="password" id="cloud-password"[^>]*>/)[0];
  assert.match(email, /autocomplete="username"/); assert.ok(!/enterkeyhint/.test(email), 'пошта без enterkeyhint у розмітці: kbHintsApply ставить next сам');
  assert.match(pw, /autocomplete="current-password"/); assert.match(pw, /enterkeyhint="go"/);
  assert.match(email, /onkeydown="loginEnterKey\(event\)"/); assert.match(pw, /onkeydown="loginEnterKey\(event\)"/);
  assert.ok(!/\sname=/.test(email) && !/\sname=/.test(pw), 'нових name немає');
  const block = SRC.slice(SRC.indexOf('<div id="cloud-login-form"'), SRC.indexOf('<!-- ================= Форми «Структури»'));
  assert.ok(!/<form\b/i.test(block), 'форма входу лишається без <form>');
  assert.match(block, /<button type="button" class="submit-btn pill" onclick="signInCloudAccount\(\)">Увійти<\/button>/, 'кнопка без змін');
  assert.equal((SRC.match(/<input type="(email|password)" id="(cldfielda1|cloud-password)"/g) || []).length, 2);
});

test('охоронні: клавіатурний модуль не змінено (kbHintsApply досі пропускає пароль і лишає поля без enterkeyhint; kbEnterKey без мітки go)', function () {
  const hints = SRC.slice(SRC.indexOf('function kbHintsApply'), SRC.indexOf('function kbEnterKey'));
  assert.match(hints, /\(el\.type \|\| ''\)\.toLowerCase\(\) === 'password'/);
  assert.match(hints, /if\(ek && !el\.hasAttribute\('data-kb-enter'\)\) return;/);
  const enter = SRC.slice(SRC.indexOf('function kbEnterKey'), SRC.indexOf("document.addEventListener('keydown', kbEnterKey);"));
  assert.ok(!/signInCloudAccount|cloud-password/.test(enter), 'kbEnterKey про вхід нічого не знає');
});
