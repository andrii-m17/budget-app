// DS-3b: кадри анімацій іконок і руху бульбашки (0/25/50/75/100 %) в обох темах; анімації ставимо на паузу й виставляємо currentTime
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR;
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ deviceScaleFactor: 2 });
const tb = (tab) => '.tabbar-glass button[data-tab="' + tab + '"]';
const CASES = [
  ['tbSlice-analytics', 'service', 'analytics', /^tbSlice$/, 'btn'],
  ['tbPress-accounting', 'analytics', 'accounting', /^tbPress$/, 'btn'],
  ['tbNode-structure', 'accounting', 'structure', /^tbNode$/, 'btn'],
  ['tbSpin-tbPie-service', 'analytics', 'service', /^(tbSpin|tbPie)$/, 'btn'],
  ['vytraty-ring-plus', 'analytics', 'vytraty', /^$/, 'btn'],
  ['bubble-analytics-service', 'analytics', 'service', /^$/, 'bar'],
];
test('ds3b-frames', async ({ page }) => {
  test.setTimeout(300000);
  fs.mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  const info = {};
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    for (const [name, from, to, rx, mode] of CASES){
      await page.click(tb(from)).catch(() => {}); await page.waitForTimeout(1100);
      await page.evaluate(() => { document.getAnimations().forEach(a => { try{ a.finish(); }catch(e){} }); });
      const clip = await page.evaluate(([to, mode]) => { const e = mode === 'bar' ? document.getElementById('tabbar-glass') : document.querySelector('.tabbar-glass button[data-tab="' + to + '"]'); const r = e.getBoundingClientRect(); return mode === 'bar' ? { x: Math.max(0, r.x - 6), y: r.y - 20, width: Math.min(390, r.width + 12), height: r.height + 40 } : { x: Math.max(0, r.x - 8), y: r.y - 24, width: r.width + 16, height: r.height + 36 }; }, [to, mode]);
      // запускаємо перехід реальним кліком (вмикає анімацію іконки); «Витрати» — програмно без автофокусу, але після жесту
      if(to === 'vytraty'){ await page.evaluate(() => switchTab('vytraty', { noFocus: true })); } else { await page.click(tb(to)); }
      const r = await page.evaluate(([src, flags]) => { const re = new RegExp(src); const list = document.getAnimations().filter(a => { const n = a.animationName || (a.transitionProperty ? 'tr:' + a.transitionProperty : ''); const t = a.effect && a.effect.target; if(!t || !t.closest) return false; if(!t.closest('nav.tabbar')) return false; return re.source === '^$' ? !!a.transitionProperty : re.test(n); }); list.forEach(a => a.pause()); window.__fr = list; return list.map(a => (a.animationName || a.transitionProperty) + ':' + Math.round(a.effect.getComputedTiming().endTime)); }, [rx.source, rx.flags]);
      info[theme + '-' + name] = r;
      for (const pct of [0, 25, 50, 75, 100]){
        await page.evaluate((p) => { window.__fr.forEach(a => { const end = a.effect.getComputedTiming().endTime; a.currentTime = Math.min(end - 0.01, end * p / 100); }); }, pct); await page.waitForTimeout(60);
        await page.screenshot({ path: path.join(DIR, 'frame-' + name + '-' + theme + '-' + pct + '.png'), scale: 'device', clip });
      }
      await page.evaluate(() => { window.__fr.forEach(a => { try{ a.finish(); }catch(e){} }); });
    }
  }
  fs.writeFileSync(path.join(DIR, 'frames-info.json'), JSON.stringify(info, null, 1));
});
