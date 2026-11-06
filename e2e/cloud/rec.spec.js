// REC-1 (Rev 2.32.260): бортовий самописець на ТЕСТОВОМУ сервері. Великий звіт іде частинами в client_debug_logs (scenario 'incident'), чат знаходить його за кодом;
// звіт без мережі стає в чергу й доходить після її появи. Дані сім'ї не чіпаються; тестові рядки звіту прибираються в кінці.
const { test, expect, devices } = require('@playwright/test');
const { loadConfig, signIn, rest, ORIGIN, TEST_REF, PROD_REF } = require('./env');
const cfg = loadConfig();

async function openAndSignIn(browser){
  const context = await browser.newContext({ ...devices['iPhone 14'], baseURL: ORIGIN, serviceWorkers: 'block' });
  await context.addInitScript(c => { window.__TEST_CLOUD__ = c; }, { url: cfg.url, key: cfg.key });
  const page = await context.newPage();
  await page.goto('/index.html');
  const g = await page.evaluate(async () => { await loadSupabaseSdk(); return { env: CLOUD_ENV.env, url: getSupabaseClient().supabaseUrl }; });
  if(g.env !== 'testcloud' || g.url !== cfg.url || g.url.indexOf(PROD_REF) !== -1 || g.url.indexOf(TEST_REF) === -1) throw new Error('ЗУПИНКА: не тестовий сервер');
  const err = await page.evaluate(async ([e, p]) => { const r = await getSupabaseClient().auth.signInWithPassword({ email: e, password: p }); return r.error ? r.error.message : null; }, [cfg.users.A.email, cfg.users.A.password]);
  if(err) throw new Error('Вхід не вдався: ' + err);
  await page.waitForFunction(() => typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof cloudFamilyId !== 'undefined' && !!cloudFamilyId, null, { timeout: 30000 });
  return { page, context };
}
async function fillBuffer(page, n){
  await page.evaluate(count => { for(let i = 0; i < count; i++) pushDebugEvent({ type: 'sheet-anim', drawerId: 'x-drawer', samples: Array.from({ length: 20 }, (_, k) => [k, 700 + k]), phase: 'open', durationMs: 240 }); }, n);
}
const byCode = (sess, code) => rest(cfg, sess, 'GET', 'client_debug_logs', 'select=id,scenario,device,events&scenario=eq.incident&device-%3Ereport-%3E%3Ecode=eq.' + code + '&order=created_at.asc');
async function cleanup(sess, code){ await rest(cfg, sess, 'DELETE', 'client_debug_logs', 'scenario=eq.incident&device-%3Ereport-%3E%3Ecode=eq.' + code); }

test('REC: великий звіт іде частинами, чат знаходить усі частини за кодом', async ({ browser }) => {
  const { page, context } = await openAndSignIn(browser);
  await fillBuffer(page, 1200);
  const res = await page.evaluate(async () => { const r = await recReportNow(); return r; });
  expect(res.status).toBe('sent');
  expect(res.code).toMatch(/^MT-\d{4}-\d{4}$/);
  const sess = await signIn(cfg, 'A');
  const rows = await byCode(sess, res.code);
  expect(rows.ok).toBe(true);
  expect(rows.data.length).toBeGreaterThan(1);
  rows.data.forEach((r, i) => { expect(r.device.report.part).toBe(i + 1); expect(r.device.report.parts).toBe(rows.data.length); expect(r.device.report.trigger).toBe('manual'); expect(r.device.appVersion).toMatch(/^\d+\.\d+\.\d+$/); });
  expect(rows.data.reduce((n, r) => n + r.events.length, 0)).toBeGreaterThan(500);
  expect(JSON.stringify(rows.data)).not.toMatch(/password|token|@/i);
  await cleanup(sess, res.code);
  await context.close();
});
test('REC: без мережі звіт стає в чергу (код уже є), після появи мережі доходить', async ({ browser }) => {
  const { page, context } = await openAndSignIn(browser);
  await fillBuffer(page, 50);
  await context.setOffline(true);
  const res = await page.evaluate(async () => { return await recReportNow(); });
  expect(res.status).toBe('queued');
  expect(res.code).toMatch(/^MT-\d{4}-\d{4}$/);
  await context.setOffline(false);
  await page.evaluate(async () => { await recFlushQueue(); });
  const sess = await signIn(cfg, 'A');
  const rows = await byCode(sess, res.code);
  expect(rows.ok).toBe(true);
  expect(rows.data.length).toBeGreaterThan(0);
  await cleanup(sess, res.code);
  await context.close();
});
