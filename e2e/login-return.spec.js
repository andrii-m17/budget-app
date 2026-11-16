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

// Rev 2.32.326 (LOGIN-FORM, C): справжня форма входу й вхід за автозаповненням.
const fillLike = (page, id, value) => page.evaluate(([id, value]) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, [id, value]); // без inputType: так iOS подає автозаповнення
const submits = (page) => page.evaluate(() => recBuf.filter(e => e.type === 'login-submit').map(e => e.by));
test('134a. LOGIN-FORM: автозаповнення обох полів без keydown і дотику — рівно один вхід, поле без фокуса, by autofill', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => document.getElementById('cldfielda1').focus());
  await fillLike(page, 'cldfielda1', 'a@x.test'); await fillLike(page, 'cloud-password', 'pw');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__sign)).toBe(1);
  expect(await page.evaluate(() => document.activeElement === document.body || !['cldfielda1', 'cloud-password'].includes(document.activeElement.id)), 'поле без фокуса').toBe(true);
  expect(await submits(page)).toEqual(['autofill']);
});
test('134b. LOGIN-FORM: form.requestSubmit() (подання від iOS) — рівно один вхід, by ios', async ({ page }) => {
  await boot(page);
  await page.locator('#cldfielda1').fill('a@x.test'); await page.locator('#cloud-password').fill('pw');
  await page.evaluate(() => document.getElementById('cloud-login-form-el').requestSubmit());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__sign)).toBe(1);
  expect(await submits(page)).toEqual(['ios']);
});
test('134c. LOGIN-FORM (контроль): кнопка → by button, Return у паролі → by return; Return у пошті → пароль без входу; ручний набір не викликає автовхід; помилка входу без повтору', async ({ page }) => {
  await boot(page);
  await page.locator('#cldfielda1').fill('a@x.test'); await page.locator('#cloud-password').fill('pw');
  await page.locator('#cloud-login-form .submit-btn').click(); await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__sign)).toBe(1);
  await expect(page.locator('#cloud-auth-error')).toContainText('Не вдалося увійти', { timeout: 5000 });
  await page.locator('#cloud-password').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__sign)).toBe(2);
  expect(await submits(page)).toEqual(['button', 'return']);
  await expect(page.locator('#cloud-auth-error')).toContainText('Не вдалося увійти', { timeout: 5000 });
  // Return у пошті: фокус у пароль, без входу
  await page.locator('#cldfielda1').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  expect(await page.evaluate(() => [window.__sign, document.activeElement.id])).toEqual([2, 'cloud-password']);
  // помилка входу: ті самі автозаповнені значення — без повтору
  await page.evaluate(() => { document.getElementById('cldfielda1').value = ''; document.getElementById('cloud-password').value = ''; document.getElementById('cldfielda1').dispatchEvent(new Event('input', { bubbles: true })); }); // обидва порожні: нова спроба (скидає keydown)
  await fillLike(page, 'cldfielda1', 'z@x.test'); await fillLike(page, 'cloud-password', 'pw2');
  await page.waitForTimeout(900); expect(await page.evaluate(() => window.__sign)).toBe(3);
  await page.waitForTimeout(1800);
  await fillLike(page, 'cldfielda1', 'z@x.test'); await fillLike(page, 'cloud-password', 'pw2');
  await page.waitForTimeout(900); expect(await page.evaluate(() => window.__sign), 'ті самі значення після помилки — без повтору').toBe(3);
});
test('134d. LOGIN-FORM (контроль): ручний набір (keydown/insertText) після заповнення не викликає автовхід', async ({ page }) => {
  await boot(page);
  await page.locator('#cldfielda1').focus(); await page.keyboard.type('a@x.test');
  await page.locator('#cloud-password').focus(); await page.keyboard.type('pw');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__sign), 'ручний набір — без автовходу').toBe(0);
  // заповнення, після якого користувач натиснув клавішу
  await page.evaluate(() => { document.getElementById('cldfielda1').value = ''; document.getElementById('cloud-password').value = ''; });
  await fillLike(page, 'cldfielda1', 'b@x.test'); await fillLike(page, 'cloud-password', 'pw');
  await page.locator('#cloud-password').focus(); await page.keyboard.press('Shift'); // keydown після заповнення
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__sign), 'після заповнення була клавіша — без автовходу').toBe(0);
});

// Rev 2.32.327 (LOGIN-FORM-2, C): автовхід за input/change без умови «без дотику»; поле без фокуса отримує лише change.
const setChange = (page, id, value) => page.evaluate(([id, value]) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }, [id, value]); // лише change
test('135a. LOGIN-FORM-2: дотик до пошти, фокус пошта → пароль → пошта, значення: пошта — input, пароль (без фокуса) — лише change → рівно один вхід, by autofill', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const e = document.getElementById('cldfielda1'), p = document.getElementById('cloud-password'); e.dispatchEvent(new Event('touchstart', { bubbles: true })); e.focus(); p.focus(); e.focus(); });
  await fillLike(page, 'cldfielda1', 'a@x.test');
  await setChange(page, 'cloud-password', 'pw');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__sign)).toBe(1);
  expect(await submits(page)).toEqual(['autofill']);
  const fills = await page.evaluate(() => recBuf.filter(e => e.type === 'login-fill').map(e => e.field + ':' + e.ev + ':' + e.filled));
  expect(fills, JSON.stringify(fills)).toEqual(expect.arrayContaining(['cldfielda1:input:true', 'cloud-password:change:true']));
});
test('135b. LOGIN-FORM-2 (контроль): keydown перед заповненням — подання немає; нова спроба після очищення полів знову працює', async ({ page }) => {
  await boot(page);
  await page.locator('#cldfielda1').focus(); await page.keyboard.press('a');
  await fillLike(page, 'cldfielda1', 'a@x.test'); await fillLike(page, 'cloud-password', 'pw');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__sign), 'після keydown автовходу нема').toBe(0);
});
test('135c. LOGIN-FORM-2: перша подія групи autofill (будь-який by) — те саме одне подання (друге джерело рішення)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { document.getElementById('cldfielda1').value = 'a@x.test'; document.getElementById('cloud-password').value = 'pw'; });
  await page.evaluate(() => { try{ loginAutoCheck(); }catch(e){ window.__err = String(e); } });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__sign)).toBe(1);
  await page.evaluate(() => { loginAutoCheck(); }); await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__sign), 'та сама пара — не повторюється').toBe(1);
});
