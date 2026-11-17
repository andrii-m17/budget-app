// DS-N1…N4: знімки «до/після» для погодження вигляду (390 пт, CSS-масштаб, 5 екранів і 6 шторок у двох темах) і значення всіх токенів tokens.css. Запуск лише з DS_SHOTS_DIR і DS_SHOTS_SUFFIX (before|after).
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test('ds-shots: знімки й значення токенів', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(DIR, { recursive: true });
  const tok = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8').replace(/\/\*[^]*?\*\//g, '');
  const names = Array.from(new Set(tok.match(/--[a-zA-Z0-9-]+(?=\s*:)/g) || []));
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user);
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  const vars = {};
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    vars[theme] = await page.evaluate((ns) => { const cs = getComputedStyle(document.documentElement); const o = {}; ns.forEach(n => { o[n] = cs.getPropertyValue(n).trim(); }); return o; }, names);
    const shot = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(DIR, n + '-' + theme + '-' + SUF + '.png'), scale: 'css' }); };
    await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(2500); await shot('analytics');
    for (const tab of ['accounting', 'vytraty', 'structure', 'service']){ await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(500); await shot(tab); }
    const overlays = [['settings', () => openSettings(), () => { const b = document.querySelector('.drawer.open .drawer-close, .app-modal.open .drawer-close'); if(b) b.click(); }], ['notif', () => openNotifArchive(), () => closeNotifArchive()], ['profile', () => openProfileMenu(), () => closeProfileMenu()], ['monoscreen', () => openMonoScreen(), () => closeMonoScreen()], ['inbox', () => openMonoInbox({ tab: 'new' }), () => closeMonoInbox()], ['trash', () => openTrashScreen(), () => closeTrashScreen()]];
    for (const [n, open, close] of overlays){ try{ await page.evaluate(open); await page.waitForTimeout(700); await shot('ov-' + n); await page.evaluate(close); await page.waitForTimeout(400); }catch(e){} }
    await page.evaluate(() => switchTab('analytics'));
  }
  fs.writeFileSync(path.join(DIR, 'vars-' + SUF + '.json'), JSON.stringify(vars, null, 1));
});
