// E2E-CLOUD (Rev 2.32.243): синхронізація «два пристрої» на справжньому ТЕСТОВОМУ сервері Supabase (проєкт з .env.test), лише ОЧ.
// Два браузерні контексти = два телефони («Тест А», «Тест Б»); кількість рядків на сервері перевіряється запитом REST від імені тестового користувача.
// Перед кожним сценарієм і після набору дані тестової сім'ї прибираються звичайними запитами. Робочу базу тести не бачать: адреса береться лише з .env.test й перевіряється двічі.
const { test, expect, devices } = require('@playwright/test');
const { loadConfig, signIn, rest, familyIdOf, cleanFamily, ORIGIN, PROD_REF, TEST_REF } = require('./env');

const cfg = loadConfig();
let sessA, famId;
const opened = [];

test.beforeAll(async () => { sessA = await signIn(cfg, 'A'); famId = await familyIdOf(cfg, sessA); });
test.beforeEach(async () => { sessA = await signIn(cfg, 'A'); await cleanFamily(cfg, sessA, famId); });
test.afterEach(async () => { while(opened.length){ try{ await opened.pop().close(); }catch(e){} } });
test.afterAll(async () => { sessA = await signIn(cfg, 'A'); await cleanFamily(cfg, sessA, famId); });

async function openDevice(browser, who){
  const context = await browser.newContext({ ...devices['iPhone 14'], baseURL: ORIGIN, colorScheme: 'dark', serviceWorkers: 'block' });
  opened.push(context);
  await context.addInitScript(c => { window.__TEST_CLOUD__ = c; }, { url: cfg.url, key: cfg.key }); // адреса й ключ лише з .env.test; у збірці їх нема
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto('/index.html');
  // запобіжник: лише тестовий проєкт; будь-що інше зупиняє прогін до входу
  const g = await page.evaluate(async () => { await loadSupabaseSdk(); return { env: CLOUD_ENV.env, url: getSupabaseClient().supabaseUrl }; });
  if(g.env !== 'testcloud' || g.url !== cfg.url || g.url.indexOf(PROD_REF) !== -1 || g.url.indexOf(TEST_REF) === -1) throw new Error('ЗУПИНКА: клієнт підключено не до тестового проєкту (' + g.env + ' ' + g.url + ')');
  const err = await page.evaluate(async ([e, p]) => { const r = await getSupabaseClient().auth.signInWithPassword({ email: e, password: p }); return r.error ? r.error.message : null; }, [cfg.users[who].email, cfg.users[who].password]);
  if(err) throw new Error('Вхід ' + who + ' не вдався: ' + err);
  await page.waitForFunction(() => typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof cloudFamilyId !== 'undefined' && !!cloudFamilyId && document.querySelector('.tabbar-glass'), null, { timeout: 30000 });
  return { page, context, errors, who };
}
const serverRows = async () => (await rest(cfg, sessA, 'GET', 'installment_accounts', 'select=id,name,initial_amount,created_at,deleted_at&family_id=eq.' + famId + '&order=created_at')).data || [];
const liveRows = async () => (await serverRows()).filter(r => !r.deleted_at);
const names = d => d.page.evaluate(() => installmentAccounts.filter(a => !a.deletedAt).map(a => a.name));
const pull = d => d.page.evaluate(() => pullInstallmentAccountsCore());
const addOch = (d, name, amount) => d.page.evaluate(([n, a]) => addInstallmentAccount(n, a), [name, amount]);
const idxOf = (d, name) => d.page.evaluate(n => installmentAccounts.findIndex(a => a.name === n), name);
// перейменування/зміна суми — тим самим шляхом, що шторка ОЧ (saveInstallmentDrawer)
async function editOch(d, oldName, { name, amount }){
  const i = await idxOf(d, oldName);
  expect(i).toBeGreaterThanOrEqual(0);
  await d.page.evaluate(([idx, n, a]) => { openInstallmentEditor(idx); if(n != null) document.getElementById('iddfielda1').value = n; if(a != null) document.getElementById('idd-initial').value = String(a); return saveInstallmentDrawer(); }, [i, name == null ? null : name, amount == null ? null : amount]);
}
const online = d => d.page.evaluate(() => window.dispatchEvent(new Event('online')));

test('0. запобіжник: застосунок на 127.0.0.1:8936 працює з тестовим проєктом, а не з робочим', async ({ browser }) => {
  const a = await openDevice(browser, 'A');
  const g = await a.page.evaluate(() => ({ env: CLOUD_ENV.env, url: getSupabaseClient().supabaseUrl }));
  expect(g.env).toBe('testcloud');
  expect(g.url).toContain(TEST_REF);
  expect(g.url).not.toContain(PROD_REF);
  expect(a.errors).toEqual([]);
});

test('1. А створює ОЧ: Б бачить її, на сервері один рядок', async ({ browser }) => {
  const a = await openDevice(browser, 'A'), b = await openDevice(browser, 'B');
  await addOch(a, 'Предмет А', 5000);
  await expect.poll(async () => (await liveRows()).length).toBe(1);
  await expect.poll(async () => { await pull(b); return names(b); }).toEqual(['Предмет А']);
  expect((await liveRows()).length).toBe(1);
});

test('2. А перейменовує: Б бачить нову назву, рядок той самий (id), другого немає', async ({ browser }) => {
  const a = await openDevice(browser, 'A'), b = await openDevice(browser, 'B');
  await addOch(a, 'Предмет А', 5000);
  await expect.poll(async () => (await liveRows()).length).toBe(1);
  const id0 = (await liveRows())[0].id;
  await expect.poll(async () => { await pull(b); return names(b); }).toEqual(['Предмет А']);
  await editOch(a, 'Предмет А', { name: 'Предмет Б' });
  await expect.poll(async () => (await liveRows()).map(r => r.name)).toEqual(['Предмет Б']);
  expect((await liveRows())[0].id).toBe(id0);
  await expect.poll(async () => { await pull(b); return names(b); }).toEqual(['Предмет Б']);
  expect((await serverRows()).length).toBe(1);
});

test('3. А офлайн перейменовує, мережа повертається: один рядок, нова назва', async ({ browser }) => {
  const a = await openDevice(browser, 'A');
  await addOch(a, 'Предмет А', 5000);
  await expect.poll(async () => (await liveRows()).length).toBe(1);
  const id0 = (await liveRows())[0].id;
  await a.context.setOffline(true);
  await editOch(a, 'Предмет А', { name: 'Предмет Б' });
  expect((await liveRows())[0].name).toBe('Предмет А'); // сервер ще не знає
  await a.context.setOffline(false); await online(a);
  await expect.poll(async () => (await liveRows()).map(r => r.name), { timeout: 40000 }).toEqual(['Предмет Б']);
  expect((await serverRows()).length).toBe(1);
  expect((await liveRows())[0].id).toBe(id0);
});

test('4. А перейменовує, Б одночасно змінює суму: на сервері обидві зміни, один рядок', async ({ browser }) => {
  const a = await openDevice(browser, 'A'), b = await openDevice(browser, 'B');
  await addOch(a, 'Предмет А', 5000);
  await expect.poll(async () => (await liveRows()).length).toBe(1);
  await expect.poll(async () => { await pull(b); return names(b); }).toEqual(['Предмет А']);
  await a.context.setOffline(true);
  await editOch(a, 'Предмет А', { name: 'Предмет Б' }); // А: нова назва, ще не на сервері
  await editOch(b, 'Предмет А', { amount: 5001 }); // Б: нова сума, одразу на сервер
  await expect.poll(async () => (await liveRows())[0].initial_amount).toBe(5001);
  await a.context.setOffline(false); await online(a);
  await expect.poll(async () => { const r = (await liveRows())[0]; return r && [r.name, r.initial_amount]; }, { timeout: 40000 }).toEqual(['Предмет Б', 5001]);
  expect((await serverRows()).length).toBe(1);
});

test('5. А видаляє ОЧ: у Б запис зникає і не повертається після синхронізації', async ({ browser }) => {
  const a = await openDevice(browser, 'A'), b = await openDevice(browser, 'B');
  await addOch(a, 'Предмет А', 5000);
  await expect.poll(async () => (await liveRows()).length).toBe(1);
  await expect.poll(async () => { await pull(b); return names(b); }).toEqual(['Предмет А']);
  await a.page.evaluate(() => runAccountPurge({ type: 'installment', title: 'Предмет А' }));
  await expect.poll(async () => (await liveRows()).length, { timeout: 30000 }).toBe(0);
  await expect.poll(async () => { await pull(b); return names(b); }, { timeout: 30000 }).toEqual([]);
  await pull(b); await pull(b);
  expect(await names(b)).toEqual([]);
  expect((await liveRows()).length).toBe(0);
});

test('6. локальний запис без id (старий стан) прив’язується міграцією без дубля', async ({ browser }) => {
  const b = await openDevice(browser, 'B'); // Б відкрито до створення: у нього порожньо
  const a = await openDevice(browser, 'A');
  await addOch(a, 'Предмет А', 5000);
  await expect.poll(async () => (await liveRows()).length).toBe(1);
  const row = (await liveRows())[0];
  // імітація старого стану Б: запис із тими самими created_at і сумою, але без жодного id
  await b.page.evaluate(async r => {
    installmentAccounts.push({ name: 'Предмет А (старий)', initialAmount: r.initial_amount, createdAt: r.created_at, updatedAt: new Date().toISOString() });
    await saveInstallmentAccountsLocal();
    await pushInstallmentAccountsPilot();
  }, row);
  expect((await serverRows()).length).toBe(1);
  expect(await b.page.evaluate(() => installmentAccounts.filter(a => !a.deletedAt).map(a => !!a.cloudId))).toEqual([true]);
  expect((await liveRows())[0].id).toBe(row.id);
});
