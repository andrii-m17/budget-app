// Rev 2.32.406 (PUSH-TOAST): тост «Переглянути» для сповіщення при відкритому застосунку. Service worker в E2E заблоковано, тому повідомлення 'push-received' подається викликом pushToastReceive (той самий код, що обробляє повідомлення від SW).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
test.use({ hasTouch: true });
const SHOTS = process.env.DS_SHOTS_DIR;
async function boot(page){
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof pushToastReceive === 'function' && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  return errors;
}
const seed = (page, rows) => page.evaluate(r => { notifArchive.rows = r; notifArchive.unread = r.length; notifArchive.loaded = true; notifQueueWrite([]); updateNotifBell(); window.MockCloud.state.tables.user_notifications = JSON.parse(JSON.stringify(r)); }, rows);
const row = (id, type, data) => ({ id, type, title: 'Т', body: '', data: Object.assign({ type }, data), created_at: new Date().toISOString(), read_at: null });
const receive = (page, type, extra, body) => page.evaluate(([t, e, b]) => pushToastReceive({ title: 'Money Tree', body: b || 'Нові зміни в бюджеті', data: Object.assign({ type: t }, e) }), [type, extra, body]);
const toastBtn = page => page.locator('.success-toast .success-toast-action');
const activeTab = page => page.evaluate(() => { const a = document.querySelector('.tabbar-glass .active, .side-tab.active'); return a && a.dataset.tab; });

test('PUSH-TOAST 1. other-actor-summary: тост із «Переглянути»; кнопка відкриває Журнал і позначає прочитаним', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(600);
  await seed(page, [row('n1', 'other-actor-summary', { push_id: 'p1' }), row('n2', 'backup-reminder', { push_id: 'p2' })]);
  await receive(page, 'other-actor-summary', { push_id: 'p1' }, 'Учасник вніс 3 витрати');
  await expect(toastBtn(page)).toHaveText('Переглянути', { timeout: 4000 });
  await toastBtn(page).tap();
  await expect.poll(() => page.evaluate(() => isJournalOpen), { timeout: 6000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => notifArchive.rows.map(x => !!x.read_at)), { timeout: 6000 }).toEqual([true, false]);
  expect(errors).toEqual([]);
});
test('PUSH-TOAST 2. installment-deadline: «Переглянути» → «Облік → ОЧ»; сповіщення прочитане', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(600);
  await seed(page, [row('i1', 'installment-deadline', { push_id: 'pi' })]);
  await receive(page, 'installment-deadline', { push_id: 'pi' }, 'Наближається платіж за ОЧ');
  await expect(toastBtn(page)).toHaveText('Переглянути', { timeout: 4000 });
  await toastBtn(page).tap();
  await expect.poll(() => activeTab(page), { timeout: 6000 }).toBe('accounting');
  await expect.poll(() => page.evaluate(() => !document.getElementById('acct-tab-panel-installments').classList.contains('hidden')), { timeout: 4000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => notifArchive.rows.map(x => !!x.read_at)), { timeout: 6000 }).toEqual([true]);
  expect(errors).toEqual([]);
});
test('PUSH-TOAST 3. daily-expense-reminder: «Переглянути» → «Витрати»; на тому самому екрані тост без кнопки; Monobank і без маршруту — без тоста', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(600);
  await seed(page, [row('d1', 'daily-expense-reminder', { push_id: 'pd' })]);
  await receive(page, 'daily-expense-reminder', { push_id: 'pd' }, 'Не забудьте внести витрати');
  await expect(toastBtn(page)).toHaveText('Переглянути', { timeout: 4000 });
  await toastBtn(page).tap();
  await expect.poll(() => activeTab(page), { timeout: 6000 }).toBe('vytraty');
  await expect.poll(() => page.evaluate(() => notifArchive.rows.map(x => !!x.read_at)), { timeout: 6000 }).toEqual([true]);
  // той самий екран: тост без кнопки
  await page.waitForTimeout(500);
  await receive(page, 'daily-expense-reminder', { push_id: 'pd2' }, 'Не забудьте внести витрати');
  await expect(page.locator('.success-toast')).toHaveCount(1);
  await expect(toastBtn(page)).toHaveCount(0);
  // Monobank і службові: нового тоста немає
  await page.evaluate(() => { document.querySelectorAll('.success-toast').forEach(e => e.remove()); successToastActive = null; });
  await receive(page, 'mono-inbox', { push_id: 'pm', tag: 'mono-inbox' }); await receive(page, 'ops-alert', { push_id: 'po' }); await receive(page, 'test', { push_id: 'pt' });
  await page.waitForTimeout(700);
  await expect(page.locator('.success-toast')).toHaveCount(0);
  // кілька підряд: одна плашка з останнім текстом
  await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(500);
  await receive(page, 'other-actor-summary', { push_id: 'a1' }, 'Перше'); await receive(page, 'installment-deadline', { push_id: 'a2' }, 'Друге'); await page.waitForTimeout(900);
  await expect(page.locator('.success-toast')).toHaveCount(1);
  expect(await page.locator('.success-toast').textContent()).toContain('Друге');
  expect(errors).toEqual([]);
});
test('PUSH-TOAST знімки (DS_SHOTS_DIR): тост з кнопкою, без кнопки і тост Monobank; темна й світла теми; 320, 390, 430 pt', async ({ page }) => {
  test.skip(!SHOTS, 'потрібен DS_SHOTS_DIR');
  test.setTimeout(300000); fs.mkdirSync(SHOTS, { recursive: true });
  const long = 'Учасниця внесла 12 витрат за сьогодні, перегляньте їх у журналі';
  const names = ['btn', 'nobtn', 'mono'];
  for(const w of [320, 390, 430]){
    await page.setViewportSize({ width: w, height: 760 });
    await boot(page);
    for(const theme of ['dark', 'light']){
      for(const name of names){
        await page.evaluate(t => { document.documentElement.setAttribute('data-theme', t); switchTab('analytics'); document.querySelectorAll('.success-toast').forEach(e => e.remove()); successToastActive = null; }, theme);
        await page.waitForTimeout(500);
        await page.evaluate(([n, long]) => {
          if(n === 'btn') pushToastReceive({ title: 'Money Tree', body: long, data: { type: 'other-actor-summary', push_id: 'x' + Date.now() } });
          else if(n === 'nobtn') showToast({ kind: 'info', icon: 'info', title: long, durationMs: 6000 });
          else showToast({ kind: 'info', icon: 'info', title: 'Нова витрата Monobank', actionLabel: 'Переглянути', durationMs: 6000, onAction: function(){} });
        }, [name, long]);
        await page.waitForTimeout(900);
        const m = await page.evaluate(() => { const t = document.querySelector('.success-toast'), b = t.querySelector('.success-toast-action'), ti = t.querySelector('.success-toast-title'); const lh = parseFloat(getComputedStyle(ti).lineHeight) || 1; return { toast: Math.round(t.getBoundingClientRect().width), btn: b ? Math.round(b.getBoundingClientRect().width) : 0, lines: Math.round(ti.getBoundingClientRect().height / lh), bg: getComputedStyle(t).backgroundColor }; });
        expect(m.lines, name + ' ' + w + ': заголовок ≤ 2 рядків').toBeLessThanOrEqual(2);
        if(m.btn) expect(m.btn, name + ' ' + w + ': кнопка за вмістом (текст + 2×12 px), без фіксованої частки ширини').toBeLessThanOrEqual(132);
        expect(/rgba\(.*,\s*0?\.(9|92)\d*\)/.test(m.bg), 'фон ' + m.bg + ' щільний (.9/.92)').toBe(true);
        await page.screenshot({ path: path.join(SHOTS, 'toast-' + w + '-' + theme + '-' + name + '.png'), clip: { x: 0, y: 0, width: w, height: 210 } });
      }
    }
  }
});
