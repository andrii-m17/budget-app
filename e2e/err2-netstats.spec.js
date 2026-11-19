// ERR-2: запити до сервера (мок, NET_STATS): звичайна перевірка (дельта) і повна звірка; епізод збою відправки «брудних» записів: повторні спроби йдуть у звичайних перевірках (дельта), не більше SYNC_DIRTY_RETRY_MAX; повних звірок не додається. Синтетичні дані.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test('ERR-2: запити за NET_STATS: дельта / повна / епізод збою (без додаткових повних)', async ({ page }) => {
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const tot = () => window.__netStats.total;
    const run = async (opts) => { const b = tot(); const res = await syncCheck('focus', Object.assign({ force: true }, opts || {})); return { n: tot() - b, full: !!(res && res.plan && res.plan.full) }; };
    await run({ fullReason: 'test-warm' }); // прогрів: стан «вже звірено»
    const delta = await run(), full = await run({ fullReason: 'test-full' });
    // «брудний» запис: живий локальний запис без рядка на сервері → повна звірка його знаходить; відправка стабована як збій
    const id = generateUUID(), t = new Date().toISOString();
    expenses.push({ id: id, name: 'Тест', amount: 100, date: t.slice(0, 10), category: '', subcategory: '', createdAt: t, updatedAt: t, syncedUpdatedAt: t });
    const realBatch = pushExpensesBatched; window.__failPush = true;
    pushExpensesBatched = async (recs) => window.__failPush ? { pushed: 0, failed: recs.length } : realBatch(recs);
    const episode = [await run({ fullReason: 'test-dirty' })];
    for (let i = 0; i < 6; i++) episode.push(await run());
    window.__failPush = false;
    const heal = await run();
    return { delta, full, episode, heal, pending: syncDirtyPending, fails: syncDirtyFails };
  });
  console.log('NETSTATS ' + JSON.stringify(r));
  expect(r.delta.full).toBe(false); expect(r.full.full).toBe(true);
  const fulls = r.episode.map(x => x.full);
  expect(r.heal.full, 'після відновлення знову дельта').toBe(false); expect(r.fails, 'запобіжник: рівно 3 невдалі спроби (початкова + 2 повтори), далі перевірки відправку не чіпають').toBe(3);
  expect(r.episode.slice(1).filter(x => x.n > 1).length, 'повторів у звичайних перевірках: 2, кожен +1 запит').toBe(2);
  expect(fulls.filter(Boolean).length, 'повних у епізоді збою (лише початкова): ' + JSON.stringify(r.episode)).toBeLessThanOrEqual(1);
});
