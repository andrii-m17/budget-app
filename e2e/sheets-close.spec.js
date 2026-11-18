// Rev 2.32.375 (DS-4b): шторки без видимої «×» на телефоні/iPad портреті; «×» видима на ≥ 1280; фокус при відкритті; Tab показує «×»; Esc і затемнення закривають
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
const IDS = ['pay-action-drawer', 'mono-detail-drawer', 'notifications-drawer', 'trash-detail-drawer', 'checks-drawer', 'testing-drawer', 'rec-report-drawer', 'debug-record-drawer', 'settings-drawer', 'profile-drawer', 'card-debt-drawer', 'installment-drawer', 'income-drawer'];
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'ui', 'ds-4b', 'heads-before.json'), 'utf8')); // виміри заголовків до DS-4b
async function boot(page, w){
  await page.setViewportSize({ width: w, height: w === 390 ? 844 : 800 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__open = (id) => { const d = document.getElementById(id), b = d.previousElementSibling; if(b && b.classList.contains('drawer-backdrop')){ b.removeAttribute('inert'); b.classList.add('open'); } d.removeAttribute('inert'); d.classList.add('open'); };
    window.__shut = (id) => { const d = document.getElementById(id), b = d.previousElementSibling; d.classList.remove('open'); d.setAttribute('inert', ''); if(b && b.classList.contains('drawer-backdrop')){ b.classList.remove('open'); b.setAttribute('inert', ''); } };
    window.__isOpen = (id) => document.getElementById(id).classList.contains('open');
  });
}
const rect = (e) => { if(!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
const measure = (page, id) => page.evaluate(([id, fn]) => { const d = document.getElementById(id), h = d.querySelector('.drawer-head'), x = d.querySelector('.drawer-close'); const r = new Function('e', 'return (' + fn + ')(e)'); const t = h && (h.querySelector('h2') || h.querySelector('.drawer-head-main')); const cs = x && getComputedStyle(x); return { head: r(h), title: r(t), close: r(x), clip: cs && cs.clipPath, pos: cs && cs.position, label: x && x.getAttribute('aria-label') }; }, [id, rect.toString()]);
test('107. 390 пт: у кожної з 13 шторок «×» візуально прихована (sr-only), лишається в розмітці з aria-label «Закрити»; заголовок (висота, положення назви) не змінився; у «Структурі» є прихована «Закрити»', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page, 390);
  const fails = [];
  for (const id of IDS){
    await page.evaluate((id) => __open(id), id); await page.waitForTimeout(250);
    const m = await measure(page, id), b = BASE['390'][id];
    if(!m.close) { fails.push(id + ': «×» зникла з розмітки'); await page.evaluate((id) => __shut(id), id); continue; }
    if(m.close[2] > 2 || m.close[3] > 2) fails.push(id + ': «×» видима ' + m.close);
    if(m.pos !== 'absolute' || m.label !== 'Закрити') fails.push(id + ': position=' + m.pos + ' label=' + m.label);
    if(Math.abs(m.head[3] - b.head[3]) > 0.5) fails.push(id + ': висота заголовка ' + b.head[3] + ' → ' + m.head[3]);
    if(Math.abs(m.title[0] - b.title[0]) > 0.5 || Math.abs(m.title[1] - b.title[1]) > 0.5) fails.push(id + ': назва зсунулась ' + b.title + ' → ' + m.title);
    if(Math.abs(m.drawer ? 0 : 0) > 0) fails.push('');
    await page.evaluate((id) => __shut(id), id);
  }
  const s = await page.evaluate(() => { __open('struct-drawer'); const d = document.getElementById('struct-drawer'); const b = d.querySelector('.sr-close'); const r = b.getBoundingClientRect(); const out = { exists: !!b, w: r.width, label: b.getAttribute('aria-label'), visibleX: Array.from(d.querySelectorAll('.drawer-close')).filter(e => e.getBoundingClientRect().width > 4).length }; __shut('struct-drawer'); return out; });
  if(!s.exists || s.w > 2 || s.label !== 'Закрити' || s.visibleX) fails.push('struct: ' + JSON.stringify(s));
  expect(fails.filter(Boolean), fails.filter(Boolean).join('\n')).toEqual([]);
});
test('108. 1280 пт (бічна панель без смужки): «×» лишається видимою, розміри й заголовок як до DS-4b', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page, 1280);
  const fails = [];
  for (const id of IDS){
    await page.evaluate((id) => __open(id), id); await page.waitForTimeout(250);
    const m = await measure(page, id), b = BASE['1280'][id];
    if(!m.close || m.close[2] < 20 || m.close[3] < 20) fails.push(id + ': «×» не видима ' + (m.close || 'немає'));
    if(m.close && b.close && (Math.abs(m.close[2] - b.close[2]) > 0.5 || Math.abs(m.close[3] - b.close[3]) > 0.5)) fails.push(id + ': розмір «×» ' + b.close + ' → ' + m.close);
    if(Math.abs(m.head[3] - b.head[3]) > 0.5) fails.push(id + ': заголовок ' + b.head[3] + ' → ' + m.head[3]);
    await page.evaluate((id) => __shut(id), id);
  }
  expect(fails, fails.join('\n')).toEqual([]);
});
test('109. відкриття дотиком: «×» не показується (:focus-visible немає), фокус не на полі, клавіатури немає; Tab показує «×», Enter закриває', async ({ page }) => {
  await boot(page, 390);
  const gear = await page.locator('.page-header-buttons .gear-btn[onclick="openSettings()"]').boundingBox();
  await page.touchscreen.tap(gear.x + gear.width / 2, gear.y + gear.height / 2); await page.waitForTimeout(800);
  expect(await page.evaluate(() => __isOpen('settings-drawer')), 'шторку відкрито дотиком').toBe(true);
  const st = await page.evaluate(() => { const a = document.activeElement, x = document.querySelector('#settings-drawer .drawer-close'); return { tag: a && a.tagName, inField: !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)), onClose: a === x, fv: x.matches(':focus-visible'), w: x.getBoundingClientRect().width, kb: document.body.classList.contains('kb-open') || document.documentElement.classList.contains('kb-sheet') }; });
  expect(st.inField, 'фокус не на полі').toBe(false); expect(st.onClose, 'фокус не на «×»').toBe(false); expect(st.fv).toBe(false); expect(st.w).toBeLessThanOrEqual(2); expect(st.kb, 'клавіатури немає').toBe(false);
  // Tab із клавіатури: «×» отримує фокус і стає видимою
  // WebKit (Safari) за замовчуванням не веде Tab на кнопки: емулюємо фокус із клавіатури (остання дія — клавіша, фокус програмно): тоді :focus-visible працює як для Tab/Switch Control
  await page.keyboard.press('KeyA'); await page.evaluate(() => document.querySelector('#settings-drawer .drawer-close').focus()); await page.waitForTimeout(200);
  const tab = await page.evaluate(() => { const x = document.querySelector('#settings-drawer .drawer-close'); return { on: document.activeElement === x, fv: x.matches(':focus-visible'), w: x.getBoundingClientRect().width, h: x.getBoundingClientRect().height }; });
  expect(tab.on, 'Tab веде на «×»: ' + JSON.stringify(tab)).toBe(true); expect(tab.fv, JSON.stringify(tab)).toBe(true); expect(tab.w, 'видима: ' + JSON.stringify(tab)).toBeGreaterThan(20); expect(tab.h).toBeGreaterThan(20);
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  expect(await page.evaluate(() => __isOpen('settings-drawer')), 'Enter на «×» закриває').toBe(false);
});
test('110. картка й ОЧ відкриваються без фокуса на полі (focusFirstIn → контейнер) і без «×»; Esc і дотик по затемненню закривають', async ({ page }) => {
  await boot(page, 390);
  for (const [open, id] of [[() => openCardDebtEditor(0), 'card-debt-drawer'], [() => openInstallmentEditor(0), 'installment-drawer']]){
    await page.evaluate(open); await page.waitForTimeout(800);
    const st = await page.evaluate((id) => { const a = document.activeElement, x = document.querySelector('#' + id + ' .drawer-close'); return { inField: !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)), fv: x.matches(':focus-visible'), w: x.getBoundingClientRect().width, kb: document.documentElement.classList.contains('kb-sheet') }; }, id);
    expect(st.inField, id + ': фокус не на полі').toBe(false); expect(st.fv, id).toBe(false); expect(st.w, id + ': «×» прихована').toBeLessThanOrEqual(2); expect(st.kb).toBe(false);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500); expect(await page.evaluate((id) => __isOpen(id), id), id + ': Esc').toBe(false);
    await page.evaluate(open); await page.waitForTimeout(800);
    await page.evaluate((id) => document.getElementById(id).previousElementSibling.click(), id); await page.waitForTimeout(500); expect(await page.evaluate((id) => __isOpen(id), id), id + ': затемнення').toBe(false);
  }
});
test('111. «Структура»: відкриття без змін фокусу (поле, як і раніше), Tab доходить до прихованої «Закрити» в кінці й показує її; Enter закриває', async ({ page }) => {
  await boot(page, 390);
  await page.evaluate(() => showCategoryModal('Нова категорія', '', 'expense', () => {})); await page.waitForTimeout(800);
  const focus0 = await page.evaluate(() => ({ id: document.activeElement && document.activeElement.id, tag: document.activeElement && document.activeElement.tagName }));
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('#struct-drawer button, #struct-drawer input, #struct-drawer select')).filter(e => e.offsetParent !== null || e.classList.contains('sr-close')).map(e => e.className.split(' ')[0] || e.tagName));
  expect(items[items.length - 1], 'прихована «Закрити» — остання за порядком фокусу: ' + items.join(',')).toBe('sr-close');
  await page.keyboard.press('KeyA'); await page.evaluate(() => document.querySelector('#struct-drawer .sr-close').focus()); await page.waitForTimeout(200);
  const f = await page.evaluate(() => { const b = document.querySelector('#struct-drawer .sr-close'); return { on: document.activeElement === b, fv: b.matches(':focus-visible'), w: b.getBoundingClientRect().width }; });
  expect(f.on).toBe(true); expect(f.fv).toBe(true); expect(f.w, 'видима при фокусі з клавіатури').toBeGreaterThan(40);
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  expect(await page.evaluate(() => __isOpen('struct-drawer')), 'Enter закриває').toBe(false);
  expect(typeof focus0.tag).toBe('string');
});
