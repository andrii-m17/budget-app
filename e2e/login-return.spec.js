// LOGIN-RET (Rev 2.32.299): вхід по Return у WebKit із підміненим signInWithPassword, що рахує виклики (мережі немає).
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.beforeEach(async ({ page }) => { await installClock(page); });

async function boot(page) {
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'), null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  // Підміна: рахуємо виклики, відповідь із затримкою 1500 мс (щоб перевірити «вхід триває»).
  await page.evaluate(() => {
    window.__sign = 0;
    window.loadSupabaseSdk = async function () {};
    window.getSupabaseClient = function () { return { auth: { signInWithPassword: function () { window.__sign++; return new Promise(r => setTimeout(() => r({ error: { message: 'тест', status: 400 } }), 1500)); } } }; };
    window.openProfileLoginDrawer();
  });
  await page.waitForTimeout(500);
}

test('44a. LOGIN-RET: Return у пошті → фокус у паролі (без входу); Return у паролі → рівно один виклик входу', async ({ page }) => {
  await boot(page);
  await page.locator('#cldfielda1').fill('a@x.test');
  await page.locator('#cloud-password').fill('pw');
  await page.locator('#cldfielda1').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('cloud-password');
  expect(await page.evaluate(() => window.__sign)).toBe(0);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__sign)).toBe(1);
  await expect(page.locator('#cloud-auth-error')).toContainText('Не вдалося увійти', { timeout: 5000 });
});

test('44b. LOGIN-RET: Return + повторний Return + дотик по кнопці під час входу = один виклик; після завершення знову можна', async ({ page }) => {
  await boot(page);
  await page.locator('#cldfielda1').fill('a@x.test');
  await page.locator('#cloud-password').fill('pw');
  await page.locator('#cloud-password').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  await page.locator('#cloud-password').focus();
  await page.keyboard.press('Enter');
  await page.locator('#cloud-login-form .submit-btn').click();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__sign)).toBe(1);
  await expect(page.locator('#cloud-auth-error')).toContainText('Не вдалося увійти', { timeout: 5000 }); // відповідь надійшла: вхід завершено
  await page.locator('#cloud-login-form .submit-btn').click();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__sign)).toBe(2);
});

test('44c. LOGIN-RET: порожні поля — підказка без запиту; Return з IME-складанням не входить', async ({ page }) => {
  await boot(page);
  await page.locator('#cloud-password').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#cloud-auth-error')).toContainText('Вкажіть email і пароль');
  expect(await page.evaluate(() => window.__sign)).toBe(0);
  await page.locator('#cldfielda1').fill('a@x.test'); await page.locator('#cloud-password').fill('pw');
  await page.evaluate(() => { const p = document.getElementById('cloud-password'); p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })); });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__sign)).toBe(0);
});
