// STRUCT-3a2 (Rev 2.32.347): файл js/*.js не завантажився → екран збою без запуску застосунку; наступний успішний старт передає збій у самописець і видаляє ключ.
const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('збій js/util-date.js: екран «Не вдалося завантажити застосунок», initApp не стартує, ключ mt-load-fail; після відновлення — подія load-fail і без ключа', async ({ page }) => {
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/js/util-date.js*', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  await page.goto('/index.html?fixture=typical');
  const box = page.locator('#mt-load-fail');
  await expect(box).toBeVisible();
  await expect(box.locator('h1')).toHaveText('Не вдалося завантажити застосунок');
  await expect(box.locator('p')).toHaveText('Перевірте інтернет і спробуйте ще раз');
  const btn = box.locator('button'); await expect(btn).toHaveText('Оновити');
  const m = await page.evaluate(() => { const b = document.querySelector('#mt-load-fail button'), r = b.getBoundingClientRect(), bx = document.getElementById('mt-load-fail').getBoundingClientRect(), cs = getComputedStyle(b); return { h: Math.round(r.height), radius: cs.borderTopLeftRadius, full: [Math.round(bx.width), Math.round(bx.height)], h1: getComputedStyle(document.querySelector('#mt-load-fail h1')).fontSize + '/' + getComputedStyle(document.querySelector('#mt-load-fail h1')).fontWeight, p: getComputedStyle(document.querySelector('#mt-load-fail p')).fontSize, inputs: document.querySelectorAll('#mt-load-fail input, #mt-load-fail textarea, #mt-load-fail select').length }; });
  expect(m.h).toBe(44); expect(parseFloat(m.radius)).toBeGreaterThanOrEqual(22); expect(m.full).toEqual([390, 844]); expect(m.h1).toBe('17px/600'); expect(m.p).toBe('15px'); expect(m.inputs).toBe(0);
  expect(errs.some(e => /mt-load-fail: util-date\.js/.test(e))).toBe(true); // скрипт зупинено винятком
  expect(await page.evaluate(() => document.getElementById('f-date').value)).toBe(''); // initApp не стартував (він виставляє дату форми)
  const key = await page.evaluate(() => JSON.parse(localStorage.getItem('mt-load-fail')));
  expect(key.files).toEqual(['util-date.js']); expect(typeof key.t).toBe('number'); expect(key.v).toMatch(/^\d+\.\d+\.\d+$/);
  expect(JSON.stringify(key)).not.toMatch(/@|token|email/i);
  // знімки екрана збою в обох темах
  for (const scheme of ['light', 'dark']){ await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(150); await page.screenshot({ path: 'docs/ui/struct-3a2/load-fail-' + scheme + '-390.png', scale: 'css' }); }
  await page.emulateMedia({ colorScheme: null });
  // відновлення: файл знову доступний, «Оновити»
  await page.unroute('**/js/util-date.js*');
  await btn.click();
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.getElementById('f-date').value);
  await expect(page.locator('#mt-load-fail')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mt-load-fail')), { timeout: 8000 }).toBeNull(); // ключ видалено
  const ev = await page.evaluate(() => recBuf.filter(e => e.type === 'load-fail'));
  expect(ev.length).toBe(1); expect(ev[0].files).toBe('util-date.js'); expect(ev[0].ageMin).toBeGreaterThanOrEqual(0); expect(ev[0].loadVer).toMatch(/^\d+_\d+_\d+$/);
});

test('усі файли доступні: екрана збою немає, застосунок стартує, ключа немає', async ({ page }) => {
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.getElementById('f-date').value);
  await expect(page.locator('#mt-load-fail')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('mt-load-fail'))).toBeNull();
  const r = await page.evaluate(() => ({ loaded: window.__MT_FILES.slice().sort(), tags: Array.from(document.querySelectorAll('script[src^="./js/"]')).map(s => s.getAttribute('src').replace(/^\.\/js\//, '').replace(/\?.*$/, '')).sort() }));
  expect(r.loaded).toEqual(r.tags); expect(r.tags.length).toBeGreaterThanOrEqual(5); // кожен підключений файл відзвітував
});
