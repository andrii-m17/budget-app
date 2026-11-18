// Rev 2.32.385 (DS-5a): картка «Сімейний баланс» на моку (?fixture=…; суми вигадані). «Сьогодні» фіксує installClock (E2E_DAY=1|15|31).
// Очікування рахуються на сторінці з тих самих чистих функцій (їхню математику перевіряє tests/balance-card.test.js); тут — проводка: DOM, місяці, розгортання, дотик по графіку, дані з іншого пристрою.
// Знімки (docs/ui/ds-5a/…) — лише з DS_SHOTS_DIR.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const SHOTS = process.env.DS_SHOTS_DIR;
async function boot(page, fixture, w, h){
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.setViewportSize({ width: w || 390, height: h || 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=' + (fixture || 'typical'));
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => switchTab('analytics'));
  await page.waitForTimeout(1800); // поява картки й одометр
  return errors;
}
const snap = page => page.evaluate(() => {
  const el = id => document.getElementById(id), card = el('bal-card');
  const line = card.querySelector('.bal-dline');
  return {
    sel: selectedMonth, today: localDateISO(), sub: el('bal-sub').textContent, final: Number(el('kpi-savings').dataset.final), label: el('kpi-savings').getAttribute('aria-label'),
    segs: card.querySelectorAll('.bal-seg').length, filled: card.querySelectorAll('.bal-seg i').length, line: !!line, lineLeft: line ? line.style.left : null,
    state: card.querySelector('.bal-dstate').textContent.trim(), dsum: card.querySelector('.bal-dsum').textContent.replace(/\s+/g, ' ').trim(),
    expSavings: monthAggregates(selectedMonth).savings, text: card.innerText, open: card.classList.contains('open'),
    freeHint: el('bal-f-hint').textContent, manHint: el('bal-m-hint').textContent, wrapHidden: el('analytics-bal-wrap').classList.contains('hidden')
  };
});
const clean = (s, t) => { expect(s.text, t).not.toMatch(/NaN|Infinity|undefined|null/); };

test('DS-5a 1. поточний місяць: N сегментів, лінія «сьогодні» на T/N, «лишилось N днів» із (N − T + 1), число = залишок місяця', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  const s = await snap(page);
  const m = await page.evaluate(() => { const p = balancePosition(selectedMonth, localDateISO()); return p; });
  expect(m.phase).toBe('current');
  expect(s.segs, 'один сегмент на день місяця').toBe(m.N);
  expect(s.line).toBe(true); expect(parseFloat(s.lineLeft)).toBeCloseTo(m.T / m.N * 100, 1);
  expect(s.sub).toContain('день ' + m.T + ' з ' + m.N);
  expect(s.dsum).toMatch(new RegExp(String(m.N - m.T + 1) + ' (день|дні|днів) лишилось'));
  expect(s.final, 'велике число = залишок місяця').toBe(s.expSavings);
  expect(s.label.replace(/[\s  ]/g, '').replace('−', '-')).toContain(String(Math.abs(s.expSavings)).replace(/\B(?=(\d{3})+(?!\d))/g, ''));
  clean(s, 'без NaN/Infinity'); expect(errors).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); expect(overflow, 'без горизонтальної прокрутки').toBeLessThanOrEqual(0);
});

test('DS-5a 2. розгортання на місці (grid-template-rows), плитки 2×2, дотик і ведення по графіку, згортання', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const h0 = await page.locator('#bal-more').evaluate(e => e.getBoundingClientRect().height);
  expect(h0, 'згорнуто: висота 0').toBeLessThan(2);
  await page.click('#bal-toggle'); await page.waitForTimeout(700);
  expect(await page.getAttribute('#bal-toggle', 'aria-expanded')).toBe('true');
  const h1 = await page.locator('#bal-more').evaluate(e => e.getBoundingClientRect().height);
  expect(h1, 'розкрито: чотири плитки').toBeGreaterThan(200);
  const t = await page.evaluate(() => { const { totalIncome, totalExpense } = monthAggregates(selectedMonth); const ms = mandatoryPaymentsSummary(monthAggregates(selectedMonth).monthExp, totalIncome); return { inc: fmt(totalIncome), exp: fmt(totalExpense), man: fmt(ms.mandatory), free: fmt(ms.freeMoney),
    v: ['bal-v-inc', 'bal-v-exp', 'bal-v-man', 'bal-v-free'].map(id => document.getElementById(id).textContent) }; });
  expect(t.v).toEqual([t.inc, t.exp, t.man, t.free]);
  const fp = await page.evaluate(() => { const { totalIncome, totalExpense, monthExp } = monthAggregates(selectedMonth); const rb = balanceRest(totalIncome, totalExpense, mandatoryPaymentsSummary(monthExp, totalIncome).mandatory); const pd = freePerDay(rb.rest, balancePosition(selectedMonth, localDateISO()));
    return { pct: document.getElementById('bal-f-pct').textContent, hint: document.getElementById('bal-f-hint').textContent, want: rb.rest < 0 ? 'Перевищено на ' + fmt(rb.over) : 'решта ' + fmt(rb.rest), wantHint: pd === null ? '' : (pd > 0 ? '≈ ' + fmt(pd) + ' на день' : 'менше 10 ₴ на день') }; });
  expect(fp.pct).toBe(fp.want); expect(fp.hint).toBe(fp.wantHint);
  await expect(page.locator('#bal-ch-inc svg')).toHaveCount(1); await expect(page.locator('#bal-ch-exp svg')).toHaveCount(1);
  // ведення пальцем (миша дає ті самі pointer-події): вибір місяця, підпис над графіком
  const box = await page.locator('#bal-ch-exp').boundingBox();
  await page.mouse.move(box.x + 8, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2, { steps: 6 });
  await expect(page.locator('#bal-sel-exp')).toContainText(/: .*₴/); expect(await page.locator('#bal-ch-exp circle.on').count()).toBe(1);
  await page.mouse.up();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.up(); // дотик без руху по вибраному знімає вибір
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(100);
  expect((await page.locator('#bal-sel-exp').textContent()).trim()).toMatch(/^за \d+ (місяць|місяці|місяців)$/);
  await page.click('#bal-toggle'); await page.waitForTimeout(700);
  expect(await page.getAttribute('#bal-toggle', 'aria-expanded')).toBe('false');
  expect(await page.locator('#bal-more').evaluate(e => e.getBoundingClientRect().height)).toBeLessThan(2);
});

test('DS-5a 3. минулий місяць: усі дні, без лінії «сьогодні», «місяць завершено»; наступний: «місяць ще не почався»', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const info = await page.evaluate(() => { const list = currentMonthList(), today = monthKey(localDateISO()); return { prev: shiftMonth(today, -1), next: list[list.length - 1], today }; });
  await page.evaluate(m => onMonthChange(m), info.prev); await page.waitForTimeout(1500);
  let s = await snap(page);
  expect(s.sel).toBe(info.prev); expect(s.line).toBe(false); expect(s.sub).toContain('місяць завершено');
  expect(s.segs).toBe(await page.evaluate(m => daysInMonthKey(m), info.prev));
  expect(s.dsum).toMatch(/усі \d+ (день|дні|днів)/); expect(s.freeHint, 'без «на день»').toBe('');
  expect(s.final).toBe(s.expSavings); clean(s, 'минулий');
  await page.evaluate(m => onMonthChange(m), info.next); await page.waitForTimeout(1500);
  s = await snap(page);
  expect(s.sel).toBe(info.next); expect(s.line).toBe(false); expect(s.sub).toContain('місяць ще не почався'); expect(s.state).toBe('Місяць ще не почався');
  expect(s.freeHint).toBe(''); expect(s.filled, 'смуга без заповнення').toBe(0); clean(s, 'наступний');
  await page.evaluate(m => onMonthChange(m), info.today); await page.waitForTimeout(1200);
  expect((await snap(page)).line).toBe(true);
});

test('DS-5a 4. дохід 0: смуга без заповнення й пояснення; витрати більші за дохід: усі дні заповнені; без NaN', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => { const m = selectedMonth; incomes.forEach(i => { if(monthKey(i.date) === m) i.deletedAt = new Date().toISOString(); }); renderDashboard(); });
  await page.waitForTimeout(600);
  let s = await snap(page);
  expect(s.state).toContain('Немає доходів'); expect(s.filled).toBe(0); expect(s.freeHint).toBe(''); expect(s.manHint).toBe(''); clean(s, 'дохід 0');
  await expect(page.locator('#bal-f-pct'), 'доходу немає, а витрати є: перевищено').toContainText('Перевищено на');
  await page.evaluate(() => { const m = selectedMonth; incomes.push({ id: 'ds5a-inc', date: m + '-01', amount: 1000, source: 'x', note: '', deletedAt: null }); expenses.push({ id: 'ds5a-exp', date: m + '-01', amount: 5000, category: expenses[0].category, subcategory: '', note: '', deletedAt: null }); renderDashboard(); });
  await page.waitForTimeout(600);
  s = await snap(page);
  expect(s.state).toContain('Витрати перевищили дохід'); expect(s.filled, 'усі дні заповнені').toBe(s.segs); clean(s, 'перевитрата');
  const r = await page.evaluate(() => { const { totalIncome, totalExpense, monthExp } = monthAggregates(selectedMonth); const ms = mandatoryPaymentsSummary(monthExp, totalIncome); const rb = balanceRest(totalIncome, totalExpense, ms.mandatory);
    return { pct: document.getElementById('bal-f-pct').textContent, over: fmt(rb.over), hint: document.getElementById('bal-f-hint').textContent, cls: document.getElementById('bal-f-fill').className, v: document.getElementById('bal-f-fill').style.getPropertyValue('--v'), val: document.getElementById('bal-v-free').textContent, free: fmt(ms.freeMoney), rest: rb.rest }; });
  expect(r.rest).toBeLessThan(0); expect(r.pct, 'підпис плитки «Після обов\'язкових»').toBe('Перевищено на ' + r.over); expect(r.hint, 'без «на день»').toBe('');
  expect(r.cls).toContain('over'); expect(r.v).toBe('1'); expect(r.val, 'значення плитки — вільні (F4 без змін)').toBe(r.free);
  expect(await page.locator('#bal-m-hint').textContent(), 'на плитці обов\'язкових «решти» немає').toBe('');
  expect(await page.locator('#kpi-savings').evaluate(e => e.classList.contains('neg'))).toBe(true);
});

test('DS-5a 5. порожні дані: картка прихована разом з тілом; один запис: без NaN', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page, 'empty');
  expect(await page.evaluate(() => document.getElementById('analytics-bal-wrap').classList.contains('hidden'))).toBe(true);
  await boot(page, 'one');
  const s = await snap(page); expect(s.wrapHidden).toBe(false); clean(s, 'один запис');
});

test('DS-5a 6. дані з іншого пристрою, поки «Аналітика» відкрита: число й смуга оновлюються', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const before = await snap(page);
  await page.evaluate(() => { const d = localDateISO().slice(0, 8) + '01'; window.MockCloud.otherDevice({ table: 'incomes', op: 'insert', row: { id: 'ds5a-other', amount: 7000, income_date: d, note: 'Інший пристрій', source: null } }); });
  await expect.poll(async () => (await snap(page)).final, { timeout: 15000 }).toBe(before.final + 7000);
  const after = await snap(page);
  expect(after.final).toBe(after.expSavings); expect(after.label).not.toBe(before.label); clean(after, 'після синхронізації');
});

test('DS-5a 7. «зменшити рух»: одометр без переходу, анімацій смуги й графіка немає', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  const r = await page.evaluate(() => ({ z: [...document.querySelectorAll('#kpi-savings .odc')].every(c => c.classList.contains('z')), seg: getComputedStyle(document.querySelector('.bal-seg')).animationName, tr: getComputedStyle(document.querySelector('#kpi-savings .odc')).transitionDuration }));
  expect(r.z).toBe(true); expect(r.seg).toBe('none'); expect(parseFloat(r.tr), 'перехід не довший за глобальні 80 мс «зменшити рух»').toBeLessThanOrEqual(0.1);
});

test('DS-5a 8. вузькі екрани 320 і 390, обидві теми: без горизонтальної прокрутки, розгорнута картка вміщується', async ({ page }) => {
  test.setTimeout(180000);
  for (const w of [320, 390]){
    await boot(page, 'typical', w, 844);
    await page.click('#bal-toggle'); await page.waitForTimeout(700);
    for (const theme of ['dark', 'light']){
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(200);
      const o = await page.evaluate(() => { const c = document.getElementById('bal-card').getBoundingClientRect(); const tiles = [...document.querySelectorAll('.bal-kpi')].map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
        return { x: document.documentElement.scrollWidth - window.innerWidth, in: tiles.every(([l, r]) => l >= c.left - 1 && r <= c.right + 1), clip: [...document.querySelectorAll('.bal-kv')].every(e => e.scrollWidth <= e.clientWidth + 1) }; });
      expect(o.x, w + ' ' + theme).toBeLessThanOrEqual(0); expect(o.in).toBe(true); expect(o.clip, 'суми плиток без обрізання').toBe(true);
    }
  }
});

test('ds5a-shots', async ({ page }) => {
  test.skip(!SHOTS, 'потрібен DS_SHOTS_DIR');
  test.setTimeout(300000); fs.mkdirSync(SHOTS, { recursive: true });
  const shot = async (name) => { await page.evaluate(() => { const t = document.querySelector('.tabbar-glass'); if(t) t.style.display = 'none'; }); return page.locator('#bal-card').screenshot({ path: path.join(SHOTS, name + '.png') }); };
  for (const [w, h] of [[390, 844], [320, 700], [1280, 800]]){
    await boot(page, 'typical', w, h);
    const info = await page.evaluate(() => { const list = currentMonthList(), today = monthKey(localDateISO()); return { prev: shiftMonth(today, -1), next: list[list.length - 1], today }; });
    for (const theme of ['dark', 'light']){
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      const tag = w + '-' + theme;
      await page.evaluate(m => onMonthChange(m), info.today); await page.waitForTimeout(1500);
      if (await page.evaluate(() => document.getElementById('bal-card').classList.contains('open'))) { await page.click('#bal-toggle'); await page.waitForTimeout(600); }
      await shot('collapsed-' + tag);
      await page.click('#bal-toggle'); await page.waitForTimeout(1500); await shot('expanded-' + tag); await page.click('#bal-toggle'); await page.waitForTimeout(600);
      await page.evaluate(m => onMonthChange(m), info.prev); await page.waitForTimeout(1500); await shot('past-' + tag);
      await page.evaluate(m => onMonthChange(m), info.next); await page.waitForTimeout(1500); await shot('next-' + tag);
      await page.evaluate(m => onMonthChange(m), info.today); await page.waitForTimeout(800);
      await page.evaluate(() => { const m = selectedMonth; incomes.forEach(i => { if(monthKey(i.date) === m) i.deletedAt = 'x'; }); renderDashboard(); }); await page.waitForTimeout(800); await shot('noincome-' + tag);
      await page.evaluate(() => { const m = selectedMonth; incomes.push({ id: 'shot-inc', date: m + '-01', amount: 1000, source: 'x', note: '', deletedAt: null }); renderDashboard(); }); await page.waitForTimeout(800); await shot('over-' + tag);
      await page.evaluate(() => { const m = selectedMonth; incomes.push({ id: 'shot-inc2', date: m + '-02', amount: 60000, source: 'x', note: '', deletedAt: null }); renderDashboard(); }); await page.click('#bal-toggle'); await page.waitForTimeout(1500); await shot('rest-' + tag);
      await page.reload(); await page.waitForFunction(() => window.MockCloud && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass')); await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(1500);
    }
  }
  await boot(page, 'empty'); await page.screenshot({ path: path.join(SHOTS, 'empty-390.png') });
});
