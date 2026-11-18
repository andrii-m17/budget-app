// Rev 2.32.356 (DS-3e): перемикач місяця «‹ Місяць ›», скляний список, рядок «минулий місяць»; місяць змінюється лише через onMonthChange
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
async function boot(page, fixture, w, h){
  await page.setViewportSize({ width: w || 390, height: h || 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=' + (fixture || 'typical'));
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
}
const state = (page) => page.evaluate(() => ({ sel: selectedMonth, today: monthKey(localDateISO()), list: currentMonthList(), name: document.getElementById('month-name').textContent.trim(), prevDis: document.getElementById('month-prev').disabled, nextDis: document.getElementById('month-next').disabled, nowOn: document.getElementById('month-now').classList.contains('on'), sub: document.getElementById('page-subtitle').textContent }));
const viewText = (page, tab) => page.evaluate((t) => document.getElementById('view-' + t).innerText.replace(/\s+/g, ' ').trim(), tab);
test('41. стрілки й список змінюють місяць так само, як onMonthChange: ті самі дані на «Аналітиці» й в «Обліку»', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const s0 = await state(page);
  expect(s0.list.length, 'у фікстурі кілька місяців').toBeGreaterThan(1);
  expect(s0.sel).toBe(s0.today); expect(s0.nextDis, '› неактивна на поточному').toBe(true); expect(s0.prevDis).toBe(false);
  await page.click('#month-prev'); await page.waitForTimeout(2500); // лічильники KPI анімуються ~1 с
  const target = (await state(page)).sel; expect(target).toBe(s0.list[s0.list.length - 2]);
  const a1 = await viewText(page, 'analytics'); await page.click('.tabbar-glass button[data-tab="accounting"]'); await page.waitForTimeout(2500); const o1 = await viewText(page, 'accounting');
  // еталон: той самий місяць через onMonthChange на свіжому завантаженні
  await boot(page);
  await page.evaluate((m) => onMonthChange(m), target); await page.waitForTimeout(2500);
  expect(await viewText(page, 'analytics')).toBe(a1);
  await page.click('.tabbar-glass button[data-tab="accounting"]'); await page.waitForTimeout(2500);
  expect(await viewText(page, 'accounting')).toBe(o1);
  // вибір зі списку веде в той самий стан
  await boot(page);
  await page.click('#month-name'); await page.waitForTimeout(400);
  await page.click('#month-menu button[data-m="' + target + '"]'); await page.waitForTimeout(2500);
  expect((await state(page)).sel).toBe(target); expect(await viewText(page, 'analytics')).toBe(a1);
  expect(await page.locator('#month-menu.on').count(), 'вибір закриває список').toBe(0);
});
test('42. межі стрілок: від поточного до першого місяця з даними, назад і вперед; майбутніх немає', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const s0 = await state(page); const n = s0.list.length;
  for (let i = 0; i < n - 1; i++){ await page.click('#month-prev'); await page.waitForTimeout(80); }
  let s = await state(page); expect(s.sel).toBe(s0.list[0]); expect(s.prevDis, '‹ неактивна на першому').toBe(true); expect(s.nextDis).toBe(false);
  await page.click('#month-prev', { force: true, timeout: 1000 }).catch(() => {}); expect((await state(page)).sel).toBe(s0.list[0]);
  for (let i = 0; i < n - 1; i++){ await page.click('#month-next'); await page.waitForTimeout(80); }
  s = await state(page); expect(s.sel).toBe(s0.today); expect(s.nextDis).toBe(true);
  await page.click('#month-name'); await page.waitForTimeout(400);
  const keys = await page.locator('#month-menu button[data-m]').evaluateAll(els => els.map(e => e.dataset.m));
  expect(keys.length).toBe(n); expect(keys.every(k => k <= s0.today), 'майбутніх місяців немає').toBe(true); expect(keys[0]).toBe(s0.today);
  expect(keys).toEqual(s0.list.slice().reverse());
});
test('43. список: скляний, aria, галочка, «поточний», заголовки років, Esc і дотик поза списком закривають', async ({ page }) => {
  await boot(page);
  const s0 = await state(page);
  await page.click('#month-name'); await page.waitForTimeout(450);
  const m = page.locator('#month-menu');
  expect(await m.getAttribute('role')).toBe('menu'); expect(await page.locator('#month-name').getAttribute('aria-expanded')).toBe('true');
  expect(await page.locator('#month-menu button[role="menuitemradio"]').count()).toBe(s0.list.length);
  expect(await page.locator('#month-menu button[aria-checked="true"]').count()).toBe(1);
  expect(await page.locator('#month-menu small').innerText()).toBe('поточний');
  expect(await page.locator('#month-menu .yh').count()).toBeGreaterThan(0);
  const css = await m.evaluate(e => { const c = getComputedStyle(e); return { bf: c.backdropFilter || c.webkitBackdropFilter, bg: c.backgroundColor, w: e.offsetWidth, r: c.borderTopLeftRadius, mh: c.maxHeight }; });
  expect(css.bf).toMatch(/blur\(24px\)/); expect(css.w).toBe(224); expect(css.r).toBe('18px'); expect(css.mh).toBe('340px');
  // всередині вікна
  const box = await m.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  expect(await page.locator('#month-menu.on').count(), 'Esc').toBe(0); expect(await page.locator('#month-name').getAttribute('aria-expanded')).toBe('false');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('month-menu')).backdropFilter), 'закритий список без розмиття').toMatch(/^(none|)$/);
  await page.click('#month-name'); await page.waitForTimeout(400);
  await page.mouse.click(200, 700); await page.waitForTimeout(400);
  expect(await page.locator('#month-menu.on').count(), 'дотик поза списком').toBe(0);
  expect((await state(page)).sel, 'закриття не міняє місяць').toBe(s0.sel);
});
test('44. рядок «минулий місяць»: з\'являється на минулому, веде до поточного, відсутній на поточному й на вкладках без перемикача', async ({ page }) => {
  await boot(page);
  expect((await state(page)).nowOn).toBe(false);
  await page.click('#month-prev'); await page.waitForTimeout(400);
  expect((await state(page)).nowOn).toBe(true);
  expect(await page.locator('#month-now').innerText()).toContain('Ви дивитесь минулий місяць');
  await page.click('.tabbar-glass button[data-tab="structure"]'); await page.waitForTimeout(500);
  expect((await state(page)).nowOn, 'на «Структурі» перемикача немає').toBe(false);
  await page.click('.tabbar-glass button[data-tab="analytics"]'); await page.waitForTimeout(500);
  expect((await state(page)).nowOn).toBe(true);
  await page.click('#month-now button'); await page.waitForTimeout(500);
  const s = await state(page); expect(s.sel).toBe(s.today); expect(s.nowOn).toBe(false);
});
test('45. без даних: лише поточний місяць, обидві стрілки неактивні', async ({ page }) => {
  await boot(page, 'empty');
  const s = await state(page);
  expect(s.list).toEqual([s.today]); expect(s.prevDis).toBe(true); expect(s.nextDis).toBe(true); expect(s.nowOn).toBe(false);
  await page.click('#month-name'); await page.waitForTimeout(400);
  expect(await page.locator('#month-menu button[data-m]').count()).toBe(1);
});
test('46. багато місяців (кілька років): список неперервний, заголовки років, прокручується всередині, вибір дальнього місяця', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page, 'large');
  const s = await state(page);
  for (let i = 1; i < s.list.length; i++){ const [y0, m0] = s.list[i - 1].split('-').map(Number), [y1, m1] = s.list[i].split('-').map(Number); expect((y1 * 12 + m1) - (y0 * 12 + m0), 'неперервність ' + s.list[i]).toBe(1); }
  await page.click('#month-name'); await page.waitForTimeout(450);
  const years = new Set(s.list.map(k => k.slice(0, 4)));
  expect(await page.locator('#month-menu .yh').count()).toBe(years.size);
  if(s.list.length > 8){ const sc = await page.locator('#month-menu').evaluate(e => ({ sh: e.scrollHeight, ch: e.clientHeight })); expect(sc.sh).toBeGreaterThan(sc.ch); }
  const first = s.list[0];
  await page.locator('#month-menu button[data-m="' + first + '"]').scrollIntoViewIfNeeded(); await page.locator('#month-menu button[data-m="' + first + '"]').click(); await page.waitForTimeout(500);
  const s2 = await state(page); expect(s2.sel).toBe(first); expect(s2.prevDis).toBe(true); expect(s2.nowOn).toBe(true);
});
test('47. iPad/десктоп: список відкривається під перемикачем і не виходить за вікно', async ({ page }) => {
  await boot(page, 'typical', 1024, 768);
  await page.click('#month-name'); await page.waitForTimeout(450);
  const b = await page.locator('#month-menu').boundingBox(), p = await page.locator('#month-pill').boundingBox();
  expect(b.y).toBeGreaterThan(p.y + p.height - 1); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(1024);
});
test('48. офлайн: стрілки, список і рядок «минулий місяць» працюють без мережі', async ({ page, context }) => {
  await boot(page);
  await context.setOffline(true); await page.evaluate(() => { window.dispatchEvent(new Event('offline')); });
  const s0 = await state(page);
  await page.click('#month-prev'); await page.waitForTimeout(500);
  expect((await state(page)).sel).toBe(s0.list[s0.list.length - 2]); expect((await state(page)).nowOn).toBe(true);
  await page.click('#month-name'); await page.waitForTimeout(400);
  await page.click('#month-menu button[data-m="' + s0.today + '"]'); await page.waitForTimeout(500);
  expect((await state(page)).sel).toBe(s0.today);
  await context.setOffline(false);
});
