// DS-4b: знімки 4 шторок (налаштування, картка, ОЧ, «Структура») на 390 і 1280 пт в обох темах та вимірювання заголовків усіх шторок («до/після»). Лише за DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ hasTouch: true, deviceScaleFactor: 2 });
const IDS = ['pay-action-drawer', 'mono-detail-drawer', 'notifications-drawer', 'trash-detail-drawer', 'checks-drawer', 'testing-drawer', 'rec-report-drawer', 'debug-record-drawer', 'settings-drawer', 'profile-drawer', 'card-debt-drawer', 'installment-drawer', 'income-drawer'];
test('ds4b-shots', async ({ page }) => {
  test.setTimeout(300000); fs.mkdirSync(DIR, { recursive: true });
  const heads = {};
  for (const w of [390, 1280]){
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 800 }); await installClock(page);
    await page.goto('/index.html?fixture=typical');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__open = (id) => { const d = document.getElementById(id), b = d.previousElementSibling; if(b && b.classList.contains('drawer-backdrop')){ b.removeAttribute('inert'); b.classList.add('open'); } d.removeAttribute('inert'); d.classList.add('open'); }; window.__shut = (id) => { const d = document.getElementById(id), b = d.previousElementSibling; d.classList.remove('open'); d.setAttribute('inert', ''); if(b && b.classList.contains('drawer-backdrop')){ b.classList.remove('open'); b.setAttribute('inert', ''); } }; });
    // вимірювання заголовків усіх шторок
    heads[w] = {};
    for (const id of IDS){
      await page.evaluate((id) => __open(id), id); await page.waitForTimeout(250);
      heads[w][id] = await page.evaluate((id) => { const d = document.getElementById(id), h = d.querySelector('.drawer-head'), x = d.querySelector('.drawer-close'); const r = (e) => { if(!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; }; const t = h && (h.querySelector('h2') || h.querySelector('.drawer-head-main')); return { head: r(h), title: r(t), close: r(x), closeVisible: x ? (x.getBoundingClientRect().width > 4) : null, drawer: r(d) }; }, id);
      await page.evaluate((id) => __shut(id), id);
    }
    for (const theme of ['light', 'dark']){
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      const shot = async (name, open, id) => { await page.evaluate(open); await page.waitForTimeout(800); const el = page.locator('#' + id); await el.screenshot({ path: path.join(DIR, 'd-' + w + '-' + name + '-' + theme + '-' + SUF + '.png'), scale: 'css' }).catch(() => {}); await page.evaluate((id) => { const n = ({ 'settings-drawer': 'closeSettings', 'card-debt-drawer': 'closeCardDebtEditor', 'installment-drawer': 'closeInstallmentEditor', 'struct-drawer': 'closeStructForm' })[id]; window[n](); }, id); await page.waitForTimeout(400); };
      await shot('settings', () => openSettings(), 'settings-drawer');
      await shot('card', () => openCardDebtEditor(0), 'card-debt-drawer');
      await shot('installment', () => openInstallmentEditor(0), 'installment-drawer');
      await shot('struct', () => showCategoryModal('Нова категорія', '', 'expense', () => {}), 'struct-drawer');
    }
  }
  fs.writeFileSync(path.join(DIR, 'heads-' + SUF + '.json'), JSON.stringify(heads, null, 1));
});
