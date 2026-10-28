// Rev 2.32.169 (FIELD-GUARD) — захисні атрибути полів, створених у JS, в одному місці; рекордер field-attrs (лише режим розробника).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function fakeInput(id, extra){
  const attrs = Object.assign({}, extra || {});
  return { id, tagName: 'INPUT', type: 'text', attrs, setAttribute(k, v){ attrs[k] = String(v); }, getAttribute(k){ return k in attrs ? attrs[k] : null; }, hasAttribute(k){ return k in attrs; } };
}
const g = buildSandbox({}, ['INPUT_ATTR_FORBIDDEN', 'forbiddenInputAttr', 'applyFieldGuardAttrs']);

test('applyFieldGuardAttrs: повний набір (autocomplete/autocorrect/autocapitalize off, spellcheck false, aria-label, enterkeyhint, нейтральний name x-<id>)', function(){
  const el = fakeInput('fldstr3');
  assert.equal(g.applyFieldGuardAttrs(el, { label: 'Слово' }), el);
  assert.deepEqual(JSON.parse(JSON.stringify(el.attrs)), { autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Слово', enterkeyhint: 'done', name: 'x-fldstr3' });
  const el2 = fakeInput('fldstr4'); g.applyFieldGuardAttrs(el2, { label: 'Назва', enterkeyhint: 'next' });
  assert.equal(el2.attrs.enterkeyhint, 'next');
});
test('name: нейтральний — без заборонених підрядків (name, phone, tel, mail, addr, user, login, first, last, fio, contact); порожній id або заборонений id — name не ставиться', function(){
  const ok = fakeInput('fldstr3'); g.applyFieldGuardAttrs(ok);
  assert.equal(g.forbiddenInputAttr(ok.attrs.name), null); assert.ok(!/name|назва|ім'я/i.test(ok.attrs.name));
  const bad = fakeInput('user-field'); g.applyFieldGuardAttrs(bad); assert.ok(!('name' in bad.attrs), 'заборонений підрядок у id');
  const empty = fakeInput(''); g.applyFieldGuardAttrs(empty); assert.ok(!('name' in empty.attrs));
  assert.ok(!('aria-label' in ok.attrs), 'без підпису aria-label не вигадується');
  assert.equal(g.applyFieldGuardAttrs(null), null);
});
test('openStructForm: усі поля (слово, назва категорії, підкатегорії) створюються через applyFieldGuardAttrs; старий розрізнений набір прибрано', function(){
  const body = SRC.slice(SRC.indexOf('function openStructForm(cfg){'), SRC.indexOf('function closeStructForm(){'));
  assert.match(body, /applyFieldGuardAttrs\(input, \{ label: cfg\.field\.label, enterkeyhint: 'done' \}\)/);
  assert.ok(!/input\.setAttribute\('autocomplete'/.test(body));
  assert.match(body, /input\.id = 'fldstr3'/);
  assert.equal((SRC.match(/createElement\('input'\)/g) || []).length, 6, 'JS-фабрики input: перемикач (checkbox), час, поле форми, проміжне поле (не чіпали), службовий зонд, поле «Інше» у «Перевірках» (Rev 2.32.190; через applyFieldGuardAttrs)');
});
test('клавіатурна логіка не чіпана: проміжне поле копіює ті самі атрибути, id/стиль/кількість атрибутів без змін', function(){
  assert.match(SRC, /const KB_PROXY_COPIED_ATTRS = \['inputmode', 'enterkeyhint', 'autocapitalize', 'autocorrect', 'autocomplete', 'spellcheck', 'pattern', 'maxlength', 'min', 'max', 'step', 'lang', 'dir'\];/);
  assert.match(SRC, /el\.id = 'kb-focus-proxy';\s+el\.setAttribute\('aria-hidden', 'true'\);\s+el\.setAttribute\('tabindex', '-1'\);/);
  assert.equal(g.forbiddenInputAttr('kb-focus-proxy'), null);
});

// ---- рекордер ----
const NAMES = ['FIELD_ATTRS_WATCHED', 'fieldAttrsSnapshot', 'onFieldAttrsFocusIn', 'DEBUG_EVENT_ALLOWLIST', 'sanitizeDebugEvent'];
function fld(id, attrs, opts){
  const o = opts || {};
  const el = { id, tagName: 'INPUT', type: o.type || 'text', attrs: attrs || {}, parentNode: o.parent || { className: 'sf-row' },
    getAttribute(k){ return k in this.attrs ? this.attrs[k] : null; }, hasAttribute(k){ return k in this.attrs; },
    closest(sel){ return o.scope === undefined ? { id: 'struct-drawer' } : o.scope; } };
  return el;
}
function recorder(active){
  const events = [];
  const c = buildSandbox({ debugRecordingActive: active, debugRecordingStartedAt: 0, performance: { now: () => 5 }, pushDebugEvent: e => events.push(c2e(e)) }, NAMES.slice(0, 3));
  const c2e = e => JSON.parse(JSON.stringify(e));
  return { c, events };
}
test('field-attrs: атрибути без значень, ознака проміжного поля й id пов\'язаного поля; поза «Структурою»/«Словником» — нічого', function(){
  const { c, events } = recorder(true);
  c.onFieldAttrsFocusIn({ target: fld('fldstr3', { autocomplete: 'off', name: 'x-fldstr3', 'aria-label': 'Слово', value: 'СЕКРЕТНЕ' }) });
  assert.equal(events.length, 1); const e = events[0];
  assert.equal(e.type, 'field-attrs'); assert.equal(e.fieldId, 'fldstr3'); assert.equal(e.fieldScreen, 'struct-form'); assert.equal(e.fieldProxy, false); assert.equal(e.fieldLinked, null);
  assert.equal(e.fieldAttrs, 'autocomplete=off|name=x-fldstr3|aria-label=Слово'); assert.ok(!/СЕКРЕТНЕ/.test(JSON.stringify(e)), 'значення поля не пишеться');
  // проміжне поле з пов'язаним
  const real = { id: 'fldstr3' };
  const host = { className: 'sf-row', querySelector: () => real };
  c.onFieldAttrsFocusIn({ target: fld('kb-focus-proxy', { autocomplete: 'off' }, { parent: host }) });
  assert.equal(events[1].fieldProxy, true); assert.equal(events[1].fieldLinked, 'fldstr3');
  // вкладка «Словник»: пошук
  c.onFieldAttrsFocusIn({ target: fld('fldstr2', { enterkeyhint: 'search' }, { type: 'search', scope: { id: 'struct-tab-panel-dictionary' } }) });
  assert.equal(events[2].fieldScreen, 'dictionary'); assert.equal(events[2].fieldType, 'search');
  // поза областю
  c.onFieldAttrsFocusIn({ target: fld('f-amount', {}, { scope: null }) }); assert.equal(events.length, 3);
  c.onFieldAttrsFocusIn({ target: { tagName: 'DIV' } }); assert.equal(events.length, 3);
});
test('field-attrs: лише режим розробника (запису нема — нічого не збирається); довгі значення обрізаються; ключі події в allowlist', function(){
  const off = recorder(false); off.c.onFieldAttrsFocusIn({ target: fld('fldstr3', { autocomplete: 'off' }) }); assert.equal(off.events.length, 0);
  const on = recorder(true); on.c.onFieldAttrsFocusIn({ target: fld('fldstr3', { 'aria-label': 'x'.repeat(100) }) });
  assert.equal(on.events[0].fieldAttrs, 'aria-label=' + 'x'.repeat(40));
  const allow = evalInSandbox(buildSandbox({}, ['DEBUG_EVENT_ALLOWLIST']), 'DEBUG_EVENT_ALLOWLIST');
  Object.keys(on.events[0]).forEach(k => assert.ok(Array.from(allow).includes(k), 'у allowlist: ' + k));
  assert.match(SRC, /document\.addEventListener\('focusin', onFieldAttrsFocusIn, true\);/);
});
