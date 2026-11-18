// DS-3b3: звірка анімацій таббару з макетом analytics-ds: кадри «макет | застосунок» в однакові миті (0…100 % від найдовшої анімації макета) і опис таймінгів. Лише за DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR;
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ deviceScaleFactor: 2 });
const MOCK = 'file://' + path.join(__dirname, '..', 'docs', 'ui', 'mockups', 'analytics-ds', 'index.html');
const CASES = [
  ['tbSlice-analytics', 'service', 'analytics', 'btn'],
  ['tbPress-accounting', 'analytics', 'accounting', 'btn'],
  ['tbNode-structure', 'accounting', 'structure', 'btn'],
  ['tbSpin-service', 'analytics', 'service', 'btn'],
  ['vytraty-ring-plus', 'analytics', 'vytraty', 'btn'],
  ['bubble-520', 'analytics', 'service', 'bar'],
  ['press-in-accounting', 'structure', 'accounting', 'press'],
  ['press-out-accounting', 'structure', 'accounting', 'release'],
];
const STEPS = 11;
async function openMock(page){ await page.setViewportSize({ width: 390, height: 844 }); await page.goto(MOCK); await page.waitForTimeout(1500); }
async function openApp(page){
  await page.setViewportSize({ width: 390, height: 844 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
}
const SCOPE = { mock: '#tabbar', app: 'nav.tabbar' };
const BTN = (kind, tab) => (kind === 'mock' ? '#tabbar' : 'nav.tabbar') + ' button[data-tab="' + tab + '"]';
async function go(page, kind, tab){
  if(kind === 'app' && tab === 'vytraty') await page.evaluate(() => switchTab('vytraty', { noFocus: true })); else await page.click(BTN(kind, tab));
}
// опис усіх анімацій і переходів у таббарі: ім'я/властивість, ціль, тривалість, затримка, крива, transform-origin/box цілі
const describe = (page, kind) => page.evaluate((scope) => {
  const root = document.querySelector(scope);
  const sel = (e) => (e.tagName.toLowerCase() + (e.getAttribute && e.getAttribute('class') ? '.' + e.getAttribute('class').trim().split(/\s+/).join('.') : '')).slice(0, 40);
  return root.getAnimations({ subtree: true }).map(a => { const t = a.effect.getTiming(), e = a.effect.target, cs = getComputedStyle(e); return { name: a.animationName || ('transition:' + a.transitionProperty), target: sel(e), duration: Math.round(t.duration), delay: Math.round(t.delay), easing: t.easing, fill: t.fill, origin: cs.transformOrigin, box: cs.transformBox || '', kf: a.effect.getKeyframes ? a.effect.getKeyframes().map(k => Object.keys(k).filter(x => !/^(offset|computedOffset|easing|composite)$/.test(x)).map(x => x + ':' + k[x]).join(';') + '@' + (k.computedOffset != null ? Math.round(k.computedOffset * 100) : '')).slice(0, 5) : [] }; });
}, SCOPE[kind]);
test('ds3b3-compare', async ({ page }) => {
  test.setTimeout(500000);
  fs.mkdirSync(path.join(DIR, 'frames'), { recursive: true });
  const info = {};
  for (const theme of ['light', 'dark']){
    for (const kind of ['mock', 'app']){
      if(kind === 'mock') await openMock(page); else await openApp(page);
      if(kind === 'mock') await page.evaluate((t) => setTheme(t), theme); else await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(400);
      for (const [name, from, to, mode] of CASES){
        await go(page, kind, from); await page.waitForTimeout(1200);
        await page.evaluate(() => { document.getAnimations().forEach(a => { try{ a.finish(); }catch(e){} }); });
        const clip = await page.evaluate(([sel, scope, mode]) => { const e = mode === 'bar' ? document.querySelector(scope + ' .tabbar-glass, ' + scope + ' #tabbar-glass') || document.querySelector(scope) : document.querySelector(sel); const r = e.getBoundingClientRect(); return mode === 'bar' ? { x: Math.max(0, r.x - 4), y: r.y - 14, width: Math.min(390, r.width + 8), height: r.height + 28 } : { x: Math.max(0, r.x - 4), y: r.y - 26, width: r.width + 8, height: r.height + 38 }; }, [BTN(kind, to), SCOPE[kind], mode]);
        if(mode === 'press' || mode === 'release'){
          const bb = await page.locator(BTN(kind, to)).boundingBox();
          await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
          if(mode === 'release'){ await page.waitForTimeout(400); await page.mouse.up(); }
        } else await go(page, kind, to);
        const d = await describe(page, kind);
        info[theme + '-' + kind + '-' + name] = d;
        // T = найдовша анімація МАКЕТА (для app беремо T з макета тієї ж теми/випадку)
        if(kind === 'mock') info['T-' + name] = Math.max(1, ...d.map(x => x.delay + x.duration));
        const T = info['T-' + name] || 1;
        await page.evaluate(() => { const root = document.querySelector('#tabbar, nav.tabbar'); window.__fr = root.getAnimations({ subtree: true }).filter(a => a.playState !== 'finished'); window.__fr.forEach(a => a.pause()); });
        for (let i = 0; i < STEPS; i++){
          await page.evaluate(([t]) => { window.__fr.forEach(a => { const end = a.effect.getComputedTiming().endTime; try{ a.currentTime = Math.min(Math.max(0, end - 0.01), t); }catch(e){} }); }, [T * i / (STEPS - 1)]);
          await page.waitForTimeout(40);
          await page.screenshot({ path: path.join(DIR, 'frames', name + '-' + theme + '-' + kind + '-' + i + '.png'), scale: 'device', clip });
        }
        await page.evaluate(() => { (window.__fr || []).forEach(a => { try{ a.finish(); }catch(e){} }); });
        if(mode === 'press') await page.mouse.up();
      }
    }
  }
  fs.writeFileSync(path.join(DIR, 'timings.json'), JSON.stringify(info, null, 1));
});
