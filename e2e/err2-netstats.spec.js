// ERR-2: запити до сервера (мок, NET_STATS): звичайна перевірка (дельта) і повна звірка; епізод збою відправки «брудних» записів: не більше 3 повторних повних, далі дельта. Синтетичні дані.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test('ERR-2: запити за NET_STATS: дельта / повна / епізод збою (≤ 3 повтори)', async ({ page }) => {
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
    return { delta, full, episode, heal, needFull: syncSeenState.needFull };
  });
  console.log('NETSTATS ' + JSON.stringify(r));
  expect(r.delta.full).toBe(false); expect(r.full.full).toBe(true);
  const fulls = r.episode.map(x => x.full);
  expect(r.heal.full, 'після відновлення знову дельта').toBe(false);
  expect(fulls.filter(Boolean).length, 'повних у епізоді збою: ' + JSON.stringify(r.episode)).toBeLessThanOrEqual(4); // перша + ≤ 3 повтори
});
