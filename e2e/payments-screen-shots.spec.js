// DS-PAYLIST Rev 1: знімки екрана «Платежі» до/після (390 пт, обидві теми); лише з DS_SHOTS_DIR і DS_TAG (before|after). Синтетичні дані.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, TAG = process.env.DS_TAG || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test('payments-screen-shots', async ({ browser }) => {
  test.setTimeout(240000); fs.mkdirSync(DIR, { recursive: true });
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme });
    const page = await ctx.newPage(); await installClock(page);
    await page.goto('/index.html?fixture=typical');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.evaluate(t => {
      document.documentElement.setAttribute('data-theme', t);
      const today = kyivTodayISO(), cur = today.slice(0, 7), nxt = ppNextMonth(cur);
      const days = [10, 15, 17, 17, 22, 26];
      installmentAccounts = days.map((d, i) => ({ name: ['Банк А Телефон', 'Банк Б Ноутбук', 'Банк Б Навушники', 'Банк Б Пилосос', 'Банк А Холодильник', 'Банк Б Велосипед'][i], dueDay: d, initialAmount: 20000, termMonths: 10, payment: 1000 + i * 700, startDate: '2025-01-01', firstPayment: 'same_day', payMode: 'manual' }));
      bankAccounts = [{ name: 'Кредитка Банк А', paymentDay: 24 }];
      debts = [];
      installmentAccounts.forEach((a, i) => [cur, nxt].forEach(mo => debts.push({ kind: 'installment', name: a.name, month: mo, balance: 15000 - i * 500, monthlyPayment: i === 2 ? null : 1000 + i * 700 })));
      debts.push({ kind: 'card', name: 'Кредитка Банк А', month: cur, balance: 5000, minPayment: 400 }, { kind: 'card', name: 'Кредитка Банк А', month: nxt, balance: 5000, minPayment: 400 });
      switchTab('analytics'); renderAll(); openPaymentsScreen(null);
    }, theme);
    await page.waitForTimeout(800);
    const tag = (n) => path.join(DIR, 'payments-' + TAG + '-' + theme + (n || '') + '.png');
    await page.screenshot({ path: tag('') });
    await page.evaluate(() => { const s = document.getElementById('payments-screen'); s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(300); await page.screenshot({ path: tag('-bottom') });
    // розгорнути перший місяць «Пізніше», якщо є
    const has = await page.evaluate(() => { const b = document.querySelector('#payments-body .pl-month'); if(b){ b.click(); return true; } return false; });
    if (has) { await page.waitForTimeout(300); await page.screenshot({ path: tag('-expanded') }); }
    await ctx.close();
  }
});
