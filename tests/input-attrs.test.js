// Rev 2.28.1 (C) — охоронний тест: жоден текстовий input/textarea не має id/name із підрядками, що викликають панель iOS "Автозаповнити контакт" (ROADMAP 6D.136–141).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['INPUT_ATTR_FORBIDDEN', 'forbiddenInputAttr']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));
const SKIP_TYPES = ['checkbox', 'radio', 'hidden', 'date', 'file', 'range', 'submit', 'button', 'color', 'time', 'month'];
// Перелік винятків ПОРОЖНІЙ (за ТЗ).
const EXCEPTIONS = [];

function textFields(){
  const out = [];
  for(const m of SRC.matchAll(/<(input|textarea)\b([^>]*)>/g)){
    const attrs = m[2];
    const get = a => { const r = new RegExp('\\b' + a + '\\s*=\\s*"([^"]*)"').exec(attrs); return r ? r[1] : null; };
    const type = (get('type') || 'text').toLowerCase();
    if(m[1] === 'input' && SKIP_TYPES.includes(type)) continue;
    // згадки <input> у коментарях (// … або * …) — не поля
    const lineStart = SRC.lastIndexOf('\n', m.index) + 1;
    if(/^\s*(\/\/|\*|<!--)/.test(SRC.slice(lineStart, m.index))) continue;
    // статична частина id до шаблонного ${...}
    out.push({ tag: m[1], type, id: get('id'), name: get('name'), line: SRC.slice(0, m.index).split('\n').length });
  }
  return out;
}

test('forbiddenInputAttr: знаходить заборонені підрядки без урахування регістру', () => {
  assert.equal(j("forbiddenInputAttr('f-name')"), 'name');
  assert.equal(j("forbiddenInputAttr('Cloud-EMAIL')"), 'mail');
  assert.equal(j("forbiddenInputAttr('userPhone')"), 'phone');
  assert.equal(j("forbiddenInputAttr('expfielda7')"), null);
  assert.equal(j("forbiddenInputAttr('edtfielda1-3f2a9c')"), null);
  assert.equal(j("forbiddenInputAttr('')"), null);
  assert.equal(j("forbiddenInputAttr(null)"), null);
  assert.deepEqual(j('INPUT_ATTR_FORBIDDEN'), ['name', 'phone', 'tel', 'mail', 'addr', 'user', 'login', 'first', 'last', 'fio', 'contact']);
});

test('жоден текстовий input/textarea у розмітці й JS-шаблонах не має id/name із забороненими підрядками (винятків немає)', () => {
  const fields = textFields();
  assert.ok(fields.length >= 18, 'знайдено полів: ' + fields.length);
  const bad = [];
  fields.forEach(f => {
    const staticId = f.id ? f.id.split('${')[0] : null; // шаблонна частина — uuid, а не слова
    [staticId, f.name].forEach(v => { const hit = v && ex ? j(`forbiddenInputAttr(${JSON.stringify(v)})`) : null; if(hit && !EXCEPTIONS.includes(v)) bad.push(`${v} (рядок ${f.line}, "${hit}")`); });
  });
  assert.deepEqual(bad, []);
  assert.deepEqual(EXCEPTIONS, [], 'перелік винятків порожній');
});

test('JS-створені input/textarea (createElement) не виставляють id/name із забороненими підрядками', () => {
  for(const m of SRC.matchAll(/createElement\('(input|textarea)'\)([\s\S]{0,400}?)(?=\n\s*\n|\n\s*(?:const|let|function)\b)/g)){
    for(const a of m[2].matchAll(/\.(?:id|name)\s*=\s*'([^']+)'/g)) assert.equal(j(`forbiddenInputAttr(${JSON.stringify(a[1])})`), null, a[1]);
  }
  assert.match(SRC, /el\.id = 'kb-focus-proxy'/);
});

test('проміжне поле (kb-focus-proxy) не успадковує id/name цільового і саме не містить заборонених підрядків', () => {
  assert.equal(j("forbiddenInputAttr('kb-focus-proxy')"), null);
  const i = SRC.indexOf('const KB_PROXY_COPIED_ATTRS');
  const list = SRC.slice(i, SRC.indexOf('];', i));
  assert.ok(!/'id'|'name'/.test(list), 'id/name не в списку копійованих атрибутів');
  assert.match(SRC, /НЕ копіюємо id\/\s*name\//);
});

test('Журнал: поле "Назва" редагування записів має абстрактний id edtfielda1-<id>; усі посилання оновлені; старих id нема', () => {
  assert.ok(!/edit-name-/.test(SRC.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')), 'старий id edit-name- лишився в коді');
  assert.ok(!/getElementById\('cloud-email'\)|id="cloud-email"/.test(SRC), 'старий cloud-email лишився');
  assert.match(SRC, /id="edtfielda1-\$\{safeId\(e\.id\)\}"/);
  assert.match(SRC, /fld-label-like">Назва<\/span>/); // Rev 2.32.8 (A): підпис без label for
  assert.match(SRC, /getElementById\('edtfielda1-'\+id\)/);
  assert.match(SRC, /flashField\('edtfielda1-'\+id\)/);
  assert.match(SRC, /id="cldfielda1"/);
  assert.match(SRC, /getElementById\('cldfielda1'\)/);
});

test('input-attrs-audit: пишеться при старті запису; allowlist містить inputsTotal/inputsBad/badIds', () => {
  assert.match(SRC, /if\(typeof recordInputAttrsAudit === 'function'\) recordInputAttrsAudit\(\);/);
  ['inputsTotal', 'inputsBad', 'badIds'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
});

// ---------- Rev 2.31.4 (C): розширений аудит ----------
const KNOWN_TEXT_FIELD_IDS = ['expfielda7', 'f-amount', 'journal-search-input', 'debug-record-scenario', 'cldfielda1', 'cloud-password', 'cddfielda1', 'cdd-limit', 'cdd-balance', 'cdd-minpay',
  'iddfielda1', 'idd-initial', 'idd-due-day', 'idd-balance', 'idd-pay', 'ind-amount', 'app-modal-input', 'app-modal-amount-input', 'edtfielda1-', 'edit-amount-'];

test('інвентар текстових полів зафіксований: нове поле в розмітці/шаблоні змушує свідомо додати його сюди й перевірити id/name (список виявлено відкриттям усіх модалок і шторок у preview)', () => {
  const ids = textFields().map(f => (f.id || '').split('${')[0]).sort();
  assert.deepEqual(ids, KNOWN_TEXT_FIELD_IDS.slice().sort(), 'зміна переліку полів: оновіть KNOWN_TEXT_FIELD_IDS після перевірки id/name на заборонені підрядки');
  KNOWN_TEXT_FIELD_IDS.forEach(id => assert.equal(j(`forbiddenInputAttr(${JSON.stringify(id)})`), null, id));
});

test('uuid у динамічних id не може містити заборонених підрядків (hex-символи 0-9a-f vs підрядки з не-hex літерами)', () => {
  const hex = new Set('0123456789abcdef-'.split(''));
  j('INPUT_ATTR_FORBIDDEN').forEach(w => assert.ok([...w].some(ch => !hex.has(ch)), w + ' не може вийти з uuid'));
});

test('усі setAttribute("id"|"name", …) і .id =/.name = у JS, а також createElement("input"|"textarea"), не створюють id/name із заборонених підрядків', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  for(const m of code.matchAll(/setAttribute\('(?:id|name)',\s*'([^']+)'\)/g)) assert.equal(j(`forbiddenInputAttr(${JSON.stringify(m[1])})`), null, m[1]);
  for(const m of code.matchAll(/\.(?:id|name)\s*=\s*'([^'$]+)'/g)) assert.equal(j(`forbiddenInputAttr(${JSON.stringify(m[1])})`), null, m[1]);
  const creators = [...code.matchAll(/createElement\('(input|textarea)'\)/g)].length;
  assert.ok(creators >= 3, 'знайдено createElement input/textarea: ' + creators);
});

test('input-focus-audit: на focusin текстового поля під час запису; лише атрибути/статичні підписи, без значення; uuid замасковано; є в allowlist', () => {
  const h = SRC.slice(SRC.indexOf('function inputFieldLabelText'), SRC.indexOf('function attachDebugRecorderListeners'));
  assert.match(h, /type: 'input-focus-audit'/);
  assert.ok(!/\.value\b/.test(h), 'значення поля не читається');
  assert.ok(!/\.focus\(|\.blur\(|setAttribute|classList|\.style\./.test(h), 'лише читання');
  assert.match(h, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/, 'uuid маскується');
  assert.match(SRC, /on\(document, 'focusin', onInputFocusAudit, true\);/);
  ['fieldId', 'fieldName', 'fieldType', 'fieldAutocomplete', 'fieldInputmode', 'fieldAria', 'fieldPlaceholder', 'fieldLabel', 'fieldHasForm', 'fieldForbidden'].forEach(f => {
    assert.match(h, new RegExp('\\b' + f + '\\b'));
    assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'"));
  });
});

test('правило проєкту записано в CLAUDE.md, docs/ROADMAP.md і docs/TESTING.md', () => {
  const root = path.join(__dirname, '..');
  const rule = 'Текстові поля вводу не повинні викликати панель iOS «Автозаповнити контакт»';
  ['CLAUDE.md', 'docs/ROADMAP.md', 'docs/TESTING.md'].forEach(f => assert.ok(fs.readFileSync(path.join(root, f), 'utf8').includes(rule), f));
});
