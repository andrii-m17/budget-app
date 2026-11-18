// DS-3e: знімки «до/після» перемикача місяця: поточний, минулий (з рядком), відкритий список; 390 пт і iPad 1024 пт; обидві теми
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
async function boot(page, w, h){
  await page.setViewportSize({ width: w, height: h });
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user);
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
}
test('ds3e-shots', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(DIR, { recursive: true });
  const info = {};
  for (const [w, h, tag] of [[390, 844, 'm390'], [1024, 768, 'ipad1024']]){
    await boot(page, w, h);
    for (const theme of ['light', 'dark']){
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      const out = (n) => path.join(DIR, tag + '-' + n + '-' + theme + '-' + SUF + '.png');
      await page.evaluate(() => { const t = monthKey(localDateISO()); if(selectedMonth !== t) onMonthChange(t); switchTab('analytics'); }); await page.waitForTimeout(900);
      const clip = { x: 0, y: 0, width: w, height: tag === 'm390' ? 300 : 260 };
      if(tag === 'm390'){
        await page.screenshot({ path: out('current'), scale: 'css', clip });
        await page.evaluate(() => onMonthChange(shiftMonth(selectedMonth, -1))); await page.waitForTimeout(900);
        await page.screenshot({ path: out('past'), scale: 'css', clip });
        // DS-3e2: минулий рік — на пігулці «Місяць рік»
        await page.evaluate(() => onMonthChange(shiftMonth(monthKey(localDateISO()), -12))); await page.waitForTimeout(900);
        await page.screenshot({ path: out('pastyear'), scale: 'css', clip });
        await page.evaluate(() => { const t = monthKey(localDateISO()); onMonthChange(t); }); await page.waitForTimeout(500);
      }
      if(await page.evaluate(() => typeof toggleMonthMenu === 'function')){
        await page.evaluate(() => toggleMonthMenu(true)); await page.waitForTimeout(500);
        await page.screenshot({ path: out('open'), scale: 'css', clip: { x: 0, y: 0, width: w, height: tag === 'm390' ? 560 : 520 } });
        info[tag + '-' + theme] = await page.evaluate(() => { const m = document.getElementById('month-menu'), r = m.getBoundingClientRect(); return { n: m.querySelectorAll('button[data-m]').length, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; });
        await page.evaluate(() => toggleMonthMenu(false)); await page.waitForTimeout(300);
      }
    }
  }
  fs.writeFileSync(path.join(DIR, 'info-' + SUF + '.json'), JSON.stringify(info, null, 1));
});
