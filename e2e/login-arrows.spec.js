// LOGIN-ARROWS → охоронний тест входу (Rev 2.32.432, TEST-CLEAN): варіант readonly прибрано (рішення власника); лишається перевірка, що поля входу звичайні: жодне не readonly, прямі дотики, Return, друк працюють. Мок; дані вигадані.
const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(800);
  await page.evaluate(() => { showProfileLoginForm(); });
  await page.waitForTimeout(900);
}
const st = (page) => page.evaluate(() => ({ e: document.getElementById('cldfielda1').readOnly, p: document.getElementById('cloud-password').readOnly, a: document.activeElement && document.activeElement.id }));

test('поля входу звичайні: жодне не стає readonly; прямі дотики, Return, друк працюють', async ({ page }) => {
  await boot(page);
  await page.tap('#cldfielda1'); await page.keyboard.type('a@b.test');
  expect(await st(page)).toMatchObject({ e: false, p: false, a: 'cldfielda1' });
  await page.tap('#cloud-password'); await page.keyboard.type('x1');
  expect(await st(page)).toMatchObject({ e: false, p: false, a: 'cloud-password' });
  await page.tap('#cldfielda1'); await page.keyboard.press('Enter');
  expect((await st(page)).a).toBe('cloud-password');
  expect(await page.evaluate(() => [document.getElementById('cldfielda1').value, document.getElementById('cloud-password').value])).toEqual(['a@b.test', 'x1']);
});
