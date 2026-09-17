// Rev #26.1 — тест для detectInstallmentMatches(), щойно ізольованої від DOM
// (ROADMAP.md, Stage 5 п.26): раніше функція сама читала
// document.getElementById('f-date') і тому не могла виконуватись поза
// браузером — тепер expenseMonth явний параметр, DOM-читання лишилось лише
// у тонкому caller (updateInstallmentLinkDetection(), не тестується тут,
// бо рендерить DOM). Формула/умови збігу — ті самі, що були до рефакторингу
// (двоетапний пошук: повний збіг назви, інакше збіг по значущому слову),
// тест фіксує ПОТОЧНУ поведінку, не "виправлену".
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox({ installmentAccounts, hiddenFrom }){
  return buildSandbox(
    { installmentAccounts: installmentAccounts || [], hiddenFrom: hiddenFrom || {} },
    ['hideKey', 'isHiddenForMonth', 'isInstallmentVisibleForMonth', 'stripLeadingEmoji', 'detectInstallmentMatches']
  );
}
// Rev #26.1 — масив, який повертає функція з vm.Context, живе в ІНШОМУ
// реалмі (r.constructor !== Array головного процесу): assert.deepEqual/strict
// порівнює і прототип, тому падає навіть на структурно однакових масивах.
// Array.from(...), викликаний з головного реалму, повертає звичайний масив
// із тими самими елементами — той самий прийом, що вже задокументований у
// tests/journal-month.test.js для Set-результатів.
function detect(ctx, text, expenseMonth){
  return Array.from(ctx.detectInstallmentMatches(text, expenseMonth));
}

test('detectInstallmentMatches: повний збіг назви — повертає індекс ОЧ', () => {
  const installmentAccounts = [
    { name: 'ПУМБ Ноутбук' },
    { name: 'ПУМБ Телевізор' },
  ];
  const ctx = sandbox({ installmentAccounts });
  assert.deepEqual(detect(ctx, 'оплата пумб ноутбук', '2026-09'), [0]);
});

test('detectInstallmentMatches: повний збіг — коли є хоч один, словесні збіги ігноруються повністю', () => {
  // "ПУМБ Ноутбук" дав би збіг і по слову "пумб" з обома рахунками нижче,
  // але це ТОЧНИЙ повний збіг підрядка, тому саме він і ЛИШЕ він.
  const installmentAccounts = [
    { name: 'ПУМБ Ноутбук' },
    { name: 'ПУМБ Телевізор' },
  ];
  const ctx = sandbox({ installmentAccounts });
  assert.deepEqual(detect(ctx, 'пумб ноутбук зверху', '2026-09'), [0]);
});

test('detectInstallmentMatches: без повного збігу — збіг по значущому слову (мін. 3 символи), може дати декілька кандидатів', () => {
  const installmentAccounts = [
    { name: 'ПУМБ Ноутбук' },
    { name: 'ПУМБ Телевізор' },
  ];
  const ctx = sandbox({ installmentAccounts });
  // текст містить лише "пумб" (спільне перше слово обох назв) — жодного
  // повного збігу підрядка немає, тому обидва кандидати за словом.
  assert.deepEqual(detect(ctx, 'оплата пумб за минулий місяць', '2026-09'), [0, 1]);
});

test('detectInstallmentMatches: збіг лише по ТОЧНОМУ слову, не по підрядку (Rev 2.11.10 BugFix)', () => {
  const installmentAccounts = [{ name: 'Приват Банк' }];
  const ctx = sandbox({ installmentAccounts });
  // "банку" (родовий відмінок "банка" пива) не повинен збігатись зі словом
  // "банк" ОЧ — це геть інше слово, лише спільний корінь.
  assert.deepEqual(detect(ctx, 'пиво з банку пива', '2026-09'), []);
});

test('detectInstallmentMatches: порожній текст — порожній результат', () => {
  const installmentAccounts = [{ name: 'ПУМБ Ноутбук' }];
  const ctx = sandbox({ installmentAccounts });
  assert.deepEqual(detect(ctx, '', '2026-09'), []);
  assert.deepEqual(detect(ctx, '   ', '2026-09'), []);
});

test('detectInstallmentMatches: архівна ОЧ (прихована з певного місяця) не пропонується ПІСЛЯ приховування (Rev 2.11.9 Баг #1)', () => {
  const installmentAccounts = [{ name: 'ПУМБ Ноутбук' }];
  const hiddenFrom = { 'installment:ПУМБ Ноутбук': '2026-06' };
  const ctx = sandbox({ installmentAccounts, hiddenFrom });
  assert.deepEqual(detect(ctx, 'пумб ноутбук', '2026-05'), [0]);
  assert.deepEqual(detect(ctx, 'пумб ноутбук', '2026-06'), []);
});

test('detectInstallmentMatches: ОЧ не пропонується ДО свого firstMonth (Rev 2.11.9 Баг #5)', () => {
  const installmentAccounts = [{ name: 'ПУМБ Ноутбук', firstMonth: '2026-03' }];
  const ctx = sandbox({ installmentAccounts });
  assert.deepEqual(detect(ctx, 'пумб ноутбук', '2026-02'), []);
  assert.deepEqual(detect(ctx, 'пумб ноутбук', '2026-03'), [0]);
});

test('detectInstallmentMatches: expenseMonth береться з явного параметра, а не з якогось глобального стану', () => {
  // Той самий текст, той самий набір ОЧ — різний результат лише через різний
  // явний expenseMonth (саме це і було метою Rev #26.1: прибрати document-
  // залежність, зробивши місяць параметром, а не побічно прочитаним з DOM).
  const installmentAccounts = [{ name: 'ПУМБ Ноутбук', firstMonth: '2026-03' }];
  const ctx = sandbox({ installmentAccounts });
  assert.deepEqual(detect(ctx, 'пумб ноутбук', '2026-01'), []);
  assert.deepEqual(detect(ctx, 'пумб ноутбук', '2026-12'), [0]);
});
