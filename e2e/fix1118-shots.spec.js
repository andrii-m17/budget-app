// Знімки FIX-1118 «до/після» (DS_SHOTS_DIR, DS_SHOTS_TAG=before|after): «Найближчі платежі» (прострочений + платіж за 2 дні) і «Деталізація витрат» у режимі «Підкатегорії». Мок, вигадані суми.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const SHOTS = process.env.DS_SHOTS_DIR, TAG = process.env.DS_SHOTS_TAG || 'after';
test.use({ hasTouch: true });
test('fix1118-shots', async ({ page }) => {
  test.skip(!SHOTS, 'потрібен DS_SHOTS_DIR');
  test.setTimeout(300000); fs.mkdirSync(SHOTS, { recursive: true });
  for (const [w, h] of [[390, 844], [320, 700]]){
    for (const theme of ['dark', 'light']){
      await page.setViewportSize({ width: w, height: h });
      await installClock(page);
      await page.goto('/index.html?fixture=typical');
      await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
      await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
      await page.evaluate(t => { document.documentElement.setAttribute('data-theme', t); switchTab('analytics'); const tb = document.querySelector('.tabbar-glass'); if(tb) tb.style.display = 'none'; }, theme);
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        const m = selectedMonth; [['🛒 Продукти', '🏪 Супермаркет', 4800], ['🛒 Продукти', '', 6900], ['🍔 Харчування', '☕️ Кафе', 1900], ['🍔 Харчування', '🍕 Доставка', 1000], ['🛍️ Покупки', '👕 Одяг', 2300], ['🚌 Транспорт', '', 500]].forEach((r, i) => expenses.push({ id: 'sh-' + i, date: m + '-01', amount: r[2], category: r[0], subcategory: r[1], note: '', deletedAt: null }));
        const t = kyivTodayISO(), d = +t.slice(8, 10);
        if(installmentAccounts[0]) installmentAccounts[0].dueDay = Math.max(1, d - 1);
        if(installmentAccounts[1]) installmentAccounts[1].dueDay = Math.min(28, d + 2);
        renderDashboard(); renderPaymentsCard();
      });
      await page.waitForTimeout(800);
      const tag = TAG + '-' + w + '-' + theme;
      await page.evaluate(() => document.getElementById('payments-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(600);
      await page.locator('#payments-card').screenshot({ path: path.join(SHOTS, 'pay-' + tag + '.png') });
      await page.evaluate(() => document.getElementById('bal-cat-card').scrollIntoView({ block: 'center' }));
      await page.click('#bal-cat-seg button[data-m="sub"]'); await page.waitForTimeout(1500);
      await page.locator('#bal-cat-card').screenshot({ path: path.join(SHOTS, 'sub-card-' + tag + '.png') });
      await page.click('#bal-cat-all'); await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(SHOTS, 'sub-sheet-' + tag + '.png') });
    }
  }
});
