// NAV-STATE п.5: заголовок шапки при видимій лапці Monobank на 320 pt не накладається на лапку (обрізається «…» між кнопками), кегль не зменшується. Мок; дані вигадані.
// Знімки «до/після»: SHOTS=before|after node ... → docs/ui/nav-state/hdr-<SHOTS>-<тема>-<ширина>-<вкладка>.png
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const TABS = ['analytics', 'accounting', 'vytraty', 'structure', 'service'];
const tag = process.env.SHOTS || '';
async function boot(page, w){
  await page.setViewportSize({ width: w, height: 844 });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof openMonoInbox === 'function');
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const st = MockCloud.state, uid = st.users[0].id, now = new Date().toISOString(), t = (d, h, m) => new Date(2026, 10, d, h, m).toISOString();
    st.tables.mono_connections = [{ id: 'mc1', user_id: uid, status: 'active', connected_at: t(1, 9, 0), backfill_done: true, auto_add: false }]; st.tables.mono_accounts = [];
    const base = { user_id: uid, mono_account_id: 'a1', hold: false, skip_reason: null, expense_id: null, notified_at: now, refund_suggest: null, refund_of: null, refund_auto: false, auto_added: false, reviewed_at: null, suggestions: null, decided_at: null };
    st.tables.mono_inbox = [Object.assign({}, base, { id: 'n1', tx_time: t(12, 14, 20), description: 'Тест Магазин', amount_minor: 8400, amount_uah: 84, status: 'new', suggested_category: null }), Object.assign({}, base, { id: 'n2', tx_time: t(12, 17, 20), description: 'Тест Новий', amount_minor: 32000, amount_uah: 320, status: 'new', suggested_category: null })];
  });
  await page.evaluate(async () => { await monoLoadConnection(); await refreshMonoNewCount(); });
  await page.waitForFunction(() => document.documentElement.classList.contains('mono-paw-on'));
}
// Усі заголовки з лапкою: межі між аватаром і лапкою; текст має вміщатися або бути обрізаним (ellipsis) усередині цих меж
const geo = (page) => page.evaluate(() => {
  const h = document.getElementById('page-title'), r = h.getBoundingClientRect();
  const rg = document.createRange(); rg.selectNodeContents(h); const t = rg.getBoundingClientRect();
  const p = document.getElementById('mono-paw-btn').getBoundingClientRect(), a = document.getElementById('profile-btn-top').getBoundingClientRect(), cs = getComputedStyle(h);
  return { title: h.textContent, boxL: r.left, boxR: r.right, textL: t.left, textR: t.right, pawL: p.left, avR: a.right, clipped: h.scrollWidth > h.clientWidth + 0.5, ell: cs.textOverflow, ov: cs.overflow, fs: cs.fontSize };
});
test('заголовки всіх вкладок при видимій лапці на 320/360 пт: межі h1 між аватаром і лапкою; довгий заголовок обрізається «…»; кегль незмінний', async ({ page }) => {
  const bad = [];
  for (const w of [320, 360]){
    await boot(page, w);
    for (const theme of ['dark', 'light']){
      await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);
      for (const tab of TABS){
        await page.evaluate((t) => { switchTab(t, { noFocus: true }); }, tab);
        await page.waitForTimeout(500);
        const g = await geo(page);
        console.log('GEO ' + w + ' ' + theme + ' ' + tab + ' ' + JSON.stringify(g));
        if (tag && theme && (tab === 'analytics' || tab === 'service' || tab === 'structure')) { fs.mkdirSync('docs/ui/nav-state', { recursive: true }); await page.screenshot({ path: 'docs/ui/nav-state/hdr-' + tag + '-' + theme + '-' + w + '-' + tab + '.png', clip: { x: 0, y: 0, width: w, height: 110 } }); }
        // коробка заголовка не заходить на лапку й аватар; текст або вміщений, або обрізаний у межах коробки; кегль 22 pt (--fs-title2) не зменшено
        const pre = w + ' ' + theme + ' ' + tab + ': ';
        if (g.boxR > g.pawL + 0.5) bad.push(pre + 'права межа h1 ' + g.boxR + ' > ліва межа лапки ' + g.pawL);
        if (g.boxL < g.avR - 0.5) bad.push(pre + 'ліва межа h1 ' + g.boxL + ' < права межа аватара ' + g.avR);
        if (!g.clipped && g.textR > g.pawL + 1) bad.push(pre + 'текст накриває лапку: ' + g.textR + ' > ' + g.pawL);
        if (g.clipped && g.ell !== 'ellipsis') bad.push(pre + 'обрізано без «…»');
        if (g.fs !== '22px') bad.push(pre + 'кегль ' + g.fs);
      }
    }
  }
  expect(bad).toEqual([]);
});
