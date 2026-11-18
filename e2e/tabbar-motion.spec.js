// Rev 2.32.355 (DS-3b): рух таббару — бульбашка в межах капсули, анімація іконки лише при зміні вкладки, reduced-motion, клавіатура, бічна панель
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
async function boot(page, w, h){
  await page.setViewportSize({ width: w || 390, height: h || 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1200);
}
const tb = (tab) => '.tabbar-glass button[data-tab="' + tab + '"]';
// скільки px бульбашка виходить за капсулу протягом ms (0 = ні, у межах); семпл на кожен кадр
const watchBubble = (page, ms) => page.evaluate((ms) => new Promise((res) => {
  const b = document.getElementById('tabbar-bubble'), g = document.getElementById('tabbar-glass'); let worst = 0, frames = 0; const t0 = performance.now();
  (function f(){ const br = b.getBoundingClientRect(), gr = g.getBoundingClientRect(); worst = Math.max(worst, gr.left - br.left, br.right - gr.right); frames++; if(performance.now() - t0 < ms) requestAnimationFrame(f); else res({ worst: Math.round(worst * 100) / 100, frames }); })();
}), ms);
test('35. бульбашка не виходить за капсулу: усі переходи між вкладками, 320/390/430 пт, обидві теми', async ({ page }) => {
  test.setTimeout(240000);
  for (const w of [320, 390, 430]){
    await boot(page, w);
    for (const theme of ['light', 'dark']){
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      // вибір по кутах: найдовші ходи (перша ↔ остання), потім сусідні; «Витрати» ховає бульбашку, її обходимо
      for (const [from, to] of [['analytics', 'service'], ['service', 'analytics'], ['analytics', 'structure'], ['structure', 'accounting'], ['accounting', 'service']]){
        await page.click(tb(from)); await page.waitForTimeout(700);
        const p = watchBubble(page, 750); await page.click(tb(to)); const r = await p;
        expect(r.frames, w + ' ' + theme + ' ' + from + '→' + to + ': кадрів').toBeGreaterThan(10);
        expect(r.worst, w + ' ' + theme + ' ' + from + '→' + to + ': вихід за капсулу, px').toBeLessThanOrEqual(0.5);
      }
    }
  }
});
test('36. анімація іконки: не на старті й не при програмному перемиканні до першого жесту; є при зміні вкладки; немає при повторному дотику', async ({ page }) => {
  await boot(page);
  const anims = () => page.evaluate(() => document.getAnimations().map(a => a.animationName).filter(n => /^tb/.test(n || '')));
  expect(await page.locator('.tb-anim').count(), 'старт').toBe(0); expect(await anims()).toEqual([]);
  await page.evaluate(() => switchTab('structure')); await page.waitForTimeout(100);
  expect(await page.locator('.tb-anim').count(), 'відновлення/програмно до першого жесту').toBe(0);
  await page.click(tb('accounting')); await page.waitForTimeout(60);
  expect(await page.locator(tb('accounting') + '.tb-anim').count(), 'зміна вкладки').toBe(1);
  expect(await anims()).toContain('tbPress');
  await page.waitForTimeout(1000);
  expect(await page.locator('.tb-anim').count(), 'клас знято після анімації').toBe(0);
  await page.click(tb('accounting')); await page.waitForTimeout(80);
  expect(await page.locator('.tb-anim').count(), 'повторний дотик по вибраній').toBe(0); expect(await anims()).toEqual([]);
  // кожна вкладка має свою анімацію
  for (const [tab, name] of [['analytics', 'tbSlice'], ['structure', 'tbNode'], ['service', 'tbSpin']]){
    await page.click(tb(tab)); await page.waitForTimeout(80);
    expect(await anims(), tab).toContain(name); await page.waitForTimeout(900);
  }
  // «Витрати»: автофокус відкриває клавіатуру — анімації немає
  await page.click(tb('vytraty')); await page.waitForTimeout(80);
  expect(await page.locator('.tb-anim').count(), 'витрати (автофокус)').toBe(0);
});
test('37. анімації немає при відкритій клавіатурі й відкритій шторці', async ({ page }) => {
  await boot(page);
  await page.click(tb('accounting')); await page.waitForTimeout(900);
  await page.evaluate(() => document.body.classList.add('kb-open')); await page.evaluate(() => switchTab('structure')); await page.waitForTimeout(80);
  expect(await page.locator('.tb-anim').count(), 'kb-open').toBe(0);
  await page.evaluate(() => document.body.classList.remove('kb-open'));
  await page.evaluate(() => { const d = document.createElement('div'); d.className = 'drawer open'; d.id = 'zz-fake'; document.body.appendChild(d); }); await page.evaluate(() => switchTab('service')); await page.waitForTimeout(80);
  expect(await page.locator('.tb-anim').count(), 'шторка').toBe(0);
});
test('38. reduced-motion: бульбашка миттєва, натиску й анімацій іконок немає, колір змінюється', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await page.click(tb('accounting')); await page.waitForTimeout(80);
  expect(await page.locator('.tb-anim').count()).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().map(a => a.animationName).filter(n => /^tb/.test(n || '')))).toEqual([]);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('tabbar-bubble')).transitionDuration)).toMatch(/^0(\.0[0-8])?s/); // загальне правило reduced-motion застосунку обмежує рух ≤ 80 мс
  expect(await page.locator(tb('accounting')).evaluate(e => getComputedStyle(e).color)).not.toBe(await page.locator(tb('structure')).evaluate(e => getComputedStyle(e).color));
  await page.locator(tb('structure')).hover(); await page.mouse.down();
  expect(await page.locator(tb('structure') + ' .tbx').evaluate(e => getComputedStyle(e).scale)).toMatch(/^(1|none)$/); await page.mouse.up();
});
test('39. натиск: іконка й підпис .86, скло й кнопка не стискаються; відпустили — повернулись', async ({ page }) => {
  await boot(page);
  const box = (sel) => page.locator(sel).evaluate(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  const g0 = await box('#tabbar-glass'), b0 = await box(tb('accounting'));
  await page.locator(tb('accounting')).hover(); await page.mouse.down(); await page.waitForTimeout(250);
  expect(await page.locator(tb('accounting') + ' .tbx').evaluate(e => getComputedStyle(e).scale)).toBe('0.86');
  expect(await box('#tabbar-glass')).toEqual(g0); expect(await box(tb('accounting'))).toEqual(b0);
  await page.mouse.up(); await page.waitForTimeout(600);
  expect(await page.locator(tb('accounting') + ' .tbx').evaluate(e => getComputedStyle(e).scale)).toMatch(/^(1|none)$/);
});
test('40. iPad/десктоп із бічною панеллю: таббару й анімацій іконок немає', async ({ page }) => {
  await boot(page, 1280, 800);
  expect(await page.locator('nav.tabbar').evaluate(e => getComputedStyle(e).display)).toBe('none');
  await page.click('.side-tab[data-tab="accounting"]'); await page.waitForTimeout(100);
  expect(await page.locator('.tb-anim').count()).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().map(a => a.animationName).filter(n => /^tb/.test(n || '')))).toEqual([]);
  expect(await page.locator('.side-tab .tbx').count()).toBe(0);
});
