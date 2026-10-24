// Rev 2.32.171 (OCH-MODEL) — модель ОЧ: стандартний платіж, овали, сегменти за банком, форма, «Далі», синхронізація. Синтетичні назви й суми.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const CSS = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const j = v => JSON.parse(JSON.stringify(v));
const g = buildSandbox({ parseAmount: v => Number(String(v).replace(/[\s ]/g, '')), ppPad: undefined }, ['ppPad', 'ppDaysInMonth', 'ppClampDate', 'OCH_FIRST_PAYMENTS', 'OCH_PAY_MODES', 'ochModelDiffers', 'applyOchModelFromRow', 'ochDefaultSegments', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'OCH_OVALS_MAX', 'ochOvalsModel', 'ochOvalsHtml', 'ochDueDayFor', 'ochCalcAutoPay', 'ochEnterNext', 'FIELD_HINT_MS', 'clearFieldHint', 'hintField', 'ochCondSummary', 'ochBalanceDiffers']);

test('стандартний платіж: payment, інакше round(сума ÷ місяці); без даних — null; однаковий для всіх банків', function(){
  assert.equal(g.installmentStandardPayment({ initialAmount: 3000, termMonths: 3 }), 1000);
  assert.equal(g.installmentStandardPayment({ initialAmount: 40000, termMonths: 36 }), 1111);
  assert.equal(g.installmentStandardPayment({ initialAmount: 40000, termMonths: 36, payment: 1200 }), 1200);
  assert.equal(g.installmentStandardPayment({ initialAmount: 40000, termMonths: null }), null);
  assert.equal(g.installmentStandardPayment({ initialAmount: null, termMonths: 12 }), null);
  assert.equal(g.installmentStandardPayment({ initialAmount: 3000, termMonths: 3, payment: 0 }), 1000, 'нульовий payment = порожній');
  assert.equal(g.installmentStandardPayment(null), null);
  assert.equal(g.ochCalcAutoPay('28 119', '15'), 1875); assert.equal(g.ochCalcAutoPay('', '15'), null); assert.equal(g.ochCalcAutoPay('1000', '0'), null);
});
test('лишилось платежів = ceil(залишок ÷ платіж); залишок 0 → 0; невідомо → null; останній платіж = залишок; переплата не зменшує стандартний платіж', function(){
  assert.equal(g.installmentPaymentsLeft(2000, 1000), 2); assert.equal(g.installmentPaymentsLeft(2001, 1000), 3);
  assert.equal(g.installmentPaymentsLeft(500, 1000), 1, 'платіж більший за залишок — один останній');
  assert.equal(g.installmentPaymentsLeft(0, 1000), 0); assert.equal(g.installmentPaymentsLeft(null, 1000), null); assert.equal(g.installmentPaymentsLeft(1000, 0), null);
  assert.equal(g.installmentPayAmount(1000, 2500), 1000); assert.equal(g.installmentPayAmount(1000, 400), 400, 'останній платіж = залишок');
  assert.equal(g.installmentPayAmount(1000, 0), 1000); assert.equal(g.installmentPayAmount(1000, null), 1000); assert.equal(g.installmentPayAmount(0, 400), null);
  assert.equal(g.installmentStandardPayment({ initialAmount: 12000, termMonths: 12 }), 1000, 'переплата 5000 не змінює стандартний платіж');
});
test('овали: 3, 10, 14, 24, 36 місяців; порожнє term_months; перший місяць; платіж більший за залишок', function(){
  const m = (term, bal, pay) => j(g.ochOvalsModel(term, bal, pay));
  assert.deepEqual(m(3, 2000, 1000), { mode: 'ovals', total: 3, done: 1 });
  assert.deepEqual(m(10, 7000, 1000), { mode: 'ovals', total: 10, done: 3 });
  assert.deepEqual(m(14, 14000, 1000), { mode: 'ovals', total: 14, done: 0 }, 'перший місяць: платежів не було');
  assert.deepEqual(m(24, 12000, 1000), { mode: 'ovals', total: 24, done: 12 });
  const big = m(36, 18000, 1000); assert.equal(big.mode, 'ovals'); assert.equal(big.total, 24); assert.equal(big.done, 12, '> 24 місяців — 24 овали, кожен = term/24 місяців (без суцільної смуги)');
  assert.equal(m(25, 5000, 1000).mode, 'ovals'); assert.equal(m(25, 5000, 1000).total, 24); assert.equal(m(24, 5000, 1000).total, 24);
  assert.equal(m(36, 36000, 1000).done, 0, 'жодного платежу — жоден овал'); assert.equal(m(36, 35000, 1000).done, 1, 'перший платіж фарбує перший овал'); assert.equal(m(36, 0, 1000).done, 24, 'усе сплачено — усі');
  assert.deepEqual(m(null, 5000, 1000), { mode: 'none', total: 0, done: 0 }); assert.equal(m('', 5000, 1000).mode, 'none'); assert.equal(m(0, 5000, 1000).mode, 'none');
  assert.deepEqual(m(5, 400, 1000), { mode: 'ovals', total: 5, done: 4 }, 'платіж більший за залишок: лишився один платіж');
  assert.deepEqual(m(5, 0, 1000), { mode: 'ovals', total: 5, done: 5 }, 'залишок 0 — усі зафарбовані');
  assert.equal(m(5, 100000, 1000).done, 0, 'залишок більший за початковий: не нижче 0');
  assert.equal(m(5, 5000, null).mode, 'none', 'платежу нема — без смуги'); assert.equal(m(5, null, 1000).mode, 'none');
});
test('овали: HTML — кількість = term_months, зафарбовані .on, без підпису; > 24 суцільна; порожнє — порожній рядок', function(){
  const h = g.ochOvalsHtml(g.ochOvalsModel(10, 7000, 1000));
  assert.equal((h.match(/class="och-oval(?: on)?"/g) || []).length, 10); assert.equal((h.match(/och-oval on/g) || []).length, 3);
  assert.ok(/aria-hidden="true"/.test(h) && !/<span[^>]*>[^<]+<\/span>/.test(h.replace(/<span class="och-ovals" aria-hidden="true">/, '').replace(/<\/span>$/, '')), 'без текстового підпису');
  const s = g.ochOvalsHtml(g.ochOvalsModel(36, 18000, 1000)); assert.equal((s.match(/class="och-oval(?: on)?"/g) || []).length, 24, '36 місяців — поділки, не суцільна смуга'); assert.equal((s.match(/och-oval on/g) || []).length, 12); assert.ok(!/och-solid/.test(s));
  assert.equal(g.ochOvalsHtml(g.ochOvalsModel(null, 1, 1)), ''); assert.equal(g.ochOvalsHtml(null), '');
});
test('овали: CSS — висота 5 px, проміжок 2 px, flex:1 1 0; min-width:0; overflow:hidden; смуга однакової ширини ≈ 76 px (24% рядка, 48–90 px); унікальні класи och-*', function(){
  assert.match(CSS, /\.och-ovals\{ display:flex; gap:2px; width:100%; overflow:hidden;/);
  assert.match(CSS, /\.och-oval\{ display:block; flex:1 1 0; min-width:0; height:5px;/);
  assert.match(CSS, /\.och-solid\{ display:block; width:100%; height:5px;/);
  assert.match(CSS, /\.t-bar-h\.och-bar-h[^{]*\{ flex:0 0 24%; min-width:48px; max-width:90px; overflow:hidden; \}/);
  const names = [...CSS.matchAll(/\.(och-[a-z-]+)/g)].map(m => m[1]);
  names.forEach(n => assert.ok(!/^(field|row-2|drawer|t-|seg-)/.test(n)));
  // 3 овали розтягуються на всю смугу (flex:1 1 0 без фіксованої ширини)
  assert.ok(!/\.och-oval\{[^}]*(?<![-\w])width:/.test(CSS), 'ширина овала не фіксована');
  assert.equal((g.ochOvalsHtml(g.ochOvalsModel(3, 2000, 1000)).match(/<i /g) || []).length, 3);
});
test('сегменти за замовчуванням за назвою банку: Моно/Приват — «У день оформлення» + «Автоматично»; ПУМБ — «Наступного місяця» + «Вношу вручну»; решта — день оформлення + вручну', function(){
  const d = n => j(g.ochDefaultSegments(n));
  assert.deepEqual(d('Моно Ноутбук'), { firstPayment: 'same_day', payMode: 'auto' });
  assert.deepEqual(d('Приват iPhone'), { firstPayment: 'same_day', payMode: 'auto' });
  assert.deepEqual(d('ПУМБ Dyson'), { firstPayment: 'next_month', payMode: 'manual' });
  assert.deepEqual(d('Райффайзен Диван'), { firstPayment: 'same_day', payMode: 'manual' });
  assert.deepEqual(d('Sense Телефон'), { firstPayment: 'same_day', payMode: 'manual' });
  assert.deepEqual(d('Невідомий банк'), { firstPayment: 'same_day', payMode: 'manual' }); assert.deepEqual(d(''), { firstPayment: 'same_day', payMode: 'manual' });
  assert.deepEqual(d('mono Laptop'), { firstPayment: 'same_day', payMode: 'auto' }); assert.deepEqual(d('PUMB TV'), { firstPayment: 'next_month', payMode: 'manual' });
});
test('день платежу: число дати створення; 31 число в короткому місяці — останній день місяця (ppClampDate); без дати створення dueDay лишається', function(){
  assert.equal(g.ochDueDayFor('2026-08-31', 5), 31); assert.equal(g.ochDueDayFor('2026-05-04', null), 4);
  assert.equal(g.ochDueDayFor('', 15), 15); assert.equal(g.ochDueDayFor('сміття', 15), 15); assert.equal(g.ochDueDayFor('', null), null);
  assert.equal(g.ppClampDate('2026-02', 31), '2026-02-28'); assert.equal(g.ppClampDate('2028-02', 31), '2028-02-29'); assert.equal(g.ppClampDate('2026-04', 31), '2026-04-30'); assert.equal(g.ppClampDate('2026-10', 31), '2026-10-31');
});
test('«Далі» на клавіатурі: назва → сума → місяців → платіж/міс → кінець; Enter не відправляє форму', function(){
  const form = SRC.slice(SRC.indexOf('<div class="och-form">'), SRC.indexOf('Видалити ОЧ</button>'));
  const chain = {}; for(const m of form.matchAll(/id="([\w-]+)"[^>]*?onkeydown="ochEnterNext\(event, ('([\w-]+)'|null)\)"/g)) chain[m[1]] = m[3] || null;
  assert.deepEqual(chain, { iddfielda1: 'idd-initial', 'idd-initial': 'idd-term', 'idd-term': 'idd-pay', 'idd-pay': null });
  ['iddfielda1', 'idd-initial', 'idd-term'].forEach(id => assert.match(form, new RegExp('id="' + id + '"[^>]*enterkeyhint="next"')));
  assert.match(form, /id="idd-pay"[^>]*enterkeyhint="done"/);
  const focused = []; const doc = { getElementById: id => ({ focus: () => focused.push(id) }) };
  const c = buildSandbox({ document: doc }, ['ochEnterNext']); let prevented = 0, blurred = 0;
  c.ochEnterNext({ key: 'Enter', preventDefault: () => prevented++, target: { blur: () => blurred++ } }, 'idd-term'); assert.deepEqual(focused, ['idd-term']);
  c.ochEnterNext({ key: 'Enter', preventDefault: () => prevented++, target: { blur: () => blurred++ } }, null); assert.equal(blurred, 1); assert.equal(prevented, 2);
  c.ochEnterNext({ key: 'a', preventDefault: () => prevented++, target: {} }, 'x'); assert.equal(prevented, 2, 'інші клавіші не чіпає');
});
test('форма: розмітка — поля й сегменти за описом; без «Дати платежу», прогресу й підсумків; кнопки в одному ряду, закріплені; захисні атрибути; поля 34 px, підписи 10 px', function(){
  const form = SRC.slice(SRC.indexOf('<div class="och-form">'), SRC.indexOf('Видалити ОЧ</button>') + 30);
  ['Назва', 'Загальна сума', 'Місяців', 'Дата створення', 'Платіж/міс', 'Перший платіж', 'Списання', "Залишок за банком до платежу цього місяця (необов'язково)"].forEach(l => assert.ok(form.includes(l), l));
  ['У день оформлення', 'Наступного місяця', 'Автоматично', 'Вношу вручну', 'Оплатити', 'Зберегти', 'Видалити ОЧ'].forEach(l => assert.ok(form.includes(l), l));
  assert.ok(!/idd-due-day|Дата платежу|progress|t-bar|Разом/.test(form));
  assert.match(form, /<input type="date" id="idd-start"/);
  assert.match(form, /<div class="struct-tabs och-seg" id="idd-first"[^>]*>\s*<button type="button" class="struct-tab-btn active"/, 'сегменти — наявний компонент .struct-tabs');
  assert.match(form, /<div class="struct-tabs och-seg" id="idd-mode"[^>]*>\s*<button type="button" class="struct-tab-btn"[^>]*>Автоматично[\s\S]*?class="struct-tab-btn active"[^>]*>Вношу вручну/);
  assert.match(form, /<div class="och-actions">\s*<button type="button" class="installment-pay-btn"[^>]*>Оплатити<\/button>\s*<button type="button" class="submit-btn debt pill"[^>]*>Зберегти<\/button>\s*<\/div>/);
  for(const id of ['iddfielda1', 'idd-initial', 'idd-term', 'idd-pay', 'idd-balance']) assert.match(form, new RegExp('id="' + id + '"[^>]*autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"'));
  assert.match(CSS, /#installment-drawer \.och-form \.field input\{ height:34px; padding:0 12px; \}/);
  assert.match(CSS, /#installment-drawer \.och-form \.field label\{ font-size:10px;/);
  assert.match(CSS, /#installment-drawer \.och-actions\{ position:sticky; bottom:0;/);
});
test('«Зберегти» неактивна без змін (SAVE-DIRTY): у перелік полів додано нову модель (місяці, дата, платіж, сегменти); явний запис значень за замовчуванням лише після «Зберегти»', function(){
  assert.match(SRC, /inst: \[\['name', 'iddfielda1', 'txt'\], \['initial', 'idd-initial', 'amt'\], \['term', 'idd-term', 'txt'\], \['start', 'idd-start', 'txt'\], \['pay', 'idd-pay', 'amt'\], \['first', 'idd-first', 'seg'\], \['mode', 'idd-mode', 'seg'\], \['balance', 'idd-balance', 'amt'\]\]/);
  assert.match(SRC, /f\[2\] === 'seg' \? el\.getAttribute\('data-value'\)/);
  assert.match(SRC, /beginSaveGate\('inst', false\)/);
  const save = SRC.slice(SRC.indexOf('async function saveInstallmentDrawer'), SRC.indexOf('function deleteInstallmentFromDrawer'));
  assert.match(save, /acc\.payment = ochPayManual && stdPayVal > 0 \? stdPayVal : null;/);
  assert.match(save, /if\(rawStart\) acc\.dueDay = ochDueDayFor\(rawStart, acc\.dueDay\);/);
  assert.match(save, /const monthlyPayment = existingIdx>=0 \? debts\[existingIdx\]\.monthlyPayment : undefined;/);
  const open = SRC.slice(SRC.indexOf('function openInstallmentEditor'), SRC.indexOf('function openInstallmentEditor') + 4500);
  assert.match(open, /idd-balance'\)\.value = existing && existing\.balance != null \? formatThousands\(existing\.balance\) : ''/, '«Залишок за банком» — лише внесений факт, розрахунковий не підставляється');
});
test('синхронізація: усі п\'ять полів у select pull, update/insert push і 3 місцях застосування pull; порівняння null ≡ undefined', function(){
  assert.match(SRC, /'id,name,initial_amount,due_day,term_months,start_date,first_payment,pay_mode,payment,created_at,updated_at,deleted_at'/);
  assert.equal((SRC.match(/term_months: acc\.termMonths \?\? null, start_date: acc\.startDate \|\| null, first_payment: acc\.firstPayment \|\| null, pay_mode: acc\.payMode \|\| null, payment: acc\.payment \?\? null/g) || []).length, 3, 'push: update, reconcile-update, insert');
  assert.match(SRC, /applyOchModelFromRow\(byCloudId, row\);/); assert.match(SRC, /applyOchModelFromRow\(byName, row\);/); assert.match(SRC, /termMonths: row\.term_months \?\? null, startDate: row\.start_date \?\? null/);
  assert.equal(g.ochModelDiffers({}, { term_months: null, start_date: null, first_payment: null, pay_mode: null, payment: null }), false);
  assert.equal(g.ochModelDiffers({ termMonths: 12 }, { term_months: 12 }), false); assert.equal(g.ochModelDiffers({ termMonths: 12 }, { term_months: 10 }), true);
  assert.equal(g.ochModelDiffers({ payMode: 'auto' }, { pay_mode: 'manual' }), true);
  const acc = {}; g.applyOchModelFromRow(acc, { term_months: 15, start_date: '2026-05-04', first_payment: 'next_month', pay_mode: 'manual', payment: 1875 });
  assert.deepEqual(j(acc), { termMonths: 15, startDate: '2026-05-04', firstPayment: 'next_month', payMode: 'manual', payment: 1875 });
});
test('таблиця Аналітики: «Платіж/міс» = стандартний платіж (з ОЧ без моделі — платіж місяця); смуга лише з term_months; ланцюжок залишку не змінено', function(){
  const card = SRC.slice(SRC.indexOf('function renderInstallmentsCard'), SRC.indexOf('function applyInstallmentsCardState'));
  assert.match(card, /const payOf = function\(d\)\{.*installmentStandardPayment\(acc\); return std != null \? std : d\.monthlyPayment; \};/);
  assert.match(card, /ochOvalsHtml\(ochOvalsModel\(acc \? acc\.termMonths : null, d\.balance, acc \? installmentStandardPayment\(acc\) : null\)\)/);
  assert.match(card, /och-bar-h/); assert.ok(!/t-bar-track/.test(card), 'старого прогрес-бару нема');
  assert.match(SRC, /Math\.max\(0, startBal - lk\)/, 'Rev 2.32.177: ланцюжок з опорними точками');
});

// ---- Rev 2.32.172: «Умови», єдина підказка поля, підказка про відхилення ----
test('«Умови»: рядок із поточними значеннями, згорнуті за замовчуванням, у розгорнутих — сегменти й «Залишок за банком»; стан не зберігається', function(){
  assert.equal(g.ochCondSummary('next_month', 'manual'), 'Наступного місяця · Вручну');
  assert.equal(g.ochCondSummary('same_day', 'auto'), 'У день оформлення · Автоматично'); assert.equal(g.ochCondSummary(undefined, undefined), 'У день оформлення · Вручну');
  const form = SRC.slice(SRC.indexOf('<div class="och-form">'), SRC.indexOf('Видалити ОЧ</button>'));
  assert.match(form, /<button type="button" class="och-cond-row" id="idd-cond-btn" aria-expanded="false" aria-controls="idd-cond" onclick="ochToggleCond\(\)">/);
  assert.match(form, /<div class="och-cond" id="idd-cond" hidden>/);
  const body = form.slice(form.indexOf('<div class="och-cond" id="idd-cond" hidden>'), form.indexOf('<div class="och-actions">'));
  ['id="idd-first"', 'id="idd-mode"', 'id="idd-balance"'].forEach(x => assert.ok(body.includes(x), x + ' у «Умовах»'));
  assert.ok(form.indexOf('id="idd-pay"') < form.indexOf('id="idd-cond"'), 'платіж/міс лишається над «Умовами»');
  const open = SRC.slice(SRC.indexOf('function openInstallmentEditor'), SRC.indexOf('function openInstallmentEditor') + 5200);
  assert.match(open, /clearAllFieldHints\(\); ochSetCond\(false\); ochUpdateCondSummary\(\);/, 'при кожному відкритті згорнуті');
  assert.ok(!/localStorage[^;]*(cond|och)/i.test(SRC.slice(SRC.indexOf('function ochSetCond'), SRC.indexOf('function ochSetCond') + 400)), 'стан не зберігається');
  // розкриття з клавіатурою: лише scrollIntoView «nearest» для поля в фокусі, без чіпання клавіатурної логіки
  const tog = SRC.slice(SRC.indexOf('function ochToggleCond'), SRC.indexOf('let ochPayManual'));
  assert.match(tog, /a\.scrollIntoView\(\{ block: 'nearest' \}\)/); assert.ok(!/kb-|focusCardField|visualViewport/.test(tog));
  assert.match(SRC, /if\(typeof ochSetCond === 'function' && el\.closest && el\.closest\('#idd-cond'\)\) ochSetCond\(true\);/, '«Заповнити» розгортає «Умови» для «Залишку»');
});
test('підсвітка «заповніть поле»: єдиний клас field-hint лише на самому полі; знімається першим введенням (input/change) або через 6 с', function(){
  const timers = []; const listeners = {};
  const el = { classList: new (class { constructor(){ this.s = new Set(); } add(c){ this.s.add(c); } remove(c){ this.s.delete(c); } contains(c){ return this.s.has(c); } })(), addEventListener(t, f){ (listeners[t] = listeners[t] || []).push(f); }, removeEventListener(t, f){ listeners[t] = (listeners[t] || []).filter(x => x !== f); } };
  const c = buildSandbox({ setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; }, clearTimeout: () => {} }, ['FIELD_HINT_MS', 'clearFieldHint', 'hintField']);
  assert.equal(evalInSandbox(c, 'FIELD_HINT_MS'), 6000);
  c.hintField(el); assert.ok(el.classList.contains('field-hint')); assert.equal(timers[0][1], 6000);
  (listeners.input || []).slice().forEach(f => f()); assert.ok(!el.classList.contains('field-hint'), 'знято першим введенням'); assert.equal((listeners.input || []).length, 0);
  c.hintField(el); (listeners.change || []).slice().forEach(f => f()); assert.ok(!el.classList.contains('field-hint'), 'знято change (дата)');
  c.hintField(el); timers[timers.length - 1][0](); assert.ok(!el.classList.contains('field-hint'), 'знято через 6 с');
  assert.equal(c.hintField(null), null);
  const rule = CSS.match(/html:root input\.field-hint[^{]*\{([^}]*)\}/)[1];
  assert.match(rule, /border-color:var\(--color-warning\); box-shadow:0 0 0 2px color-mix\(in srgb, var\(--color-warning\) 55%, transparent\);/);
  assert.ok(!/background/.test(rule), 'лише кільце: без заливки');
  // джерела: тап по «ОЧ без дати» і «Заповнити» — один компонент; синя .just-notified лише для рядків списків
  assert.match(SRC, /hintField\(fieldEl\); \/\/ Rev 2\.32\.172/); assert.match(SRC, /hintField\(el\); \/\/ Rev 2\.32\.172: той самий компонент/);
  assert.ok(!/\.field\.just-notified|\.field-hint\.just-notified/.test(CSS));
  assert.equal([...CSS.matchAll(/\.just-notified\{/g)].length, 3, 'expense-row, service-tile, card-debt-compact-row (списки/плитки)');
});
test('підказка про відхилення: лише коли введено «Залишок за банком» і він відрізняється від розрахунку більше ніж на допуск; текст «Відрізняється від розрахунку (X ₴) · Застосувати»', function(){
  const d = (v, calc) => g.ochBalanceDiffers(v, calc);
  assert.equal(d('', 9000), null); assert.equal(d('   ', 9000), null, 'порожнє — без підказки');
  assert.equal(d('9 000', 9000), null); assert.equal(d('9 050', 9000), null, 'в межах 1%'); assert.equal(d('9 100', 9000), 9000, 'понад допуск');
  assert.equal(d('1 010', 1000), null, 'допуск 1% (10 ₴)'); assert.equal(d('1 011', 1000), 1000); assert.equal(d('102', 100), null, 'допуск не менше 2 ₴'); assert.equal(d('103', 100), 100);
  assert.equal(d('8 000', ''), null); assert.equal(d('8 000', null), null); assert.equal(d('сміття', 9000), null);
  const fn = SRC.slice(SRC.indexOf('function checkInstallmentDivergence'), SRC.indexOf('// Rev 2.2.2 BugFix — підставляє очікуване'));
  assert.match(fn, /Відрізняється від розрахунку \(\$\{fmt\(diff\)\}\) · <button type="button" class="bdr-diff-apply"/);
  assert.ok(!/очікуван|на \$\{|більше|менше/.test(fn), 'слова «очікуване» й «на N% більше» прибрано');
  assert.match(SRC, /idd-balance'\)\.dataset\.expected = est\.calcBefore != null \? est\.calcBefore : ''/, 'порівняння з розрахунком без цієї опори');
  assert.match(CSS, /\.bdr-diff-warning\{ display:none; font-size:10\.5px; color:var\(--color-warning\);/, 'тепле оформлення');
});

// ---- Rev 2.32.173 (OCH-FORM-3): фінальний макет — розміри, скло, стани ----
const FINAL = (function(){ const i = CSS.indexOf('Rev 2.32.173/174 (OCH-FORM-3'); const k = CSS.indexOf('*/', i) + 2; return CSS.slice(k, k + 5200); })();
test('фінальний макет: шторка r 28 зверху з відступом 14, ручка 36×4, заголовок (логотип 32 r 8, назва 15/500, підзаголовок 11, закриття коло 30)', function(){
  assert.match(FINAL, /@media \(max-width:1279px\)\{\s*#installment-drawer\{ border-radius:28px 28px var\(--radius-xl\) var\(--radius-xl\); padding:14px 14px 12px; \}/);
  assert.match(CSS, /\.drawer-handle::before\{ content:''; width:36px; height:4px;/);
  assert.match(FINAL, /#installment-drawer \.drawer-head-icon\{ width:32px; height:32px; border-radius:8px;/);
  assert.match(FINAL, /#installment-drawer \.drawer-head h2\{ font-size:15px; font-weight:500; \}/); assert.match(FINAL, /\.drawer-head-sub\{ font-size:11px; \}/);
  assert.match(FINAL, /#installment-drawer \.drawer-close\{ width:30px; height:30px; border-radius:50%; \}/);
  assert.match(SRC, /idd-icon'\)\.innerHTML = bankIcon\(name, 32, true, 'installment'\)/);
});
test('фінальний макет без скла: поле 34 / r 12 / текст 14 / підпис 10 px; «Умови» — звичайне поле (34 / r 12, токени поля); сегмент 32 / r 12, повзунок r 10 --color-success; кнопки 40 / r 14; футер із лінією; «Видалити ОЧ» 12 px', function(){
  assert.match(FINAL, /\.och-form \.field input\{ height:34px; padding:0 12px; border-radius:12px; font-size:14px; \}/);
  assert.match(FINAL, /\.och-form \.field label\{ font-size:10px; letter-spacing:\.5px; margin-bottom:3px; \}/);
  assert.match(FINAL, /\.och-form \.field\{ margin-bottom:8px; \}/); assert.match(FINAL, /\.och-form \.row-2\{ gap:8px; \}/);
  assert.match(FINAL, /html:root \.och-cond-row\{ height:34px; border:1\.5px solid var\(--color-border-strong\); border-radius:12px; padding:0 12px; background-color:var\(--ui-glass, var\(--color-surface\)\); box-shadow:inset 0 1px 2px rgba\(16,24,40,\.05\);/);
  assert.match(FINAL, /\.och-seg\.struct-tabs\{ height:32px; box-sizing:border-box; padding:2px; gap:2px; margin:0; border-radius:12px; border:1\.5px solid var\(--color-border-strong\); \}/);
  assert.match(FINAL, /\.och-seg \.struct-tab-btn\{ height:100%; padding:0 4px; border-radius:10px;/);
  assert.match(FINAL, /\.och-seg \.struct-tab-btn\.active\{ color:var\(--color-success\);/);
  assert.match(FINAL, /\.och-seg \.seg-indicator\{ border-radius:10px; background:var\(--color-success-bg\); border:1px solid var\(--color-success\); box-shadow:none; \}/);
  assert.match(FINAL, /\.och-actions\{ gap:8px;[^}]*border-top:1px solid var\(--color-border\);/); assert.match(FINAL, /\.och-actions > button\{ height:40px; border-radius:14px; \}/);
  assert.match(FINAL, /\.och-actions \.submit-btn\.debt\{ background:var\(--color-primary\); border:0; color:#fff; box-shadow:none; \}/);
  assert.match(FINAL, /\.och-form \.cdd-delete-link\{ font-size:12px;/);
});
test('без скла: жодних --och-glass-*, градієнтів, блиску й backdrop-filter у блоці форми ОЧ; сегменти — наявний компонент (initSegments: .struct-tabs у SEGMENT_SELECTOR), без власного .och-seg button', function(){
  const block = FINAL.slice(0, FINAL.indexOf('#installment-drawer .och-form .cdd-delete-link{ font-size:12px') + 200);
  assert.ok(!/och-glass|gradient|backdrop-filter/.test(block), 'без скла');
  assert.ok(!/--och-glass/.test(SRC), 'токени --och-glass-* прибрано');
  assert.ok(!/\.och-seg button/.test(CSS), 'власного компонента сегментів нема');
  assert.match(SRC, /const SEGMENT_SELECTOR = '\.struct-tabs, \.theme-toggle, \.n-days';/);
  assert.match(SRC, /b\.classList\.toggle\('active', on\);/);
});
test('фінальний макет: шторка r 28 зверху з відступом 14, ручка 36×4, заголовок (логотип 32 r 8, назва 15/500, підзаголовок 11, закриття коло 30)', function(){
  assert.match(FINAL, /@media \(max-width:1279px\)\{\s*#installment-drawer\{ border-radius:28px 28px var\(--radius-xl\) var\(--radius-xl\); padding:14px 14px 12px; \}/);
  assert.match(CSS, /\.drawer-handle::before\{ content:''; width:36px; height:4px;/);
  assert.match(FINAL, /#installment-drawer \.drawer-head-icon\{ width:32px; height:32px; border-radius:8px;/);
  assert.match(FINAL, /#installment-drawer \.drawer-head h2\{ font-size:15px; font-weight:500; \}/); assert.match(FINAL, /\.drawer-head-sub\{ font-size:11px; \}/);
  assert.match(FINAL, /#installment-drawer \.drawer-close\{ width:30px; height:30px; border-radius:50%; \}/);
  assert.match(SRC, /idd-icon'\)\.innerHTML = bankIcon\(name, 32, true, 'installment'\)/);
});
test('стани: «Умови» згорнуті — значення (напр. «Наступного місяця · Вручну»), розгорнуті — «Згорнути»; за замовчуванням за банком (ПУМБ: Наступного місяця · Вручну)', function(){
  const mk = hidden => { const els = { 'idd-cond': { hidden }, 'idd-cond-val': { textContent: '' }, 'idd-first': { getAttribute: () => 'next_month' }, 'idd-mode': { getAttribute: () => 'manual' } }; const c = buildSandbox({ document: { getElementById: id => els[id] || null } }, ['ochCondSummary', 'ochUpdateCondSummary']); c.ochUpdateCondSummary(); return els['idd-cond-val'].textContent; };
  assert.equal(mk(true), 'Наступного місяця · Вручну'); assert.equal(mk(false), 'Згорнути');
  const d = g.ochDefaultSegments('ПУМБ Dyson'); assert.equal(g.ochCondSummary(d.firstPayment, d.payMode), 'Наступного місяця · Вручну');
  const m = g.ochDefaultSegments('Моно Ноутбук'); assert.equal(g.ochCondSummary(m.firstPayment, m.payMode), 'У день оформлення · Автоматично');
});
