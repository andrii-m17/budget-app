// Rev 2.32.386 (DS-5b): плитки «Борг» і «ОЧ» та шторки на моку (?fixture=…; суми й назви вигадані). «Сьогодні» фіксує installClock (E2E_DAY=1|15|31).
// Очікування рахуються на сторінці з тих самих розрахунків застосунку (debtTotalsForMonth, debtDeltaCaption, …); формули F5/F6 — tests/debt-och-tiles.test.js. Знімки (docs/ui/ds-5b/…) — лише з DS_SHOTS_DIR.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const SHOTS = process.env.DS_SHOTS_DIR;
test.use({ hasTouch: true });
async function boot(page, fixture, w, h){
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.setViewportSize({ width: w || 390, height: h || 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=' + (fixture || 'typical'));
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    switchTab('analytics');
    window.__swipe = async (sel, dy, steps, gap) => { const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.x + r.width / 2, y0 = r.y + r.height / 2;
      const fire = (type, yy) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: x, clientY: yy, button: type === 'pointerdown' ? 0 : -1 }));
      fire('pointerdown', y0); for (let i = 1; i <= steps; i++){ if(gap) await new Promise(r => setTimeout(r, gap)); fire('pointermove', y0 + dy * i / steps); } fire('pointerup', y0 + dy); };
  });
  await page.waitForTimeout(1800);
  return errors;
}
const isOpen = (page, id) => page.evaluate(id => document.getElementById(id).classList.contains('open'), id);
const tiles = page => page.evaluate(() => {
  const el = id => document.getElementById(id), c = balTilesLast, month = selectedMonth, hasCards = c.hasDebtData && c.cardAsOf.hasData;
  const dc = debtDeltaCaption({ hasDebtData: c.hasDebtData, hasData: c.cardAsOf.hasData, isCurrent: c.cardAsOf.isCurrent, asOfMonth: c.cardAsOf.asOfMonth, deltaKnown: c.cardDeltaKnown, delta: c.cardDelta, month: c.month, prevMonth: c.prevMonth });
  const instList = c.debtNow.list.filter(d => d.kind === 'installment');
  return { month, debtLabel: el('kpi-debt').getAttribute('aria-label'), wantDebt: hasCards ? fmt(c.debtNow.total) : '—', cap: el('bal-debt-cap').textContent.replace(/\u00a0/g, ' '), wantCap: dc.text.replace(/\u00a0/g, ' '), cap2: el('bal-debt-cap2').textContent,
    ochLabel: el('kpi-och').getAttribute('aria-label'), wantOch: instList.length ? fmt(c.debtNow.totalMonthlyInstallment) : '—', icap: el('bal-inst-cap').textContent, icap2: el('bal-inst-cap2').textContent,
    dot1: !el('bal-debt-asof').classList.contains('hidden'), dot2: !el('bal-inst-asof').classList.contains('hidden'), deltaKnown: c.cardDeltaKnown, text: el('bal-pair').innerText };
});
const clean = (t, m) => expect(t, m).not.toMatch(/NaN|Infinity|undefined|null/);

test('DS-5b 1. плитки: числа з чинних розрахунків, підпис дельти лише за фактом обох місяців, без NaN', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  const t = await tiles(page);
  expect(t.debtLabel).toBe(t.wantDebt); expect(t.cap).toBe(t.wantCap); expect(t.ochLabel).toBe(t.wantOch);
  if(!t.deltaKnown) expect(t.cap, 'дельта без факту обох місяців не показується').not.toMatch(/^[−+]/);
  clean(t.text, 'плитки'); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('DS-5b 2. шторка «Борг»: рядки карток, ліміт, без «Разом»; закривається свайпом, Esc і дотиком по затемненню', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => document.getElementById('bal-pair').scrollIntoView({ block: 'center' }));
  await page.click('#bal-debt-btn'); await page.waitForTimeout(600);
  expect(await isOpen(page, 'bal-sheet-debt')).toBe(true);
  const m = await page.evaluate(() => { const d = document.getElementById('bal-sheet-debt'); return { rows: d.querySelectorAll('.bal-dr').length, want: balTilesLast.debtNow.list.filter(x => x.kind === 'card').length, text: d.innerText, inert: d.hasAttribute('inert') }; });
  expect(m.inert).toBe(false); expect(m.rows).toBe(m.want); expect(m.rows).toBeGreaterThan(0);
  expect(m.text).toContain('кредитний ліміт'); expect(m.text).not.toMatch(/Разом|Загальний борг/); clean(m.text, 'шторка боргу');
  await page.evaluate(() => __swipe('#bal-sheet-debt .drawer-handle', 140, 10, 40)); await page.waitForTimeout(600);
  expect(await isOpen(page, 'bal-sheet-debt'), 'свайп вниз закриває').toBe(false);
  await page.click('#bal-debt-btn'); await page.waitForTimeout(600); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  expect(await isOpen(page, 'bal-sheet-debt'), 'Esc закриває').toBe(false);
  await page.click('#bal-debt-btn'); await page.waitForTimeout(600); await page.mouse.click(195, 30); await page.waitForTimeout(500);
  expect(await isOpen(page, 'bal-sheet-debt'), 'дотик по затемненню закриває').toBe(false);
});

test('DS-5b 3. шторка «ОЧ»: логотип, «початкова сума», платіж, смуга, «k з n платежів», «залишок», без «Разом»', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => document.getElementById('bal-pair').scrollIntoView({ block: 'center' }));
  await page.click('#bal-inst-btn'); await page.waitForTimeout(600);
  expect(await isOpen(page, 'bal-sheet-inst')).toBe(true);
  const m = await page.evaluate(() => { const d = document.getElementById('bal-sheet-inst'); return { rows: d.querySelectorAll('.bal-dr').length, want: balTilesLast.debtNow.list.filter(x => x.kind === 'installment' && x.balance > 0).length, text: d.innerText, logos: d.querySelectorAll('.bal-dr .bal-logo svg').length }; });
  expect(m.rows).toBe(m.want); expect(m.logos).toBe(m.rows); expect(m.text).toContain('початкова сума'); expect(m.text).toContain('залишок'); expect(m.text).not.toMatch(/Разом/); clean(m.text, 'шторка ОЧ');
  await page.evaluate(() => __swipe('#bal-sheet-inst .drawer-handle', 140, 10, 40)); await page.waitForTimeout(600);
  expect(await isOpen(page, 'bal-sheet-inst')).toBe(false);
});

test('DS-5b 4. порожні стани: немає боргів і ОЧ — плитки «—», шторки з поясненням, без NaN', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => { debts.forEach(d => { d.deletedAt = new Date().toISOString(); }); renderDashboard(); }); await page.waitForTimeout(800);
  const t = await tiles(page);
  expect(t.debtLabel).toBe('—'); expect(t.cap).toBe('Боргів немає'); expect(t.ochLabel).toBe('—'); expect(t.icap).toBe('ОЧ немає'); expect(t.dot1).toBe(false); clean(t.text, 'порожньо');
  await page.evaluate(() => document.getElementById('bal-pair').scrollIntoView({ block: 'center' }));
  for (const [btn, id] of [['#bal-debt-btn', 'bal-sheet-debt'], ['#bal-inst-btn', 'bal-sheet-inst']]){
    await page.click(btn); await page.waitForTimeout(500);
    expect(await page.evaluate(id => document.querySelectorAll('#' + id + ' .empty-hint').length, id)).toBe(1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  }
});

test('DS-5b 5. ліміт не вказано: у шторці «кредитний ліміт не вказано», крапка, без смуги; початкова сума ОЧ невідома: крапка на плитці й підпис', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => { bankAccounts.forEach(a => { a.creditLimit = null; }); installmentAccounts.forEach(a => { a.initialAmount = null; }); renderDashboard(); }); await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('bal-pair').scrollIntoView({ block: 'center' }));
  await page.click('#bal-debt-btn'); await page.waitForTimeout(600);
  const m = await page.evaluate(() => { const d = document.getElementById('bal-sheet-debt'); return { rows: d.querySelectorAll('.bal-dr').length, noLimit: [...d.querySelectorAll('.bal-dr')].filter(r => r.innerText.includes('кредитний ліміт не вказано')).length, tracks: d.querySelectorAll('.bal-dr .bal-strack').length, dots: d.querySelectorAll('.bal-dr .cdr-dot').length, text: d.innerText }; });
  expect(m.noLimit).toBe(m.rows); expect(m.tracks, 'смуги немає без ліміту').toBe(0); expect(m.dots).toBe(m.rows); clean(m.text, 'без ліміту');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const t = await tiles(page);
  expect(t.icap2).toBe('початкові суми не вказано'); expect(t.dot2, 'крапка неповних даних на плитці ОЧ').toBe(true);
  await page.click('#bal-inst-asof .data-status-dot'); await expect(page.locator('#bal-inst-asof.open')).toHaveCount(1);
  await expect(page.locator('#bal-inst-asof .dsp-text')).toContainText('Не всі дані внесено для');
  await page.click('#bal-inst-asof .dsp-action'); await page.waitForTimeout(500);
  expect(await page.evaluate(() => lastActiveTab)).toBe('accounting');
});

test('DS-5b 6. минулий і наступний місяць: плитки й шторки відкриваються, без NaN і горизонтальної прокрутки', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const info = await page.evaluate(() => { const list = currentMonthList(), today = monthKey(localDateISO()); return { prev: shiftMonth(today, -1), next: list[list.length - 1] }; });
  for (const m of [info.prev, info.next]){
    await page.evaluate(m => onMonthChange(m), m); await page.waitForTimeout(1300);
    const t = await tiles(page); expect(t.month).toBe(m); expect(t.debtLabel).toBe(t.wantDebt); expect(t.cap).toBe(t.wantCap); clean(t.text, m);
    await page.evaluate(() => document.getElementById('bal-pair').scrollIntoView({ block: 'center' }));
    await page.click('#bal-debt-btn'); await page.waitForTimeout(500);
    clean(await page.evaluate(() => document.getElementById('bal-sheet-debt').innerText), 'шторка ' + m); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

test('DS-5b 7. багато карток: шторка прокручується всередині, без горизонтальної прокрутки; зміна даних поки шторка відкрита оновлює її', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page, 'typical', 390, 700);
  await page.evaluate(() => {
    const m = selectedMonth;
    for (let i = 1; i <= 14; i++){ bankAccounts.push({ name: 'Картка тест ' + i, creditLimit: 20000 + i * 1000, createdAt: monthStartISO('2025-01'), updatedAt: new Date().toISOString(), clientId: 'ds5b-c' + i });
      debts.push({ id: 'ds5b-d' + i, name: 'Картка тест ' + i, kind: 'card', month: m, balance: 1000 * i, minPayment: 100, deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); }
    renderDashboard();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('bal-pair').scrollIntoView({ block: 'center' }));
  await page.click('#bal-debt-btn'); await page.waitForTimeout(600);
  const s = await page.evaluate(() => { const d = document.getElementById('bal-sheet-debt'); d.scrollTop = 400; return { rows: d.querySelectorAll('.bal-dr').length, scrollable: d.scrollHeight > d.clientHeight + 50, st: d.scrollTop, x: d.scrollWidth - d.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth }; });
  expect(s.rows).toBeGreaterThanOrEqual(14); expect(s.scrollable).toBe(true); expect(s.st).toBeGreaterThan(0); expect(s.x).toBeLessThanOrEqual(0); expect(s.page).toBeLessThanOrEqual(0);
  const before = await page.evaluate(() => document.getElementById('bal-sheet-debt').innerText);
  await page.evaluate(() => { debts.find(d => d.id === 'ds5b-d3').balance = 3777; renderDashboard(); }); await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ text: document.getElementById('bal-sheet-debt').innerText, st: document.getElementById('bal-sheet-debt').scrollTop }));
  expect(after.text).not.toBe(before); expect(after.text).toMatch(/3[\s\u00a0\u202f]777/); expect(after.st, 'прокрутка збережена').toBeGreaterThan(0);
});

test('DS-5b 8. «зменшити рух»: одометр плиток без переходу', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  expect(await page.evaluate(() => [...document.querySelectorAll('#kpi-debt .odc, #kpi-och .odc')].every(c => c.classList.contains('z')))).toBe(true);
});

test('ds5b-shots', async ({ page }) => {
  test.skip(!SHOTS, 'потрібен DS_SHOTS_DIR');
  test.setTimeout(420000); fs.mkdirSync(SHOTS, { recursive: true });
  const hideBar = () => page.evaluate(() => { const t = document.querySelector('.tabbar-glass'); if(t) t.style.display = 'none'; });
  const tilesShot = async name => { await hideBar(); await page.evaluate(() => document.getElementById('bal-pair').scrollIntoView({ block: 'center' })); await page.waitForTimeout(1500); await page.locator('#bal-pair').screenshot({ path: path.join(SHOTS, name + '.png') }); };
  const sheetShot = async (btn, id, name) => { await page.evaluate(() => document.getElementById('bal-pair').scrollIntoView({ block: 'center' })); await page.click(btn); await page.waitForTimeout(1400); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); await page.keyboard.press('Escape'); await page.waitForTimeout(500); };
  for (const [w, h] of [[390, 844], [320, 700], [1280, 800]]){
    for (const theme of ['dark', 'light']){
      const tag = w + '-' + theme;
      await boot(page, 'typical', w, h); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      await tilesShot('tiles-' + tag); await hideBar();
      await sheetShot('#bal-debt-btn', 'bal-sheet-debt', 'sheet-debt-' + tag); await sheetShot('#bal-inst-btn', 'bal-sheet-inst', 'sheet-inst-' + tag);
      await page.evaluate(() => { bankAccounts.forEach(a => { a.creditLimit = null; }); installmentAccounts.forEach(a => { a.initialAmount = null; }); renderDashboard(); }); await page.waitForTimeout(600);
      await tilesShot('tiles-incomplete-' + tag); await sheetShot('#bal-debt-btn', 'bal-sheet-debt', 'sheet-debt-nolimit-' + tag); await sheetShot('#bal-inst-btn', 'bal-sheet-inst', 'sheet-inst-noinitial-' + tag);
      await page.evaluate(() => { debts.forEach(d => { d.deletedAt = new Date().toISOString(); }); renderDashboard(); }); await page.waitForTimeout(600);
      await tilesShot('tiles-empty-' + tag); await sheetShot('#bal-debt-btn', 'bal-sheet-debt', 'sheet-debt-empty-' + tag);
      if (w !== 1280){
        await boot(page, 'typical', w, h); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
        await page.evaluate(() => { const m = selectedMonth; for (let i = 1; i <= 9; i++){ bankAccounts.push({ name: 'Картка тест ' + i, creditLimit: 20000 + i * 5000, createdAt: monthStartISO('2025-01'), updatedAt: new Date().toISOString(), clientId: 'sh-c' + i }); debts.push({ id: 'sh-d' + i, name: 'Картка тест ' + i, kind: 'card', month: m, balance: 3000 * i, minPayment: 100, deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); } renderDashboard(); }); await page.waitForTimeout(600); await hideBar();
        await sheetShot('#bal-debt-btn', 'bal-sheet-debt', 'sheet-debt-many-' + tag);
        const info = await page.evaluate(() => ({ prev: shiftMonth(monthKey(localDateISO()), -1), next: currentMonthList().slice(-1)[0] }));
        for (const [k, m] of [['past', info.prev], ['next', info.next]]){ await page.evaluate(m => onMonthChange(m), m); await page.waitForTimeout(1300); await tilesShot('tiles-' + k + '-' + tag); }
      }
    }
  }
});
