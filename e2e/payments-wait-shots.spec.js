// DS-PAYLIST Rev 3: знімки «Чекає внесення» (1 і 4 платежі, обидві теми, 390 пт, один набір даних); лише з DS_SHOTS_DIR. Синтетичні дані.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR;
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test('payments-wait-shots', async ({ browser }) => {
  test.setTimeout(240000); fs.mkdirSync(DIR, { recursive: true });
  const seen = {};
  for (const n of [1, 4]) for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2, colorScheme: theme });
    const page = await ctx.newPage(); await installClock(page);
    await page.goto('/index.html?fixture=typical');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(([t, k]) => {
      document.documentElement.setAttribute('data-theme', t);
      const cur = kyivTodayISO().slice(0, 7), nxt = ppNextMonth(cur);
      const names = ['Банк А Телефон', 'Банк Б Ноутбук з дуже довгою назвою для перевірки обрізання', 'Банк Б Навушники', 'Банк А Холодильник'];
      installmentAccounts = [2, 5, 8, 11].slice(0, k).map((d, i) => ({ name: names[i], dueDay: d, initialAmount: 20000, termMonths: 10, payment: 1000 + i * 700, startDate: '2025-01-01', firstPayment: 'same_day', payMode: 'manual' }));
      bankAccounts = []; debts = [];
      installmentAccounts.forEach((a, i) => [cur, nxt].forEach(mo => debts.push({ kind: 'installment', name: a.name, month: mo, balance: 15000 - i * 500, monthlyPayment: i === 2 ? null : 1000 + i * 700 })));
      switchTab('analytics'); renderAll(); openPaymentsScreen(null);
    }, [theme, n]);
    await page.waitForTimeout(800);
    (seen[n] = seen[n] || {})[theme] = await page.evaluate(() => Array.from(document.querySelectorAll('#payments-body .pl-wait-item .pay-line-name')).map(e => e.textContent).join('|'));
    await page.screenshot({ path: path.join(DIR, 'wait-' + n + '-' + theme + '.png') });
    await ctx.close();
  }
  for (const n of [1, 4]) if (seen[n].dark !== seen[n].light) throw new Error('набори даних у темах різні: ' + JSON.stringify(seen[n]));
});
