// DS-3d2: знімки «до/після» значка generic (картка/розстрочка) у шторках, обидві теми
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test('ds3d2-shots: generic-значок у шторках', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(DIR, { recursive: true });
  const info = {};
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user);
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    const out = (n) => path.join(DIR, n + '-' + theme + '-' + SUF + '.png');
    const close = async () => { await page.evaluate(() => { const b = document.querySelector('.drawer.open .drawer-close, .app-modal.open .drawer-close'); if(b) b.click(); }); await page.waitForTimeout(500); };
    for (const [n, tab, open] of [['card-editor', 'structure', () => openCardDebtEditor(0)], ['inst-editor', 'structure', () => openInstallmentEditor(0)]]){
      try{ await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(600); await page.evaluate(open); await page.waitForTimeout(800);
        const el = page.locator('.drawer.open').first(); await el.screenshot({ path: out('drawer-' + n), scale: 'css' });
        info[theme + '-' + n] = await page.evaluate(() => { const e = document.querySelector('.drawer.open .bank-badge-generic'); return e ? getComputedStyle(e).borderTopLeftRadius + ' ' + e.offsetWidth : 'немає generic'; });
      }catch(e){ info[theme + '-' + n] = 'помилка: ' + String(e).slice(0, 80); }
      await close();
    }
    // списки з .cdr-avatar на екранах
    for (const tab of ['accounting', 'structure', 'analytics']){
      await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(700);
      const av = page.locator('.cdr-avatar:has(.bank-badge-generic)').first();
      try{
        if(await av.count() && await av.isVisible()){ await av.scrollIntoViewIfNeeded({ timeout: 3000 }); await av.locator('xpath=..').screenshot({ path: out('list-' + tab), scale: 'css', timeout: 4000 }); info[theme + '-list-' + tab] = await page.evaluate(() => getComputedStyle(document.querySelector('.cdr-avatar .bank-badge-generic')).borderTopLeftRadius); }
      }catch(e){ info[theme + '-list-' + tab] = 'помилка: ' + String(e).slice(0, 60); }
    }
  }
  fs.writeFileSync(path.join(DIR, 'info-' + SUF + '.json'), JSON.stringify(info, null, 1));
});
