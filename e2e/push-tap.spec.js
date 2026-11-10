// E2E-1 (Rev 2.32.203, PUSH-TAP): тап по push — холодний старт (застосунок закрито: параметри в URL після перезавантаження сторінки з даними в локальному сховищі) і теплий (повідомлення від service worker).
// Мережа моку з відчутною затримкою (localStorage.__lat), як на реальному холодному старті після довгої паузи.
const { test, expect } = require('@playwright/test');
// Rev 2.32.229: годинник не фіксується: холодний старт (goto) і таймери підсвітки/затримки моку з підміненим годинником поводяться інакше (3 тести падали); тести від дня місяця не залежать.

async function prime(page){
  await page.addInitScript(() => { // затримка відповідей моку для кожного завантаження сторінки
    let mc; Object.defineProperty(window, 'MockCloud', { configurable: true, get(){ return mc; }, set(v){ mc = v; const oi = v.init; v.init = function(){ const r = oi.apply(v, arguments); if(localStorage.getItem('__mono') === '1'){ // підключений Monobank і пачка з двох нових операцій (дані моку живуть у пам'яті сторінки, тож засіваються при кожному старті)
          const st = v.state; const uid = (st.users && st.users[0] && st.users[0].id) || (st.session && st.session.user && st.session.user.id); const t = '2026-10-28T09:00:00.000Z';
          v.otherDevice({ table: 'mono_connections', op: 'insert', row: { id: 'mc1', user_id: uid, status: 'active', connected_at: t, backfill_done: true, auto_add: false } });
          ['m1', 'm2'].forEach((id, i) => v.otherDevice({ table: 'mono_inbox', op: 'insert', row: { id, mono_tx_id: 'tx' + i, mono_account_id: 'a1', tx_time: t, description: 'Тест ' + i, amount_minor: 10000, amount_uah: 100, status: 'new', notified_at: t, expense_id: null } })); } return r; }; const f = v.fetch; v.fetch = function(){ const a = arguments; const ms = Number(localStorage.getItem('__lat') || 0); return new Promise(r => setTimeout(r, ms)).then(() => f.apply(v, a)); }; } });
  });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && installmentAccounts.length && installmentAccounts[0].cloudId);
  await page.waitForTimeout(1200);
  return page.evaluate(() => installmentAccounts[0].cloudId);
}
const coldStart = (page, q) => page.goto('/index.html?fixture=typical&' + q + '&at=' + Date.now());
const activeTab = page => page.evaluate(() => { const a = document.querySelector('.tabbar-glass .active, .side-tab.active'); return a && a.dataset.tab; });
const highlighted = page => page.evaluate(() => document.querySelectorAll('[id^="installment-row-"].just-notified').length);

test('12. push «Платіж за ОЧ», холодний старт з одним installmentId: «Облік → ОЧ» і підсвітка цієї ОЧ, що переживає перемальовування', async ({ page }) => {
  const id = await prime(page);
  await page.evaluate(() => localStorage.setItem('__lat', '1200'));
  await coldStart(page, 'pushAction=installment-deadline&installmentId=' + id);
  await expect.poll(() => activeTab(page), { timeout: 8000 }).toBe('accounting');
  await expect.poll(() => highlighted(page), { timeout: 8000 }).toBeGreaterThan(0);
  await page.evaluate(() => renderAll()); // синхронізація перемальовує списки посеред підсвітки
  await expect.poll(() => highlighted(page), { timeout: 2000 }).toBeGreaterThan(0);
  await expect.poll(() => highlighted(page), { timeout: 6000 }).toBe(0); // підсвітка знімається (3 с)
});

test('13. push про ОЧ: кілька ОЧ (installmentIds) підсвічуються списком; без id — лише перехід у «Облік → ОЧ»', async ({ page }) => {
  const id = await prime(page);
  await page.evaluate(() => localStorage.setItem('__lat', '300'));
  await coldStart(page, 'pushAction=installment-deadline&installmentIds=' + encodeURIComponent('нема-такої,' + id));
  await expect.poll(() => highlighted(page), { timeout: 8000 }).toBeGreaterThan(0);
  await coldStart(page, 'pushAction=installment-deadline');
  await expect.poll(() => activeTab(page), { timeout: 8000 }).toBe('accounting');
  await page.waitForTimeout(1500);
  expect(await highlighted(page)).toBe(0);
});

test('14. push «Платіж за ОЧ», теплий старт (застосунок згорнуто, повідомлення від service worker): перехід і підсвітка', async ({ page }) => {
  const id = await prime(page);
  await page.evaluate(() => { switchTab('analytics'); });
  await page.evaluate(i => { navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'push-action', action: { type: 'installment-deadline', installmentId: i, _at: Date.now() } } })); }, id);
  await expect.poll(() => activeTab(page), { timeout: 8000 }).toBe('accounting');
  await expect.poll(() => highlighted(page), { timeout: 8000 }).toBeGreaterThan(0);
});

test('15. push Monobank, холодний старт при повільній мережі: «Вхідні» відкриваються одразу, не лишаючи на «Аналітиці»', async ({ page }) => {
  await prime(page);
  await page.evaluate(() => { localStorage.setItem('__lat', '4000'); localStorage.setItem('__mono', '1'); });
  await coldStart(page, 'pushAction=mono-inbox&batchTs=' + encodeURIComponent('2026-10-28T09:00:00.000Z'));
  await expect(page.locator('#mono-inbox-screen')).not.toHaveClass(/hidden/, { timeout: 3500 }); // раніше чекали на дані пачки (мережу/ворота Cloud)
  expect(await activeTab(page)).not.toBe('analytics');
});

test('16. push Monobank, теплий старт: «Вхідні» відкриваються з підсвіткою пачки', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('__mono', '1'));
  await prime(page);
  await page.evaluate(() => { navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'push-action', action: { type: 'mono-inbox', batch_ts: '2026-10-28T09:00:00.000Z', _at: Date.now() } } })); });
  await expect(page.locator('#mono-inbox-screen')).not.toHaveClass(/hidden/, { timeout: 8000 });
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('#mono-inbox-body .just-notified').length), { timeout: 8000 }).toBeGreaterThan(0);
});

// PUSH-2 (Rev 2.32.278): перехід за адресою #mono/<id> при відкритому застосунку (notificationclick тоді не викликається; iOS сама відкриває notification.navigate) і запасне повідомлення про нові витрати Monobank.
const rowHl = (page, id) => page.evaluate(i => !!document.querySelector('#mono-inbox-body [data-mono-row="' + i + '"] .just-notified'), id);

test('17. PUSH-2: #mono/<id> у відкритому застосунку — «Вхідні», підсвічений рядок, адреса прибрана, без перезавантаження', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('__mono', '1'));
  await prime(page);
  await page.evaluate(() => { window.__same = 'doc'; location.hash = '#mono/m1'; });
  await expect(page.locator('#mono-inbox-screen')).not.toHaveClass(/hidden/, { timeout: 8000 });
  await expect.poll(() => rowHl(page, 'm1'), { timeout: 8000 }).toBe(true);
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(await page.evaluate(() => window.__same)).toBe('doc'); // той самий документ: hashchange, а не перезавантаження
});

test('18. PUSH-2: #mono/<id> на холодному старті — те саме; невідомий id — просто «Вхідні» без підсвітки', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('__mono', '1'));
  await prime(page);
  await page.goto('/index.html?fixture=typical#mono/m2');
  await expect(page.locator('#mono-inbox-screen')).not.toHaveClass(/hidden/, { timeout: 8000 });
  await expect.poll(() => rowHl(page, 'm2'), { timeout: 8000 }).toBe(true);
  await page.goto('about:blank'); // новий документ: попередня підсвітка не переноситься
  await page.goto('/index.html?fixture=typical#mono/nema-takoi');
  await expect(page.locator('#mono-inbox-screen')).not.toHaveClass(/hidden/, { timeout: 8000 });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.querySelectorAll('#mono-inbox-body .just-notified').length)).toBe(0);
});

test('19. PUSH-2: застосунок знову активний, є нові витрати Monobank після останнього відкриття «Вхідних» — повідомлення з «Переглянути»; після переходу за адресою не показується', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('__mono', '1'); if(!localStorage.getItem('budget-mono-inbox-seen-v1')) localStorage.setItem('budget-mono-inbox-seen-v1', '2026-10-28T08:00:00.000Z'); });
  await prime(page);
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  const toast = page.locator('.success-toast');
  await expect(toast).toContainText('Нових витрат: 2', { timeout: 8000 });
  await expect(toast.locator('.success-toast-action')).toHaveText('Переглянути');
  await toast.locator('.success-toast-action').click();
  await expect(page.locator('#mono-inbox-screen')).not.toHaveClass(/hidden/, { timeout: 8000 });
  // після відкриття «Вхідних» нових немає: повідомлення не повертається
  await page.evaluate(() => { closeMonoInbox(); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1200);
  expect(await page.locator('.success-toast').count()).toBe(0);
});
