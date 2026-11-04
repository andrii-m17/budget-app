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

test('6. локальний запис без id (старий стан) прив\u2019язується міграцією без дубля', async ({ browser }) => {
  const b = await openDevice(browser, 'B');
  const T = '2026-10-05T10:00:00.123Z';
  // старий стан Б: локальний запис без жодного id (лише збережений локально, без відправки)
  await b.page.evaluate(async t => { installmentAccounts.push({ name: 'Предмет А (старий)', initialAmount: 5000, createdAt: t, updatedAt: t }); await saveInstallmentAccountsLocal(); }, T);
  // той самий запис уже є на сервері (створений раніше з іншого місця): ті самі created_at і сума, інша назва й id
  const ins = await rest(cfg, sessA, 'POST', 'installment_accounts', '', { family_id: famId, name: 'Предмет А', initial_amount: 5000, created_at: T, updated_at: T });
  expect(ins.ok).toBe(true);
  const rowId = ins.data[0].id;
  // перша синхронізація Б: міграція зіставляє за created_at і сумою (спершу в pull, інакше в push), нового рядка не створює
  await b.page.evaluate(async () => { await pullInstallmentAccountsCore(); await pushInstallmentAccountsPilot(); });
  expect((await serverRows()).length).toBe(1);
  await expect.poll(() => b.page.evaluate(() => installmentAccounts.filter(a => !a.deletedAt).map(a => a.cloudId))).toEqual([rowId]);
  expect(await b.page.evaluate(() => installmentAccounts.length)).toBe(1); // і локально без дубля
});

// ===== Rev 2.32.244 (ID-ALL): картки, категорії, підкатегорії й слова — перейменування з тим самим id на двох пристроях =====
// Дії виконуються тим самим кодом, що й шторки/форми (nameDirty + updatedAt + збереження, яке само запускає відправку); сервер перевіряється звичайними запитами.
const tableRows = async (t, sel) => (await rest(cfg, sessA, 'GET', t, 'select=' + (sel || '*') + '&family_id=eq.' + famId + '&order=created_at')).data || [];
const liveOf = async (t, sel) => (await tableRows(t, sel)).filter(r => !r.deleted_at);
const now = () => new Date().toISOString();
// другий пристрій «підключається пізніше»: спершу типові категорії А доходять до сервера (одночасний перший запуск двох чистих телефонів — окремий, рідкісний випадок, див. звіт 244/245)
const syncedCats = async a => { await expect.poll(async () => (await liveOf('categories')).length, { timeout: 40000 }).toBe(await a.page.evaluate(() => CATEGORIES.length)); };

test('7. картка: А перейменовує, Б бачить нову назву, рядок той самий (id), другого немає; потім Б перейменовує — А бачить', async ({ browser }) => {
  const a = await openDevice(browser, 'A'), b = await openDevice(browser, 'B');
  await a.page.evaluate(() => addBankAccount('Картка А', 1000));
  await expect.poll(async () => (await liveOf('bank_accounts')).length).toBe(1);
  const id0 = (await liveOf('bank_accounts'))[0].id;
  const bankNames = d => d.page.evaluate(() => bankAccounts.map(x => x.name));
  await expect.poll(async () => { await b.page.evaluate(() => pullBankAccountsCore()); return bankNames(b); }).toEqual(['Картка А']);
  await a.page.evaluate(async () => { const x = bankAccounts.find(y => y.name === 'Картка А'); x.nameDirty = true; x.name = 'Картка Б'; x.updatedAt = new Date().toISOString(); await saveBankAccounts(); });
  await expect.poll(async () => (await liveOf('bank_accounts')).map(r => r.name)).toEqual(['Картка Б']);
  expect((await liveOf('bank_accounts'))[0].id).toBe(id0);
  await expect.poll(async () => { await b.page.evaluate(() => pullBankAccountsCore()); return bankNames(b); }).toEqual(['Картка Б']);
  await b.page.evaluate(async () => { const x = bankAccounts.find(y => y.name === 'Картка Б'); x.nameDirty = true; x.name = 'Картка В'; x.updatedAt = new Date().toISOString(); await saveBankAccounts(); });
  await expect.poll(async () => (await liveOf('bank_accounts')).map(r => r.name)).toEqual(['Картка В']);
  await expect.poll(async () => { await a.page.evaluate(() => pullBankAccountsCore()); return bankNames(a); }).toEqual(['Картка В']);
  expect((await tableRows('bank_accounts')).length).toBe(1);
  expect((await liveOf('bank_accounts'))[0].id).toBe(id0);
  expect(a.errors.concat(b.errors)).toEqual([]);
});

const isT = r => String(r.name || '').indexOf('Тест') === 0;
const isTw = r => String(r.keyword || '').indexOf('тестслово') === 0;
test('8. категорія: А перейменовує — назва у витраті змінилась, category_id той самий; Б бачить нову назву; рядок один; типові категорії не дублюються', async ({ browser }) => {
  const a = await openDevice(browser, 'A');
  await a.page.evaluate(async t => { CATEGORIES.push({ name: 'Тест Ї', type: 'Гнучка', active: true, createdAt: t, updatedAt: t, clientId: generateUUID() }); await saveCategories(); }, now());
  await syncedCats(a);
  await expect.poll(async () => (await liveOf('categories')).filter(isT).length).toBe(1);
  const b = await openDevice(browser, 'B'); // Б підключається пізніше: його типові категорії зіставляються з серверними за точною назвою
  const id0 = (await liveOf('categories')).filter(isT)[0].id;
  // витрата в цій категорії (запис іде тим самим шляхом, що й звичайна витрата); сервер сам ставить category_id за назвою
  await a.page.evaluate(async t => { const rec = { id: generateUUID(), name: 'Тест', amount: 100, date: t.slice(0, 10), category: 'Тест Ї', subcategory: '', createdAt: t, updatedAt: t }; expenses.push(rec); await saveExpenses(); await pushExpenseRecordPilot(rec); }, now());
  await expect.poll(async () => { const e = (await liveOf('expenses', 'id,category,category_id,deleted_at'))[0]; return e && e.category_id; }).toBe(id0);
  await expect.poll(async () => { await b.page.evaluate(async () => { await pushCategoriesPilot(); await pullCategoriesCore(); }); return b.page.evaluate(() => CATEGORIES.map(c => c.name).filter(n => n.indexOf('Тест') === 0)); }).toEqual(['Тест Ї']);
  await a.page.evaluate(async () => { const c = CATEGORIES.find(x => x.name === 'Тест Ї'); await saveTaxonomyCascade(cascadeTaxonomyRename('category', 'Тест Ї', 'Тест Є')); c.nameDirty = true; c.name = 'Тест Є'; c.updatedAt = new Date().toISOString(); await saveCategories(); });
  await expect.poll(async () => (await liveOf('categories')).filter(isT).map(r => r.name)).toEqual(['Тест Є']);
  expect((await liveOf('categories')).filter(isT)[0].id).toBe(id0);
  await expect.poll(async () => { const e = (await liveOf('expenses', 'id,category,category_id,deleted_at'))[0]; return e && [e.category, e.category_id]; }, { timeout: 30000 }).toEqual(['Тест Є', id0]);
  await expect.poll(async () => { await b.page.evaluate(() => pullCategoriesCore()); return b.page.evaluate(() => CATEGORIES.map(c => c.name).filter(n => n.indexOf('Тест') === 0)); }).toEqual(['Тест Є']);
  expect((await tableRows('categories')).filter(isT).length).toBe(1);
  const all = (await tableRows('categories')).filter(r => !r.deleted_at).map(r => r.name);
  expect(new Set(all).size).toBe(all.length); // типові категорії двох пристроїв зіставлено, дублів назв на сервері нема
  expect(a.errors.concat(b.errors)).toEqual([]);
});

test('9. підкатегорія: А перейменовує, Б бачить нову назву, рядок той самий (id), другого немає', async ({ browser }) => {
  const a = await openDevice(browser, 'A'), b = await openDevice(browser, 'B');
  await a.page.evaluate(async t => { CATEGORIES.push({ name: 'Тест К', type: 'Гнучка', active: true, createdAt: t, updatedAt: t, clientId: generateUUID() }); await saveCategories(); }, now());
  await expect.poll(async () => (await liveOf('categories')).filter(isT).length).toBe(1);
  await a.page.evaluate(async t => { SUBCATEGORIES.push({ name: 'Тест П', category: 'Тест К', active: true, createdAt: t, updatedAt: t, clientId: generateUUID() }); await saveSubcategories(); }, now());
  await expect.poll(async () => (await liveOf('subcategories')).filter(isT).length).toBe(1);
  const id0 = (await liveOf('subcategories')).filter(isT)[0].id;
  const subNames = d => d.page.evaluate(() => SUBCATEGORIES.map(s => s.name).filter(n => n.indexOf('Тест') === 0));
  await expect.poll(async () => { await b.page.evaluate(async () => { await pullCategoriesCore(); await pullSubcategoriesCore(); }); return subNames(b); }).toEqual(['Тест П']);
  await a.page.evaluate(async () => { const s = SUBCATEGORIES.find(x => x.name === 'Тест П'); await saveTaxonomyCascade(cascadeTaxonomyRename('subcategory', 'Тест П', 'Тест Р')); s.nameDirty = true; s.name = 'Тест Р'; s.updatedAt = new Date().toISOString(); await saveSubcategories(); });
  await expect.poll(async () => (await liveOf('subcategories')).filter(isT).map(r => r.name)).toEqual(['Тест Р']);
  expect((await liveOf('subcategories')).filter(isT)[0].id).toBe(id0);
  await expect.poll(async () => { await b.page.evaluate(() => pullSubcategoriesCore()); return subNames(b); }).toEqual(['Тест Р']);
  expect((await tableRows('subcategories')).filter(isT).length).toBe(1);
  expect(a.errors.concat(b.errors)).toEqual([]);
});

test('10. слово: А перейменовує, Б бачить нове ключове слово, рядок той самий (id), другого немає', async ({ browser }) => {
  const a = await openDevice(browser, 'A'), b = await openDevice(browser, 'B');
  await a.page.evaluate(async t => { CATEGORIES.push({ name: 'Тест С', type: 'Гнучка', active: true, createdAt: t, updatedAt: t, clientId: generateUUID() }); await saveCategories(); }, now());
  await expect.poll(async () => (await liveOf('categories')).filter(isT).length).toBe(1);
  await a.page.evaluate(async t => { DICTIONARY.push({ id: generateUUID(), kw: 'тестслово', cat: 'Тест С', sub: null, createdAt: t, updatedAt: t, clientId: generateUUID() }); await saveDictionary(); }, now());
  await expect.poll(async () => (await liveOf('dictionary')).filter(isTw).length).toBe(1);
  const id0 = (await liveOf('dictionary')).filter(isTw)[0].id;
  const words = d => d.page.evaluate(() => DICTIONARY.filter(w => !w.deletedAt && w.kw.indexOf('тестслово') === 0).map(w => w.kw));
  await expect.poll(async () => { await b.page.evaluate(async () => { await pullCategoriesCore(); await pullDictionaryCore(); }); return words(b); }).toEqual(['тестслово']);
  await a.page.evaluate(async () => { const w = DICTIONARY.find(x => x.kw === 'тестслово'); w.nameDirty = true; w.kw = 'тестслово2'; w.updatedAt = new Date().toISOString(); await saveDictionary(); });
  await expect.poll(async () => (await liveOf('dictionary')).filter(isTw).map(r => r.keyword)).toEqual(['тестслово2']);
  expect((await liveOf('dictionary')).filter(isTw)[0].id).toBe(id0);
  await expect.poll(async () => { await b.page.evaluate(() => pullDictionaryCore()); return words(b); }).toEqual(['тестслово2']);
  expect((await tableRows('dictionary')).filter(isTw).length).toBe(1);
  expect(a.errors.concat(b.errors)).toEqual([]);
});
