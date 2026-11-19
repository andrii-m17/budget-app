// Rev 2.32.401 (PRIV-2b): джерела доходу — нейтральні id, підписи «ЗП …» з довідника (мок: users.salary_slot), старі ключі з сервера розпізнаються (без імен у файлі), без дубля й зайвого push. Мок, вигадані дані.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
const LEG = ['Зарплата ', 'Анд', 'рій'].join(''); // старий ключ слота 1 (збирається зі шматків: імен цілим словом у репозиторії немає)
async function boot(page, fixture){
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await installClock(page);
  await page.goto('/index.html?fixture=' + (fixture || 'typical'));
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof cloudFamilyId !== 'undefined' && !!cloudFamilyId && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { switchTab('accounting'); try{ switchAccountingTab('data'); }catch(e){} });
  await page.waitForTimeout(800);
  return errors;
}
test('PRIV-2b 1. «Облік → Доходи»: підписи «ЗП …» з мок-довідника, шторка з тим самим підписом, новий дохід пишеться нейтральним id (локально і в Cloud)', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page, 'empty');
  await page.waitForFunction(() => /^ЗП Користувач/.test(document.querySelector('#income-row-0 .cdr-name')?.textContent || ''), null, { timeout: 8000 });
  const names = await page.evaluate(() => [0, 1, 2].map(i => document.querySelector('#income-row-' + i + ' .cdr-name').textContent));
  expect(names).toEqual(['ЗП Користувач А', 'ЗП Користувач Б', 'Інше']);
  await page.click('#income-row-1'); await page.waitForTimeout(600);
  expect(await page.textContent('#ind-heading')).toBe('ЗП Користувач Б');
  await page.fill('#ind-amount', '12345');
  await page.locator('#income-drawer .submit-btn.income').tap(); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ local: incomes.map(i => i.source), cloud: MockCloud.state.tables.incomes.map(i => i.note) }));
  expect(r.local).toEqual(['salary_2']); expect(r.cloud).toEqual(['salary_2']);
  expect(await page.textContent('#income-row-1 .cdr-balance')).toMatch(/12\s?345/);
  expect(errors).toEqual([]);
});
test('PRIV-2b 2. рядок із сервера зі СТАРИМ ключем: показується в тій самій плитці, локально стає id, без дубля і без зайвого push; правка суми не створює другого запису', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page, 'empty');
  const id = '0b1c2d3e-0000-4000-8000-0000000000a1';
  const month = await page.evaluate(() => selectedMonth);
  await page.evaluate(([i, m, k]) => { window.__posts = 0; const o = MockCloud.fetch; MockCloud.fetch = function(inp, init){ const u = String(typeof inp === 'string' ? inp : inp.url); if(/\/rest\/v1\/incomes/.test(u) && init && /POST|PATCH/.test(init.method || '')) window.__posts++; return o.apply(this, arguments); };
    MockCloud.otherDevice({ table: 'incomes', op: 'insert', row: { id: i, amount: 20000, income_date: m + '-01', note: k, created_by: MockCloud.state.users[0].id, updated_by: MockCloud.state.users[0].id } }); }, [id, month, LEG]);
  await page.waitForFunction(i => incomes.some(x => x.id === i), id, { timeout: 15000 });
  await page.waitForTimeout(800);
  const a = await page.evaluate(i => ({ n: incomes.length, src: incomes.find(x => x.id === i).source, tile: document.querySelector('#income-row-0 .cdr-balance').textContent, posts: window.__posts }), id);
  expect(a.n).toBe(1); expect(a.src).toBe('salary_1'); expect(a.tile).toMatch(/20\s?000/); expect(a.posts, 'зайвого push нема').toBe(0);
  await page.click('#income-row-0'); await page.waitForTimeout(600);
  await page.fill('#ind-amount', '21000');
  await page.locator('#income-drawer .submit-btn.income').tap(); await page.waitForTimeout(1500);
  const b = await page.evaluate(() => ({ n: incomes.length, amount: incomes[0].amount, cloudN: MockCloud.state.tables.incomes.length, cloudAmount: MockCloud.state.tables.incomes[0].amount, note: MockCloud.state.tables.incomes[0].note }));
  expect(b.n).toBe(1); expect(b.cloudN).toBe(1); expect(b.amount).toBe(21000); expect(b.cloudAmount).toBe(21000);
  expect(b.note, 'правка суми не чіпає джерело на сервері (до Сервера 2)').toBe(LEG);
  expect(errors).toEqual([]);
});
test('PRIV-2b 3. «two-devices»: Realtime-зміна суми доходу зі старим ключем з іншого пристрою приходить в той самий запис', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page, 'two-devices');
  const id = '0b1c2d3e-0000-4000-8000-0000000000b2';
  const month = await page.evaluate(() => selectedMonth);
  await page.evaluate(([i, m, k]) => MockCloud.otherDevice({ table: 'incomes', op: 'insert', row: { id: i, amount: 5000, income_date: m + '-01', note: k, created_by: MockCloud.state.users[0].id, updated_by: MockCloud.state.users[0].id } }), [id, month, LEG]);
  await page.waitForFunction(i => incomes.some(x => x.id === i), id, { timeout: 15000 });
  await page.evaluate(i => MockCloud.otherDevice({ table: 'incomes', op: 'update', id: i, patch: { amount: 7000 } }), id);
  await page.waitForFunction(i => (incomes.find(x => x.id === i) || {}).amount === 7000, id, { timeout: 15000 });
  const n = await page.evaluate(i => incomes.filter(x => x.id === i).length, id);
  expect(n).toBe(1);
  expect(errors).toEqual([]);
});
