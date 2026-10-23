// Rev 2.32.171 (OCH-MODEL) — модель ОЧ: стандартний платіж, овали, сегменти за банком, форма, «Далі», синхронізація. Синтетичні назви й суми.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const CSS = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const j = v => JSON.parse(JSON.stringify(v));
const g = buildSandbox({ parseAmount: v => Number(String(v).replace(/[\s ]/g, '')), ppPad: undefined }, ['ppPad', 'ppDaysInMonth', 'ppClampDate', 'OCH_FIRST_PAYMENTS', 'OCH_PAY_MODES', 'ochModelDiffers', 'applyOchModelFromRow', 'ochDefaultSegments', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'OCH_OVALS_MAX', 'ochOvalsModel', 'ochOvalsHtml', 'ochDueDayFor', 'ochCalcAutoPay', 'ochEnterNext']);

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
  assert.deepEqual(m(36, 18000, 1000), { mode: 'solid', total: 36, done: 18 }, '> 24 — суцільна смуга');
  assert.equal(m(25, 5000, 1000).mode, 'solid'); assert.equal(m(24, 5000, 1000).mode, 'ovals');
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
  const s = g.ochOvalsHtml(g.ochOvalsModel(36, 18000, 1000)); assert.match(s, /^<span class="och-solid" aria-hidden="true"><i style="width:50%"><\/i><\/span>$/);
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
  ['Назва', 'Загальна сума', 'Місяців', 'Дата створення', 'Платіж/міс', 'Перший платіж', 'Списання', "Залишок за банком (необов'язково)"].forEach(l => assert.ok(form.includes(l), l));
  ['У день оформлення', 'Наступного місяця', 'Автоматично', 'Вношу вручну', 'Оплатити', 'Зберегти', 'Видалити ОЧ'].forEach(l => assert.ok(form.includes(l), l));
  assert.ok(!/idd-due-day|Дата платежу|progress|t-bar|Разом/.test(form));
  assert.match(form, /<input type="date" id="idd-start"/);
  assert.match(form, /<div class="och-actions">\s*<button type="button" class="installment-pay-btn"[^>]*>Оплатити<\/button>\s*<button type="button" class="submit-btn debt pill"[^>]*>Зберегти<\/button>\s*<\/div>/);
  for(const id of ['iddfielda1', 'idd-initial', 'idd-term', 'idd-pay', 'idd-balance']) assert.match(form, new RegExp('id="' + id + '"[^>]*autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"'));
  assert.match(CSS, /#installment-drawer \.och-form \.field input\{ height:34px; padding:0 12px; \}/);
  assert.match(CSS, /#installment-drawer \.och-form \.field label\{ font-size:10px;/);
  assert.match(CSS, /#installment-drawer \.och-actions\{ position:sticky; bottom:0;/);
  assert.match(CSS, /\.och-seg button\[aria-checked="true"\]\{ background:rgba\(34,197,94,\.16\); border-color:rgba\(34,197,94,\.32\); box-shadow:0 2px 8px rgba\(34,197,94,\.22\), inset 0 1px 0 rgba\(255,255,255,\.22\);/, 'ліквід глас виділення сегментів');
  assert.ok(!/\.och-seg[^{]*\{[^}]*backdrop-filter/.test(CSS));
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
  assert.match(SRC, /const balance = \(prevBal != null\) \? \(linkedSum > 0 \? Math\.max\(0, prevBal - linkedSum\) : prevBal\) : null;/, 'ланцюжок (2.32.168) без змін');
});
