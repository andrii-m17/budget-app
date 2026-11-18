// DS-3d: знімки «до/після» скла (банер, тост, бічна панель) і вкладених радіусів (аватар, .pay-card-hit, .bank-badge-generic); обидві теми
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
async function boot(page){
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user);
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
}
const collectNested = () => { const out = []; const eff = (el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); const v = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => { const m = cs[k].match(/([\d.]+)px/); return m ? parseFloat(m[1]) : (/%/.test(cs[k]) ? Math.min(r.width, r.height) / 2 : 0); }); return Math.min(Math.max.apply(null, v), r.width / 2, r.height / 2); }; document.querySelectorAll('body *').forEach(el => { if(!el.getClientRects().length) return; const ri = eff(el); if(ri <= 0) return; const r = el.getBoundingClientRect(); if(r.width === 0 || r.height === 0) return; let p = el.parentElement; while(p && p !== document.body){ const ro = eff(p); if(ro > 0){ const pr = p.getBoundingClientRect(); const gap = Math.min(r.left - pr.left, r.top - pr.top, pr.right - r.right, pr.bottom - r.bottom); if(gap >= 0 && gap <= 6 && ri > ro - gap + 0.5){ const d = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''); out.push(d(el) + ' (r ' + Math.round(ri * 10) / 10 + ') у ' + d(p) + ' (r ' + Math.round(ro * 10) / 10 + ', відступ ' + Math.round(gap * 10) / 10 + ')'); } break; } p = p.parentElement; } }); return out; };
test('ds3d-shots: скло й вкладені радіуси', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(DIR, { recursive: true });
  const nested = {}, radii = {};
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    const out = (n) => path.join(DIR, n + '-' + theme + '-' + SUF + '.png');
    await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(2200);
    nested[theme + '-analytics'] = await page.evaluate(collectNested);
    // вкладені радіуси: аватар у шапці, картка платежів (.pay-card-hit), рядок зі «загальним» банківським значком
    await page.screenshot({ path: out('nested-avatar'), scale: 'css', clip: { x: 0, y: 0, width: 390, height: 90 } });
    const card = page.locator('#payments-card'); if(await card.count()){ await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await card.screenshot({ path: out('nested-paycard'), scale: 'css' }); }
    radii[theme] = await page.evaluate(() => { const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p || 'borderTopLeftRadius'] : null; }; return { avatarFace: g('.avatar-face'), profileBtn: g('.profile-header-btn'), payCardHit: g('.pay-card-hit'), payCard: g('.pay-card') }; });
    let found = false;
    for (const tab of ['analytics', 'accounting', 'structure', 'vytraty', 'service']){
      await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(700);
      const row = page.locator('.t-row:has(.bank-badge-generic)').first();
      if(await row.count()){ await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await row.screenshot({ path: out('nested-badge'), scale: 'css' }); radii[theme].badgeGeneric = await page.evaluate(() => getComputedStyle(document.querySelector('.t-row .bank-badge-generic')).borderTopLeftRadius); found = true; break; }
    }
    if(!found) radii[theme].badgeGeneric = 'не знайдено у фікстурі';
    // банер оновлення й тост
    await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(500);
    await page.evaluate(() => { document.getElementById('update-banner').classList.add('show'); }); await page.waitForTimeout(300);
    await page.screenshot({ path: out('glass-banner'), scale: 'css', clip: { x: 0, y: 844 - 220, width: 390, height: 140 } });
    await page.evaluate(() => { document.getElementById('update-banner').classList.remove('show'); showToast({ title: 'Дані збережено', subtitle: 'Синхронізовано щойно', sticky: true }); }); await page.waitForTimeout(500);
    await page.screenshot({ path: out('glass-toast'), scale: 'css', clip: { x: 0, y: 0, width: 390, height: 140 } });
    await page.evaluate(() => { document.querySelectorAll('.success-toast').forEach(e => e.remove()); });
  }
  // бічна панель (≥ 1280 пт)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload(); await boot(page);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(DIR, 'glass-sidepanel-' + theme + '-' + SUF + '.png'), scale: 'css', clip: { x: 0, y: 0, width: 300, height: 520 } });
  }
  fs.writeFileSync(path.join(DIR, 'nested-' + SUF + '.json'), JSON.stringify({ nested, radii }, null, 1));
});
