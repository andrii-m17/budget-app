// SIGNOUT (Rev 2.32.253): вихід на ТЕСТОВОМУ сервері. Нічого не пише в дані сім'ї, лише вхід/вихід «Тест А» і записи client_debug_logs (scenario signout-fallback).
const { test, expect, devices } = require('@playwright/test');
const { loadConfig, signIn, rest, ORIGIN, TEST_REF, PROD_REF } = require('./env');
const cfg = loadConfig();

async function openAndSignIn(browser){
  const context = await browser.newContext({ ...devices['iPhone 14'], baseURL: ORIGIN, serviceWorkers: 'block' });
  await context.addInitScript(c => { window.__TEST_CLOUD__ = c; }, { url: cfg.url, key: cfg.key });
  const page = await context.newPage();
  const logout = [];
  page.on('request', r => { if(r.url().indexOf('/auth/v1/logout') !== -1) logout.push(r.url().replace(cfg.url, '')); });
  await page.goto('/index.html');
  const g = await page.evaluate(async () => { await loadSupabaseSdk(); return { env: CLOUD_ENV.env, url: getSupabaseClient().supabaseUrl }; });
  if(g.env !== 'testcloud' || g.url !== cfg.url || g.url.indexOf(PROD_REF) !== -1 || g.url.indexOf(TEST_REF) === -1) throw new Error('ЗУПИНКА: не тестовий сервер');
  const err = await page.evaluate(async ([e, p]) => { const r = await getSupabaseClient().auth.signInWithPassword({ email: e, password: p }); return r.error ? r.error.message : null; }, [cfg.users.A.email, cfg.users.A.password]);
  if(err) throw new Error('Вхід не вдався: ' + err);
  await page.waitForFunction(() => typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof cloudFamilyId !== 'undefined' && !!cloudFamilyId, null, { timeout: 30000 });
  return { page, context, logout };
}

test('вихід: запит /auth/v1/logout іде на сервер, сесія зникає, звіту про «тихий» вихід нема', async ({ browser }) => {
  const { page, context, logout } = await openAndSignIn(browser);
  const nav = page.waitForEvent('framenavigated');
  await page.evaluate(() => { performSignOut(); });
  await nav;
  await page.waitForLoadState('domcontentloaded');
  expect(logout.length).toBe(1);
  const left = await page.evaluate(() => ({ report: localStorage.getItem('budget-signout-report-v1'), session: Object.keys(localStorage).filter(k => /^sb-.*auth-token$/.test(k)).length }));
  expect(left.report).toBeNull();
  expect(left.session).toBe(0);
  await context.close();
});

test('«тихий» вихід (оновлення токена не вдається, запит на сервер не йде): причина зберігається й відправляється після наступного входу', async ({ browser }) => {
  const { page, context, logout } = await openAndSignIn(browser);
  await page.evaluate(() => { const k = Object.keys(localStorage).find(x => /^sb-.*auth-token$/.test(x)); const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 3600; localStorage.setItem(k, JSON.stringify(s)); });
  await page.route('**/auth/v1/token*', r => r.abort('failed'));
  const nav = page.waitForEvent('framenavigated');
  await page.evaluate(() => { performSignOut(); });
  await nav;
  await page.waitForLoadState('domcontentloaded');
  expect(logout.length).toBe(0); // запит виходу на сервер не пішов
  const rep = await page.evaluate(() => JSON.parse(localStorage.getItem('budget-signout-report-v1') || 'null'));
  expect(rep).not.toBeNull();
  expect(rep.type).toBe('signout-no-server');
  expect(rep.app).toMatch(/^\d+\.\d+\.\d+$/);
  expect(JSON.stringify(rep)).not.toMatch(/token|password/i);
  await page.unroute('**/auth/v1/token*');
  // наступний вхід: звіт іде одним записом у client_debug_logs
  await page.evaluate(async () => { await loadSupabaseSdk(); });
  await page.evaluate(async ([e, p]) => { await getSupabaseClient().auth.signInWithPassword({ email: e, password: p }); }, [cfg.users.A.email, cfg.users.A.password]);
  await page.waitForFunction(() => localStorage.getItem('budget-signout-report-v1') === null, null, { timeout: 30000 });
  const sess = await signIn(cfg, 'A');
  const rows = await rest(cfg, sess, 'GET', 'client_debug_logs', 'select=scenario,app_version,events&scenario=eq.signout-fallback&order=created_at.desc&limit=1');
  expect(rows.ok).toBe(true);
  expect(rows.data[0].events[0].type).toBe('signout-no-server');
  await context.close();
});
