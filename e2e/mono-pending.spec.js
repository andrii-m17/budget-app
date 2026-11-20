// MONO-PENDING (Rev 2.32.428, клас C): підключення в стані pending без connected_at не показується як «Підключено»: є «Підключення не завершено» і «Оновити токен». Лише мок; дані вигадані.
const { test, expect } = require('@playwright/test');

async function boot(page, conn, w){
  await page.setViewportSize({ width: w || 390, height: 844 });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof openMonoScreen === 'function');
  await page.waitForTimeout(800);
  await page.evaluate((c) => { const st = MockCloud.state; st.tables.mono_connections = c ? [Object.assign({ id: 'mc1', user_id: st.users[0].id, backfill_done: false, auto_add: false }, c)] : []; st.tables.mono_accounts = []; }, conn);
}
const open = async (page) => { await page.evaluate(() => { openMonoScreen(); }); await page.waitForFunction(() => /Стан|Помилка|Підключення|Токен/.test(document.getElementById('mono-body').textContent)); };
const text = (page) => page.evaluate(() => document.getElementById('mono-body').textContent);

test('1. pending без connected_at (давній): «Підключення не завершено», червона крапка, «Оновити токен»; «Підключено» нема; без карток', async ({ page }) => {
  await boot(page, { status: 'pending', connected_at: null });
  await open(page);
  const t = await text(page);
  expect(t).toContain('Підключення не завершено');
  expect(t).toContain('Оновити токен');
  expect(t).not.toContain('Підключено');
  expect(t).not.toContain('Остання операція');
  expect(await page.evaluate(() => !!document.querySelector('#mono-body .mono-dot.err'))).toBe(true);
  // «Оновити токен» відкриває форму токена з кнопкою «Оновити токен»
  await page.evaluate(() => { document.querySelector('[data-mono-action="refresh-token"]').click(); });
  await page.waitForSelector('#fldmono1');
  expect(await page.evaluate(() => document.querySelector('.mono-primary').textContent)).toBe('Оновити токен');
  await page.screenshot({ path: 'e2e-results/mono-pending-incomplete.png', clip: { x: 0, y: 0, width: 390, height: 520 } });
});
test('2. active: «Підключено» і «Остання операція», без «Підключення не завершено»; pending із connected_at — як раніше', async ({ page }) => {
  await boot(page, { status: 'active', connected_at: new Date().toISOString() });
  await open(page);
  let t = await text(page);
  expect(t).toContain('Підключено'); expect(t).toContain('Остання операція'); expect(t).not.toContain('не завершено');
  await boot(page, { status: 'pending', connected_at: new Date().toISOString() });
  await open(page); t = await text(page);
  expect(t).toContain('Підключено'); expect(t).not.toContain('не завершено');
});
test('3. запит у дорозі на цьому пристрої (pending без connected_at, спроба щойно): «Підключаю…», без «Підключено» і «Оновити токен»', async ({ page }) => {
  await boot(page, { status: 'pending', connected_at: null });
  await page.evaluate(() => { monoState.busy = true; monoState.lastAttemptAt = Date.now() - 5000; });
  await open(page);
  const t = await page.evaluate(() => { monoState.showTokenForm = false; renderMonoScreen(); return document.getElementById('mono-body').textContent; });
  expect(t).toContain('Підключаю…'); expect(t).not.toContain('Підключено'); expect(t).not.toContain('не завершено');
});
test('4. error і відсутнє підключення — без змін (error: «Помилка підключення» + «Оновити токен»; немає: форма токена)', async ({ page }) => {
  await boot(page, { status: 'error', connected_at: null, last_error: 'x' });
  await open(page);
  let t = await text(page);
  expect(t).toContain('Помилка підключення'); expect(t).toContain('Оновити токен');
  await boot(page, null);
  await open(page); t = await text(page);
  expect(t).toContain('Токен'); expect(t).not.toContain('Підключено');
});
