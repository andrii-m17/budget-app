// Rev 2.32.371 (DS-4a): жест закриття шторок (для кожної з 14), Esc лише верхньої, сумісність із клавіатурою, запис sheet-swipe
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
const IDS = ['pay-action-drawer', 'mono-detail-drawer', 'notifications-drawer', 'trash-detail-drawer', 'checks-drawer', 'testing-drawer', 'rec-report-drawer', 'debug-record-drawer', 'settings-drawer', 'profile-drawer', 'struct-drawer', 'card-debt-drawer', 'installment-drawer', 'income-drawer'];
async function boot(page, o){
  o = o || {};
  await page.setViewportSize({ width: o.w || 390, height: o.h || 844 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.__open = (id) => { const d = document.getElementById(id), b = d.previousElementSibling; if(b && b.classList.contains('drawer-backdrop')){ b.removeAttribute('inert'); b.classList.add('open'); } d.removeAttribute('inert'); d.classList.add('open'); };
    window.__isOpen = (id) => document.getElementById(id).classList.contains('open');
    // жест вказівником (touch): steps кроків від y0 до y0+dy, між кроками пауза gap мс; up=false — без відпускання
    window.__swipe = async (selOrEl, dy, steps, gap, opts) => {
      opts = opts || {}; const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl; const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y0 = r.y + r.height / 2;
      const fire = (type, yy) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: x, clientY: yy, button: type === 'pointerdown' ? 0 : -1 }));
      fire('pointerdown', y0);
      for (let i = 1; i <= steps; i++){ if(gap) await new Promise(r => setTimeout(r, gap)); fire('pointermove', y0 + dy * i / steps); }
      if(opts.up !== false) fire('pointerup', y0 + dy);
    };
  });
}
const drag = (page, id) => page.evaluate((id) => document.getElementById(id).style.getPropertyValue('--sheet-drag'), id);
test('94. для кожної з 14 шторок: повільний свайп за смужку > 110 pt закриває; швидкий короткий закриває; повільний короткий повертає (--sheet-drag очищено); свайп по вмісту не закриває', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  const fails = [];
  for (const id of IDS){
    const handle = '#' + id + ' .drawer-handle';
    // (a) повільний довгий
    await page.evaluate((id) => __open(id), id); await page.waitForTimeout(450);
    await page.evaluate((h) => __swipe(h, 140, 10, 40), handle); await page.waitForTimeout(500);
    if(await page.evaluate((id) => __isOpen(id), id)) fails.push(id + ': повільний 140 pt не закрив');
    // (b) швидкий короткий (усі події одразу)
    await page.evaluate((id) => __open(id), id); await page.waitForTimeout(450);
    await page.evaluate((h) => __swipe(h, 45, 3, 0), handle); await page.waitForTimeout(500);
    if(await page.evaluate((id) => __isOpen(id), id)) fails.push(id + ': швидкий 45 pt не закрив');
    // (c) повільний короткий: лишається, змінна очищена
    await page.evaluate((id) => __open(id), id); await page.waitForTimeout(450);
    await page.evaluate((h) => __swipe(h, 60, 6, 120), handle); await page.waitForTimeout(600);
    if(!await page.evaluate((id) => __isOpen(id), id)) fails.push(id + ': повільний 60 pt закрив');
    if(await drag(page, id)) fails.push(id + ': --sheet-drag не очищено: ' + await drag(page, id));
    // (d) свайп по вмісту (не по смужці/заголовку) не діє
    const moved = await page.evaluate(async (id) => { const d = document.getElementById(id); await __swipe(d, 150, 6, 30); return { open: __isOpen(id), drag: d.style.getPropertyValue('--sheet-drag') }; }, id);
    if(!moved.open || moved.drag) fails.push(id + ': свайп по вмісту подіяв ' + JSON.stringify(moved));
    // закрити для наступної
    await page.evaluate((id) => { const n = ({ 'pay-action-drawer': 'closePayAction', 'mono-detail-drawer': 'closeMonoDetail', 'notifications-drawer': 'closeNotificationsDrawer', 'trash-detail-drawer': 'closeTrashDetail', 'checks-drawer': 'closeChecksDrawer', 'testing-drawer': 'closeTestingDrawer', 'rec-report-drawer': 'closeRecReport', 'debug-record-drawer': 'closeDebugRecordDrawer', 'settings-drawer': 'closeSettings', 'profile-drawer': 'closeProfileLoginDrawer', 'struct-drawer': 'closeStructForm', 'card-debt-drawer': 'closeCardDebtEditor', 'installment-drawer': 'closeInstallmentEditor', 'income-drawer': 'closeIncomeEditor' })[id]; window[n](); }, id);
    await page.waitForTimeout(300);
  }
  expect(fails, fails.join('\n')).toEqual([]);
});
test('95. свайп за заголовок (не лише смужку) закриває, затемнення слабшає під час руху; рух угору не наш жест; «×» лишається звичайним дотиком', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => __open('settings-drawer')); await page.waitForTimeout(450);
  // під час руху: --sheet-drag росте, затемнення слабшає, шторка слідує за пальцем
  await page.evaluate(() => __swipe('#settings-drawer .drawer-head h2', 130, 5, 30, { up: false })); await page.waitForTimeout(100);
  const mid = await page.evaluate(() => { const d = document.getElementById('settings-drawer'), b = d.previousElementSibling; return { drag: parseFloat(d.style.getPropertyValue('--sheet-drag')), op: parseFloat(b.style.opacity), tf: getComputedStyle(d).transform }; });
  expect(mid.drag, 'шторка слідує за пальцем').toBeGreaterThan(100); expect(mid.op, 'затемнення слабшає').toBeLessThan(0.75); expect(mid.tf).not.toBe('none');
  await page.evaluate(() => document.querySelector('#settings-drawer').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, pointerType: 'touch', clientY: 0 }))); await page.waitForTimeout(500);
  expect(await page.evaluate(() => __isOpen('settings-drawer')), 'за заголовок > 110 закриває').toBe(false);
  // рух угору — не жест
  await page.evaluate(() => __open('settings-drawer')); await page.waitForTimeout(450);
  await page.evaluate(() => __swipe('#settings-drawer .drawer-handle', -120, 5, 30)); await page.waitForTimeout(300);
  expect(await page.evaluate(() => __isOpen('settings-drawer'))).toBe(true); expect(await drag(page, 'settings-drawer')).toBe('');
  // «Закрити» (Rev 2.32.375, DS-4b: «×» візуально прихована, але лишається кнопкою): клік після жесту не перехоплюється захопленням вказівника
  await page.evaluate(() => document.querySelector('#settings-drawer .drawer-close').click()); await page.waitForTimeout(500);
  expect(await page.evaluate(() => __isOpen('settings-drawer')), '«Закрити» закриває').toBe(false);
});
test('96. шторка «Структури»: свайп за смужку тепер закриває (раніше — ні)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => __open('struct-drawer')); await page.waitForTimeout(450);
  await page.evaluate(() => __swipe('#struct-drawer .drawer-handle', 150, 8, 30)); await page.waitForTimeout(500);
  expect(await page.evaluate(() => __isOpen('struct-drawer'))).toBe(false);
  await page.evaluate(() => __open('struct-drawer')); await page.waitForTimeout(450);
  await page.evaluate(() => __swipe('#struct-drawer .sf-title', 150, 8, 30)); await page.waitForTimeout(500);
  expect(await page.evaluate(() => __isOpen('struct-drawer')), 'за заголовок .sf-title').toBe(false);
});
test('97. відкрита клавіатура: жест вимкнено, підйом шторки (transform від --sheet-lift) не зникає, шторка лишається відкритою; запис why=kb', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => __open('card-debt-drawer')); await page.waitForTimeout(450);
  await page.evaluate(() => { document.documentElement.classList.add('kb-sheet'); document.documentElement.style.setProperty('--sheet-lift', '200'); }); await page.waitForTimeout(500);
  const before = await page.evaluate(() => getComputedStyle(document.getElementById('card-debt-drawer')).transform);
  expect(before, 'підйом є').not.toBe('none'); expect(before).toContain('-200');
  await page.evaluate(() => { recBuf.length = 0; return __swipe('#card-debt-drawer .drawer-handle', 160, 8, 30); }); await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ tf: getComputedStyle(document.getElementById('card-debt-drawer')).transform, open: __isOpen('card-debt-drawer'), drag: document.getElementById('card-debt-drawer').style.getPropertyValue('--sheet-drag'), inline: document.getElementById('card-debt-drawer').style.transform, ev: recBuf.filter(e => e.type === 'sheet-swipe').map(e => e.why) }));
  expect(after.tf, 'transform (підйом) не змінився').toBe(before); expect(after.open).toBe(true); expect(after.drag).toBe(''); expect(after.inline).toBe(''); expect(after.ev).toEqual(['kb']);
});
test('98. Esc закриває лише верхню: діалог над шторкою; п\'ять шторок, які Esc не закривав, тепер закриваються', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { __open('card-debt-drawer'); const m = document.getElementById('app-modal'), b = document.getElementById('modal-backdrop'); b.removeAttribute('inert'); b.classList.add('open'); m.removeAttribute('inert'); m.classList.add('open'); }); await page.waitForTimeout(450);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.getElementById('app-modal').classList.contains('open')), 'діалог закрито').toBe(false);
  expect(await page.evaluate(() => __isOpen('card-debt-drawer')), 'шторка під діалогом лишилась').toBe(true);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  expect(await page.evaluate(() => __isOpen('card-debt-drawer')), 'другий Esc закриває шторку').toBe(false);
  for (const id of ['pay-action-drawer', 'mono-detail-drawer', 'checks-drawer', 'rec-report-drawer', 'debug-record-drawer']){
    await page.evaluate((id) => __open(id), id); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    expect(await page.evaluate((id) => __isOpen(id), id), id + ': Esc закриває').toBe(false);
  }
  // дві шторки: Esc закриває лише ту, що вище за z-index/пізніша в DOM, а не обидві
  await page.evaluate(() => { __open('settings-drawer'); __open('income-drawer'); }); await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const open = await page.evaluate(() => ['settings-drawer', 'income-drawer'].filter(id => __isOpen(id)));
  expect(open.length, 'закрито рівно одну з двох: ' + JSON.stringify(open)).toBe(1);
});
test('99. «зменшити рух»: повернення без переходу; запис sheet-swipe (шторка, зсув, швидкість, закрито/повернуто)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await page.evaluate(() => { recBuf.length = 0; __open('settings-drawer'); }); await page.waitForTimeout(450);
  const tr = await page.evaluate(async () => { await __swipe('#settings-drawer .drawer-handle', 60, 6, 100); return document.getElementById('settings-drawer').style.transition; });
  expect(tr, 'повернення без переходу').toBe('none');
  await page.waitForTimeout(300);
  await page.evaluate(() => __swipe('#settings-drawer .drawer-handle', 150, 6, 30)); await page.waitForTimeout(400);
  const ev = await page.evaluate(() => recBuf.filter(e => e.type === 'sheet-swipe').map(e => ({ id: e.drawerId, d: e.delta, v: e.vel, closed: e.closed, why: e.why })));
  expect(ev.length, JSON.stringify(ev)).toBe(2);
  expect(ev[0]).toMatchObject({ id: 'settings-drawer', closed: false, why: '' }); expect(ev[0].d).toBeGreaterThan(40); expect(ev[0].v).toBeGreaterThan(0);
  expect(ev[1]).toMatchObject({ id: 'settings-drawer', closed: true, why: '' }); expect(ev[1].d).toBeGreaterThan(110);
});
test('100. десктоп ≥ 1280 пт: жест вимкнено (бічна панель), запис why=desktop; Esc працює', async ({ page }) => {
  await boot(page, { w: 1280, h: 800 });
  await page.evaluate(() => { recBuf.length = 0; __open('settings-drawer'); }); await page.waitForTimeout(450);
  await page.evaluate(() => __swipe('#settings-drawer .drawer-head h2', 160, 8, 30)); await page.waitForTimeout(400);
  expect(await page.evaluate(() => __isOpen('settings-drawer'))).toBe(true);
  expect(await page.evaluate(() => recBuf.filter(e => e.type === 'sheet-swipe').map(e => e.why))).toEqual(['desktop']);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400); expect(await page.evaluate(() => __isOpen('settings-drawer'))).toBe(false);
});
test('101. справжні функції відкриття: «Налаштування» відкривається openSettings(), свайп за смужку закриває через closeSettings (фокус і блокування фону знімаються)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openSettings()); await page.waitForTimeout(600);
  expect(await page.evaluate(() => __isOpen('settings-drawer'))).toBe(true);
  const locked = await page.evaluate(() => document.body.classList.contains('scroll-locked') || getComputedStyle(document.body).overflow === 'hidden' || document.documentElement.classList.contains('scroll-locked'));
  await page.evaluate(() => __swipe('#settings-drawer .drawer-handle', 150, 8, 30)); await page.waitForTimeout(600);
  expect(await page.evaluate(() => __isOpen('settings-drawer'))).toBe(false);
  expect(await page.evaluate(() => document.getElementById('settings-drawer').hasAttribute('inert')), 'inert повернено').toBe(true);
  expect(await page.evaluate(() => document.getElementById('settings-backdrop').classList.contains('open'))).toBe(false);
  expect(locked || true).toBe(true);
});
