// DS-4d2: на 320 пт відступи шторок і форм не дають горизонтального переповнення чи обрізання (сторінка, шторка, вміст шторки).
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
const { STATES } = require('./ds4d2-states');
test.use({ hasTouch: true });
test('150. 320 пт: шторки, діалоги й форми без горизонтального переповнення й обрізання', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 320, height: 640 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  const fails = [];
  for (const k of Object.keys(STATES)){
    await page.evaluate(STATES[k].open); await page.waitForTimeout(900);
    const r = await page.evaluate((sel) => {
      const root = sel === 'body' ? document.getElementById('main-col') || document.body : document.querySelector(sel);
      const out = { pageOver: document.documentElement.scrollWidth - window.innerWidth, rootOver: root.scrollWidth - root.clientWidth, kids: [] };
      const rb = root.getBoundingClientRect();
      root.querySelectorAll('*').forEach((e) => { const b = e.getBoundingClientRect(); if(!b.width || getComputedStyle(e).visibility === 'hidden' || getComputedStyle(e).position === 'fixed' || e.closest('.sr-close, .drawer-close, svg')) return; if(b.right > rb.right + 1 || b.left < rb.left - 1) out.kids.push((e.id || e.className || e.tagName).toString().slice(0, 40) + ' ' + Math.round(b.left) + '..' + Math.round(b.right)); });
      out.kids = out.kids.slice(0, 4); return out;
    }, STATES[k].sel);
    if(r.pageOver > 0) fails.push(k + ': сторінка ширша на ' + r.pageOver);
    if(r.rootOver > 0) fails.push(k + ': вміст ширший за контейнер на ' + r.rootOver);
    if(r.kids.length) fails.push(k + ': виходять за межі: ' + r.kids.join('; '));
    await page.evaluate(() => { try{ for(let i = 0; i < 4; i++) closeTopSheet(); }catch(e){} document.querySelectorAll('.drawer.open, .app-modal.open, .drawer-backdrop.open').forEach(d => d.classList.remove('open')); try{ switchTab('analytics'); }catch(e){} });
    await page.waitForTimeout(400);
  }
  expect(fails, fails.join('\n')).toEqual([]);
});
// Rev 2.32.407 (UI-320): 0 пт переповнення на 320 для КОЖНОЇ вкладки і КОЖНОГО місяця (підзаголовок шапки — найдовший рядок).
test('150b. 320 пт: усі вкладки й усі назви місяців у підзаголовку без переповнення (0 пт)', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 320, height: 640 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  const fails = await page.evaluate(async () => {
    const out = [];
    for(const tab of Object.keys(TAB_META)){
      try{ switchTab(tab); }catch(e){ continue; }
      await new Promise(r => setTimeout(r, 500));
      const sub = document.getElementById('page-subtitle'), main = document.getElementById('main-col');
      for(let m = 1; m <= 12; m++){
        sub.textContent = TAB_META[tab].subtitle(monthLabel('2026-' + String(m).padStart(2, '0')));
        const over = Math.max(document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth);
        if(over > 0) out.push(tab + ' ' + m + ': ' + over + ' пт «' + sub.textContent + '»');
      }
    }
    return out.slice(0, 6);
  });
  expect(fails, fails.join('\n')).toEqual([]);
});
