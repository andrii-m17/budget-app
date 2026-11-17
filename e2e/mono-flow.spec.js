// MONO-FLOW (Rev 2.32.331, клас C): лапка в шапці, група «Додано автоматично», кнопки-категорії, перемикач автододавання. Лише мок (?fixture=typical); дані вигадані.
const { test, expect } = require('@playwright/test');

async function boot(page, w){
  await page.setViewportSize({ width: w || 390, height: 844 });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof openMonoInbox === 'function');
  await page.waitForTimeout(800);
}
const seed = (page, opts) => page.evaluate((o) => {
  const st = MockCloud.state, uid = st.users[0].id, t = (d, h, m) => new Date(2026, 10, d, h, m).toISOString(), now = new Date().toISOString();
  st.tables.mono_connections = [{ id: 'mc1', user_id: uid, status: 'active', connected_at: t(1, 9, 0), backfill_done: true, auto_add: false }];
  st.tables.mono_accounts = [{ id: 'ma1', mono_account_id: 'a1', masked_pan: '537541******0000', account_type: 'black', currency_code: 980, is_jar: false, tracked: true }];
  const base = { user_id: uid, mono_account_id: 'a1', hold: false, skip_reason: null, expense_id: null, notified_at: now, refund_suggest: null, refund_of: null, refund_auto: false, auto_added: false, reviewed_at: null, suggestions: null, decided_at: null };
  const auto = (id, name, c, s, amt, h) => Object.assign({}, base, { id, tx_time: t(12, h, 5), description: name, amount_minor: amt * 100, amount_uah: amt, status: 'added', auto_added: true, decided_at: now, suggested_category: c, suggested_subcategory: s });
  const nw = (id, name, amt, h, sg, cat) => Object.assign({}, base, { id, tx_time: t(12, h, 20), description: name, amount_minor: amt * 100, amount_uah: amt, status: 'new', suggestions: sg, suggested_category: cat || null });
  st.tables.mono_inbox = [];
  if(!o.noAuto) st.tables.mono_inbox.push(auto('a1', 'Тест Самокат', 'Транспорт', 'Самокат', 23, 9), auto('a2', 'Тест Аптека', 'Здоров\'я', 'Ліки', 186, 12), auto('a3', 'Тест Кав\'ярня', 'Харчування', 'Кава', 75, 8));
  if(!o.noNew) st.tables.mono_inbox.push(
    nw('n1', 'Тест Магазин', 84, 14, [{ c: 'Харчування', s: 'Обіди' }, { c: 'Харчування', s: 'Продукти' }, { c: 'Харчування', s: 'Перекус' }], 'Харчування'),
    nw('n2', 'Тест Новий', 320, 17, [{ c: 'Покупки', s: '' }], 'Покупки'),
    nw('n3', 'Тест Невідомий', 41, 18, null, null));
}, opts || {});
const refresh = (page) => page.evaluate(async () => { await monoLoadConnection(); await refreshMonoNewCount(); });
const openInbox = async (page) => { await page.evaluate(() => openMonoInbox({ tab: 'new' })); await page.waitForSelector('#mono-inbox-body .mono-group-label'); };
const bodies = (page, name) => page.evaluate((n) => MockCloud.state.log.filter(l => l.kind === 'rpc-body' && l.name === n).map(l => l.body), name);

for (const w of [390, 320]){
  for (const theme of ['dark', 'light']){
    test('1. @both лапка, група й кнопки-категорії за макетом (' + w + ' пт, ' + theme + ')', async ({ page }) => {
      await boot(page, w); await seed(page); await refresh(page);
      await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);
      const hdr = await page.evaluate(() => { const c = document.getElementById('mono-paw-count'); const wrap = document.getElementById('mono-paw-wrap'); return { vis: wrap.getBoundingClientRect().width > 0, count: c.textContent, dotHidden: document.getElementById('mono-paw-dot').classList.contains('hidden'), banner: !!document.getElementById('mono-banner'), label: document.getElementById('mono-paw-btn').getAttribute('aria-label'), bg: getComputedStyle(c).backgroundColor, info: getComputedStyle(document.documentElement).getPropertyValue('--color-info').trim() }; });
      expect(hdr.vis).toBe(true); expect(hdr.count).toBe('3'); expect(hdr.dotHidden).toBe(true); expect(hdr.banner).toBe(false); expect(hdr.label).toContain('Monobank');
      await page.screenshot({ path: 'e2e-results/mono-flow-header-' + w + '-' + theme + '.png', clip: { x: 0, y: 0, width: w, height: 120 } });
      await openInbox(page);
      const info = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const rows = Array.from(document.querySelectorAll('.mono-auto-row')).map(r => r.textContent);
        const row = q('[data-mono-row="n1"]');
        const btns = Array.from(row.querySelectorAll('.mono-cat-btn')).map(b => ({ t: b.textContent, h: Math.round(b.getBoundingClientRect().height), first: b.classList.contains('first'), after: getComputedStyle(b, '::after').height }));
        const n3 = Array.from(q('[data-mono-row="n3"]').querySelectorAll('.mono-cat-btn')).map(b => b.textContent);
        const n2 = Array.from(q('[data-mono-row="n2"]').querySelectorAll('.mono-cat-btn')).map(b => b.textContent);
        return { label: q('#mono-inbox-body .mono-group-label').textContent, rows, ok: !!q('.mono-auto-ok'), btns, n2, n3, caption: Array.from(document.querySelectorAll('.mono-group-label')).map(x => x.textContent), w: document.documentElement.scrollWidth, vw: innerWidth };
      });
      expect(info.label).toContain('Додано автоматично · 3'); expect(info.rows.length).toBe(3); expect(info.ok).toBe(true);
      expect(info.btns.map(b => b.t)).toEqual(['Харчування · Обіди', 'Харчування · Продукти', 'Харчування · Перекус', 'Інше…']);
      expect(info.btns.every(b => b.h === 32 && b.after === '44px')).toBe(true); expect(info.btns[0].first).toBe(true); expect(info.btns[1].first).toBe(false);
      expect(info.n2).toEqual(['Покупки', 'Інше…']); expect(info.n3).toEqual(['Інше…']);
      expect(info.caption.some(c => /Оберіть категорію · 3/.test(c))).toBe(true);
      expect(info.w).toBeLessThanOrEqual(info.vw); // без горизонтальної прокрутки (на 320 пт кнопки переносяться)
      await page.screenshot({ path: 'e2e-results/mono-flow-' + w + '-' + theme + '.png' });
    });
  }
}

test('2. «Все вірно» — один RPC mono_auto_review(null), група зникає, лапка → число лишається', async ({ page }) => {
  await boot(page); await seed(page); await refresh(page); await openInbox(page);
  await page.locator('.mono-auto-ok').click();
  await expect.poll(() => bodies(page, 'mono_auto_review')).toEqual([{ p_ids: null }]);
  await expect(page.locator('.mono-auto-row')).toHaveCount(0);
});

test('3. кнопка категорії → mono_accept з цією категорією й підкатегорією; «Інше…» відкриває вибір; зміна категорії автододаної', async ({ page }) => {
  await boot(page); await seed(page); await refresh(page); await openInbox(page);
  await page.locator('[data-mono-row="n1"] .mono-cat-btn', { hasText: 'Продукти' }).click();
  await expect.poll(() => bodies(page, 'mono_accept')).toHaveLength(1);
  const b = (await bodies(page, 'mono_accept'))[0];
  expect(b.p_inbox_id).toBe('n1'); expect(b.p_category).toBe('Харчування'); expect(b.p_subcategory).toBe('Продукти');
  await page.locator('[data-mono-row="n3"] [data-mono-other]').click();
  await expect(page.locator('#mono-detail-drawer.open')).toHaveCount(1);
  await page.evaluate(() => closeMonoDetail());
  // автододана: розгортання рядка → кнопка-категорія → mono_recategorize
  await page.locator('.mono-auto-row').first().click();
  await expect(page.locator('.mono-auto-cats')).toHaveCount(1);
});

test('4. лапка: лише автододані → крапка без числа; лише нові → число; нічого → прихована', async ({ page }) => {
  await boot(page); await seed(page, { noNew: true }); await refresh(page);
  const a = await page.evaluate(() => ({ vis: document.getElementById('mono-paw-wrap').getBoundingClientRect().width > 0, count: document.getElementById('mono-paw-count').textContent, dot: !document.getElementById('mono-paw-dot').classList.contains('hidden') }));
  expect(a).toEqual({ vis: true, count: '', dot: true });
  await seed(page, { noAuto: true }); await refresh(page);
  const n = await page.evaluate(() => ({ count: document.getElementById('mono-paw-count').textContent, dot: !document.getElementById('mono-paw-dot').classList.contains('hidden') }));
  expect(n).toEqual({ count: '3', dot: false });
  await seed(page, { noAuto: true, noNew: true }); await refresh(page);
  expect(await page.evaluate(() => document.getElementById('mono-paw-wrap').getBoundingClientRect().width)).toBe(0);
});

test('5. налаштування Monobank: перемикач автододавання → mono_set_auto_add(p_on) і підпис', async ({ page }) => {
  await boot(page); await seed(page); await refresh(page);
  await page.evaluate(async () => { await openMonoScreen(); });
  const sw = page.locator('[data-mono-autoadd]');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#mono-body')).toContainText('Супермаркети завжди чекають вашого вибору.');
  await sw.click();
  await expect.poll(() => bodies(page, 'mono_set_auto_add')).toEqual([{ p_on: true }]);
  await expect(page.locator('[data-mono-autoadd]')).toHaveAttribute('aria-checked', 'true');
});

for (const theme of ['dark', 'light']){
  test('6. @both шапка: лапка в лівій групі, заголовок не рухається й не накривається (320/360/390/440 пт, ' + theme + ', з лапкою і без)', async ({ page }) => {
    for (const w of [320, 360, 390, 440]){
      await boot(page, w); await seed(page, { noAuto: true, noNew: true }); await refresh(page);
      await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);
      const geo = () => page.evaluate(() => { const h = document.getElementById('page-title'); const rg = document.createRange(); rg.selectNodeContents(h); const t = rg.getBoundingClientRect(), p = document.getElementById('mono-paw-btn').getBoundingClientRect(), a = document.getElementById('profile-btn-top').getBoundingClientRect(), b = document.getElementById('notif-bell-btn').getBoundingClientRect(); return { tl: t.left, tr: t.right, paw: [p.left, p.right], av: a.right, bell: b.left, vis: document.getElementById('mono-paw-wrap').getBoundingClientRect().width > 0 }; });
      const without = await geo(); expect(without.vis).toBe(false);
      await page.screenshot({ path: 'e2e-results/mono-flow-hdr-' + w + '-' + theme + '-without.png', clip: { x: 0, y: 0, width: w, height: 120 } });
      await seed(page, { noNew: true }); await refresh(page);
      const withPaw = await geo(); expect(withPaw.vis).toBe(true);
      expect(withPaw.tl, w + ': заголовок не рухається (ліво)').toBeCloseTo(without.tl, 0); expect(withPaw.tr, w + ': заголовок не рухається (право)').toBeCloseTo(without.tr, 0);
      expect(withPaw.paw[0] - withPaw.av, w + ': відступ від аватара 8 pt').toBeCloseTo(8, 0);
      expect(withPaw.paw[1], w + ': лапка не накриває заголовок').toBeLessThanOrEqual(withPaw.tl + 0.5);
      expect(withPaw.tr, w + ': заголовок не накриває дзвіночок').toBeLessThanOrEqual(withPaw.bell + 0.5);
      await page.screenshot({ path: 'e2e-results/mono-flow-hdr-' + w + '-' + theme + '-with.png', clip: { x: 0, y: 0, width: w, height: 120 } });
    }
  });
}
