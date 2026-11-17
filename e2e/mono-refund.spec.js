// MONO-REFUND (Rev 2.32.330, клас C): рядки «Вхідних» за макетом docs/ui/mockups/mono-refund-mockup.html (390 пт, обидві теми), «Врахувати» зі свайп-кнопки, тост автоповернення рівно один раз.
// Лише мок (?fixture=typical): сервер mono_* імітується через MockCloud.state; суми й назви вигадані.
const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof openMonoInbox === 'function');
  await page.waitForTimeout(800);
}
const seed = (page) => page.evaluate(() => {
  const st = MockCloud.state, uid = st.users[0].id, t = (d, h, m) => new Date(2026, 10, d, h, m).toISOString();
  st.tables.mono_connections = [{ id: 'mc1', user_id: uid, status: 'active', connected_at: t(1, 9, 0), backfill_done: true, auto_add: false }];
  st.tables.mono_accounts = [{ id: 'ma1', mono_account_id: 'a1', masked_pan: '537541******0000', account_type: 'black', currency_code: 980, is_jar: false, tracked: true }];
  const base = { user_id: uid, mono_account_id: 'a1', hold: false, skip_reason: null, expense_id: null, notified_at: t(12, 9, 0), refund_suggest: null, refund_of: null, refund_auto: false };
  st.tables.mono_inbox = [
    Object.assign({}, base, { id: 'c1', tx_time: t(12, 9, 13), description: 'Тест Самокат', amount_minor: 5000, amount_uah: 50, status: 'new', suggested_category: 'Транспорт', suggested_subcategory: null, refunded_minor: 2700, net_uah: 23 }),
    Object.assign({}, base, { id: 'c2', tx_time: t(12, 8, 0), description: 'Тест Одяг', amount_minor: 120000, amount_uah: 1200, status: 'added', suggested_category: null, expense_id: 'e-x', refunded_minor: 0, net_uah: 1200 }),
    Object.assign({}, base, { id: 'r1', tx_time: t(12, 14, 2), description: 'Скасування. Тест Одяг', amount_minor: 40000, amount_uah: 400, status: 'skipped', skip_reason: 'income_or_refund', refund_suggest: 'c2', suggested_category: null }),
    Object.assign({}, base, { id: 'r2', tx_time: t(12, 9, 16), description: 'Скасування. Тест Самокат', amount_minor: 2700, amount_uah: 27, status: 'refunded', refund_of: 'c1', refund_auto: true, suggested_category: null })
  ];
});
const openInbox = async (page, tab) => { await page.evaluate((t) => openMonoInbox({ tab: t }), tab || 'new'); await page.waitForSelector('#mono-inbox-body .expense-row-swipe'); };

for (const theme of ['dark', 'light']){
  test('1. @both рядки за макетом (' + theme + '): чиста сума, закреслена стара, мітки повернення; підказка у «Нових», автоповернення у «Пропущених»', async ({ page }) => {
    await boot(page); await seed(page);
    await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);
    await openInbox(page, 'new');
    const info = await page.evaluate(() => {
      const row = (id) => document.querySelector('[data-mono-row="' + id + '"]');
      const cs = (el, p) => getComputedStyle(el)[p];
      const lab = row('c1').querySelector('.mono-refund-label'), old = row('c1').querySelector('.mono-old-amount');
      const sug = row('r1').querySelector('button.mono-refund-label');
      return { amount: row('c1').querySelector('.exp-amount').firstChild.textContent, old: old.textContent, oldSize: cs(old, 'fontSize'), oldDeco: cs(old, 'textDecorationLine'), lab: lab.textContent, labSize: cs(lab, 'fontSize'), labBg: cs(lab, 'backgroundColor'), labColor: cs(lab, 'color'),
        sug: sug && sug.textContent, sugAmt: row('r1').querySelector('.exp-amount').textContent, hasSug: !!row('r1'), inNew: !!row('r2'), newTab: document.getElementById('mono-tab-new').textContent,
        w: document.documentElement.scrollWidth, vw: innerWidth };
    });
    expect(info.amount).toMatch(/^−23\s₴$/); expect(info.old).toMatch(/^−50\s₴$/);
    expect(info.oldSize).toBe('12px'); expect(info.oldDeco).toContain('line-through');
    expect(info.lab).toMatch(/^↩ Повернено 27\s₴ із 50\s₴$/); expect(info.labSize).toBe('12px');
    expect(info.labBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(info.sug).toMatch(/^↩ Повернення до витрати 12 лис, 1\s?200\s₴\s›$/); expect(info.sugAmt).toMatch(/^\+400\s₴$/);
    expect(info.hasSug).toBe(true); expect(info.inNew).toBe(false); // автоповернення не у «Нових»
    expect(info.w).toBeLessThanOrEqual(info.vw); // без горизонтальної прокрутки на 390 пт
    await page.screenshot({ path: 'e2e-results/mono-refund-new-' + theme + '-390.png' });
    await openInbox(page, 'skipped');
    const sk = await page.evaluate(() => { const r = document.querySelector('[data-mono-row="r2"]'); return r && r.textContent; });
    expect(sk).toContain('Повернення враховано автоматично'); expect(sk).toMatch(/\+27\s₴/);
  });
}

test('2. рядок-підказка: «Врахувати» (свайп-кнопка) застосовує запропоноване через mono_apply_refund; «Ігнорувати» є; діалог вибору через mono_refund_options', async ({ page }) => {
  await boot(page); await seed(page);
  await page.evaluate(() => { MockCloud.state.rpcResults = { mono_refund_options: [
    { charge_inbox_id: 'c1', expense_id: null, tx_date: '2026-11-12', amount: 23, note: 'Тест Самокат', status: 'new', suggested: false },
    { charge_inbox_id: 'c2', expense_id: 'e-x', tx_date: '2026-11-12', amount: 1200, note: 'Тест Одяг', status: 'added', suggested: true }], mono_apply_refund: { old_amount: 1200, new_amount: 800, deleted: false } }; });
  await openInbox(page, 'new');
  const btns = await page.evaluate(() => Array.from(document.querySelectorAll('[data-mono-row="r1"] .expense-row-actions button')).map(b => b.textContent.trim()));
  expect(btns).toEqual(['Ігнорувати', 'Врахувати']);
  await page.evaluate(() => document.querySelector('[data-mono-row="r1"] [data-mono-consider]').click());
  await expect(page.locator('#app-modal-text')).toContainText('Зменшити «Тест Одяг» з 1\u00a0200 ₴ до 800 ₴');
  await page.locator('#app-modal-confirm-btn').click();
  await expect.poll(() => page.evaluate(() => MockCloud.state.log.filter(l => l.kind === 'rpc-body' && l.name === 'mono_apply_refund').map(l => l.body))).toEqual([{ p_inbox_id: 'r1', p_expense_id: 'e-x' }]);
  // діалог вибору: запропоноване перше, для рядка status new — mono_apply_refund_inbox
  await page.evaluate(() => { MockCloud.state.log.length = 0; });
  await page.evaluate(() => { monoInbox.detailId = 'r1'; return monoRefundStart(); });
  const order = await page.evaluate(() => Array.from(document.querySelectorAll('#mono-detail-refund .mono-row')).map(b => b.textContent));
  expect(order[0]).toContain('Тест Одяг'); expect(order.length).toBe(2);
  expect(await page.evaluate(() => monoRefundApplyCall({ id: 'r1' }, { status: 'new', charge_inbox_id: 'c1' }).fn)).toBe('mono_apply_refund_inbox');
});

test('3. тост автоповернення: перший сигнал лише запам\'ятовується, зміна → один тост «Повернення 27 ₴ враховано», повторний сигнал не дублює; без expense_id тосту немає', async ({ page }) => {
  await boot(page); await seed(page);
  const toasts = () => page.evaluate(() => window.__toasts.slice());
  await page.evaluate(() => { window.__toasts = []; const o = window.showToast; window.showToast = function(x){ window.__toasts.push((x.title || '') + '|' + (x.subtitle || '') + '|' + (x.kind || '')); return o.apply(this, arguments); }; localStorage.removeItem('budget-mono-refund-at-v1'); localStorage.removeItem('budget-mono-refund-toasted-v1'); });
  await page.evaluate(() => { MockCloud.state.monoRefundAt = '2026-11-12T09:16:00.000Z'; return monoRefundSignal(MockCloud.state.monoRefundAt); });
  expect(await toasts()).toEqual([]); // першого разу лише мітка
  await page.evaluate(() => {
    const t = MockCloud.state.tables.mono_inbox, r2 = t.find(x => x.id === 'r2'); r2.expense_id = 'e-y'; r2.decided_at = '2026-11-12T09:30:00.000Z';
    t.find(x => x.id === 'c1').net_uah = 23;
    t.push(Object.assign({}, r2, { id: 'r3', expense_id: null, decided_at: '2026-11-12T09:31:00.000Z' }));
    MockCloud.state.monoRefundAt = '2026-11-12T09:31:00.000Z';
    return monoRefundSignal(MockCloud.state.monoRefundAt);
  });
  await expect.poll(toasts).toEqual(['Повернення 27 ₴ враховано|Тест Самокат: 50 ₴ → 23 ₴|info']);
  await page.evaluate(() => { localStorage.setItem('budget-mono-refund-at-v1', '2026-11-12T09:16:00.000Z'); return monoRefundSignal('2026-11-12T09:31:00.000Z'); });
  await page.waitForTimeout(500);
  expect((await toasts()).length).toBe(1); // той самий id не показується вдруге
});
