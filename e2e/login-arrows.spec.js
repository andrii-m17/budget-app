// LOGIN-ARROWS (Rev 2.32.430): варіант login-arrows. control — поведінка без змін; readonly — поле без курсора лише для читання; прямий дотик, Return і автозаповнення знімають. Мок; дані вигадані.
const { test, expect } = require('@playwright/test');

async function boot(page, variant){
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(800);
  await page.evaluate((v) => { if (v) setVariant('login-arrows', v); recBuf.length = 0; showProfileLoginForm(); }, variant);
  await page.waitForTimeout(900);
}
const st = (page) => page.evaluate(() => ({ e: document.getElementById('cldfielda1').readOnly, p: document.getElementById('cloud-password').readOnly, a: document.activeElement && document.activeElement.id, ev: recBuf.filter(x => x.type === 'login-ro').map(x => x.ev + ':' + x.field) }));

test('control (типово): жодне поле не стає readonly; прямі дотики, Return, друк як раніше; подій login-ro нема', async ({ page }) => {
  await boot(page, null);
  expect(await page.evaluate(() => getVariant('login-arrows'))).toBe('control');
  await page.tap('#cldfielda1'); await page.keyboard.type('a@b.test');
  expect(await st(page)).toMatchObject({ e: false, p: false, a: 'cldfielda1', ev: [] });
  await page.tap('#cloud-password'); await page.keyboard.type('x1');
  expect(await st(page)).toMatchObject({ e: false, p: false, a: 'cloud-password', ev: [] });
  await page.tap('#cldfielda1'); await page.keyboard.press('Enter');
  expect((await st(page)).a).toBe('cloud-password');
  expect(await page.evaluate(() => [document.getElementById('cldfielda1').value, document.getElementById('cloud-password').value])).toEqual(['a@b.test', 'x1']);
});

test('readonly: фокус у Email → Пароль readonly; прямий дотик по паролю знімає readonly, Email стає readonly; друк працює', async ({ page }) => {
  await boot(page, 'readonly');
  await page.tap('#cldfielda1');
  let s = await st(page);
  expect(s).toMatchObject({ e: false, p: true, a: 'cldfielda1' }); expect(s.ev).toContain('set:password');
  await page.keyboard.type('a@b.test');
  await page.tap('#cloud-password');
  s = await st(page);
  expect(s).toMatchObject({ e: true, p: false, a: 'cloud-password' }); expect(s.ev).toContain('unset-touch:password'); expect(s.ev).toContain('set:email');
  await page.keyboard.type('x1y2');
  expect(await page.evaluate(() => [document.getElementById('cldfielda1').value, document.getElementById('cloud-password').value])).toEqual(['a@b.test', 'x1y2']);
  await page.tap('#cldfielda1');
  s = await st(page); expect(s).toMatchObject({ e: false, p: true, a: 'cldfielda1' });
});

test('readonly: Return з Email переводить на Пароль і знімає readonly (unset-return); друк у пароль працює', async ({ page }) => {
  await boot(page, 'readonly');
  await page.tap('#cldfielda1'); await page.keyboard.type('a@b.test');
  expect((await st(page)).p).toBe(true);
  await page.keyboard.press('Enter');
  const s = await st(page);
  expect(s).toMatchObject({ a: 'cloud-password', p: false, e: true }); expect(s.ev).toContain('unset-return:password');
  await page.keyboard.type('pw12');
  expect(await page.evaluate(() => document.getElementById('cloud-password').value)).toBe('pw12');
});

test('readonly: імітація автозаповнення обох полів (input з insertReplacementText) — значення лишаються, readonly знято на 2 с, потім знову за станом фокуса', async ({ page }) => {
  await boot(page, 'readonly');
  await page.tap('#cldfielda1');
  expect((await st(page)).p).toBe(true);
  await page.evaluate(() => {
    const e = document.getElementById('cldfielda1'), p = document.getElementById('cloud-password');
    e.value = 'saved@user.test'; e.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: 'saved@user.test' }));
    p.value = 'savedpass'; p.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: 'savedpass' }));
  });
  let s = await st(page);
  expect(s).toMatchObject({ e: false, p: false }); expect(s.ev.filter(x => x.indexOf('unset-autofill') === 0).length).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => [document.getElementById('cldfielda1').value, document.getElementById('cloud-password').value])).toEqual(['saved@user.test', 'savedpass']);
  await page.waitForTimeout(2300);
  s = await st(page);
  expect(s).toMatchObject({ e: false, p: true }); // фокус лишився в Email: пароль знову readonly, значення на місці
  expect(await page.evaluate(() => document.getElementById('cloud-password').value)).toBe('savedpass');
});

test('перемикання назад на control знімає readonly на наступному фокусі; закриття форми теж лишає обидва поля вільними', async ({ page }) => {
  await boot(page, 'readonly');
  await page.tap('#cldfielda1');
  expect((await st(page)).p).toBe(true);
  await page.evaluate(() => { setVariant('login-arrows', 'control'); });
  await page.tap('#cloud-password');
  expect(await st(page)).toMatchObject({ e: false, p: false });
  await page.evaluate(() => { setVariant('login-arrows', 'readonly'); document.activeElement.blur(); });
  await page.waitForTimeout(100);
  expect(await st(page)).toMatchObject({ e: false, p: false });
});
