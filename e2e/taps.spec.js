// E2E-1 (Rev 2.32.214, TAP-1): матриця тапів (touchscreen.tap) по класах інтерактивних елементів: дія < 150 мс і рівно один раз; зони дотику 44 пт без перекриття сусідів; підказки не видаляються під пальцем.
const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__tap = { down: 0, clicks: [], target: null }; document.addEventListener('pointerdown', e => { window.__tap.down = performance.now(); }, true); document.addEventListener('click', e => { window.__tap.clicks.push([performance.now(), e.target.closest('button, [role=button], label, a, select, input, .expense-row, .struct-row') ? 1 : 0, e.target.id || e.target.className]); }, true); });
}
async function tapEffect(page, selector, cond, label){ // дія без click (таббар працює на touch-жесті): час від pointerdown до умови
  await page.evaluate(([c]) => { window.__tap.down = 0; window.__effAt = 0; const loop = () => { if(new Function('return ' + c)()) window.__effAt = performance.now(); else if(!window.__effStop) requestAnimationFrame(loop); }; window.__effStop = false; loop(); }, [cond]);
  const b = await page.locator(selector).first().boundingBox(); expect(b, label).toBeTruthy();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500);
  const r = await page.evaluate(() => { window.__effStop = true; return { down: window.__tap.down, at: window.__effAt }; });
  expect(r.at, label + ': дія відбулась').toBeGreaterThan(0); expect(r.at - r.down, label + ': реакція < 150 мс').toBeLessThan(150);
}
async function tapOnce(page, selector, label){
  await page.evaluate(() => { window.__tap.clicks = []; window.__tap.down = 0; });
  const b = await page.locator(selector).first().boundingBox();
  expect(b, label + ': елемент видно').toBeTruthy();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(450);
  const r = await page.evaluate(() => ({ down: window.__tap.down, clicks: window.__tap.clicks }));
  expect(r.clicks.length, label + ': рівно один клік (було ' + JSON.stringify(r.clicks) + ')').toBe(1);
  expect(r.clicks[0][0] - r.down, label + ': реакція < 150 мс').toBeLessThan(150);
}
const closeAll = page => page.evaluate(() => { try{ closeNotifArchive && closeNotifArchive(); }catch(e){} document.querySelectorAll('.drawer.open .drawer-close, #app-modal.open button').forEach(b => b.click()); try{ closeProfilePopover && closeProfilePopover(); }catch(e){} });

test('23. матриця тапів: таббар, підвкладки «Обліку» й «Структури», шапка (аватар, дзвіночок, шестерня), смітник, рядок: спрацьовує з першого разу за < 150 мс', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const now = new Date().toISOString(); expenses.unshift({ id: generateUUID(), date: localDateISO(), name: 'Тест рядок', amount: 10, category: '', subcategory: '', manual: true, createdAt: now, updatedAt: now }); renderAll(); });
  await tapEffect(page, '.tabbar-glass button >> nth=1', "document.querySelector('#view-accounting') && !document.querySelector('#view-accounting').classList.contains('hidden')", 'таббар «Облік»');
  await tapOnce(page, '#acct-tab-btn-debts', 'підвкладка «Борги»'); await tapOnce(page, '#acct-tab-btn-installments', 'підвкладка «ОЧ»');
  await tapEffect(page, '.tabbar-glass button >> nth=3', "document.querySelector('#view-structure') && !document.querySelector('#view-structure').classList.contains('hidden')", 'таббар «Структура»');
  await tapOnce(page, '#struct-tab-btn-dictionary', 'підвкладка «Словник»'); await tapOnce(page, '#struct-tab-btn-subcategories', 'підвкладка «Підкатегорії»');
  await tapOnce(page, '#notif-bell-btn', 'дзвіночок'); await closeAll(page);
  await tapOnce(page, '.gear-btn:not(#notif-bell-btn):not(#profile-btn-top) >> nth=0', 'шестерня'); await closeAll(page);
  await tapOnce(page, '#profile-btn-top', 'аватар'); await closeAll(page);
  await page.evaluate(() => switchTab('vytraty')); await page.waitForTimeout(500);
  await tapOnce(page, '.exp-del >> nth=0', 'смітник витрати'); await closeAll(page);
  await page.evaluate(() => switchTab('vytraty')); await page.waitForTimeout(500);
  await tapOnce(page, '.expense-row >> nth=0', 'рядок витрати');
});

test('24. зони дотику 44 пт без зміни вигляду й без перекриття сусідів (шапка, підвкладки, смітник)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const now = new Date().toISOString(); expenses.unshift({ id: generateUUID(), date: localDateISO(), name: 'Тест', amount: 10, category: '', subcategory: '', manual: true, createdAt: now, updatedAt: now }); renderAll(); switchTab('vytraty'); });
  await page.waitForTimeout(600);
  // геометрія зон: псевдоелемент 44×44 за центром; вигляд (розмір кнопки) не змінений; зони сусідів не перекриваються
  const zones = await page.evaluate(() => { const z = sel => { const el = document.querySelector(sel), r = el.getBoundingClientRect(), cs = getComputedStyle(el, '::after'); return { w: parseFloat(cs.width), h: parseFloat(cs.height), box: [r.width, r.height], zone: { l: r.left + r.width / 2 - parseFloat(cs.width) / 2, r: r.left + r.width / 2 + parseFloat(cs.width) / 2, t: r.top + r.height / 2 - parseFloat(cs.height) / 2, b: r.top + r.height / 2 + parseFloat(cs.height) / 2 } }; }; return { avatar: z('#profile-btn-top'), bell: z('#notif-bell-btn'), gear: z('.gear-btn:not(#notif-bell-btn):not(#profile-btn-top)'), del: z('.exp-del') }; });
  for(const k of ['avatar', 'bell', 'gear']){ expect(zones[k].w, k + ' зона 44').toBeGreaterThanOrEqual(44); expect(zones[k].h).toBeGreaterThanOrEqual(44); expect(zones[k].box, k + ': вигляд кнопки 36×36 не змінено').toEqual([36, 36]); }
  expect(zones.del.w).toBeGreaterThanOrEqual(44); expect(zones.del.box[0], 'смітник: вигляд ≈ 27').toBeLessThan(30);
  expect(zones.bell.zone.r, 'зони дзвіночка й шестерні не перекриваються').toBeLessThanOrEqual(zones.gear.zone.l + 0.5);
  expect(zones.avatar.zone.r).toBeLessThanOrEqual(zones.bell.zone.l);
  // реальні тапи за межею вигляду (3 пт зовні) потрапляють у свою кнопку й лише в неї
  for(const [sel, id] of [['#notif-bell-btn', 'notif-bell-btn'], ['.gear-btn:not(#notif-bell-btn):not(#profile-btn-top)', null]]){
    const b = await page.locator(sel).first().boundingBox();
    await page.evaluate(() => { window.__tap.clicks = []; });
    await page.touchscreen.tap(b.x + b.width / 2, b.y - 3 + 0.001 > 0 ? b.y - 3 : b.y + b.height / 2);
    await page.waitForTimeout(350);
    const c = await page.evaluate(() => window.__tap.clicks);
    expect(c.length, sel + ': один клік при тапі за 3 пт над кнопкою ' + JSON.stringify(c)).toBe(1);
    await closeAll(page);
  }
  await page.evaluate(() => switchTab('structure')); await page.waitForTimeout(500);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.struct-tab-btn')].filter(b => b.getBoundingClientRect().height > 0).map(b => { const cs = getComputedStyle(b, '::after'); return [parseFloat(cs.height), Math.round(b.getBoundingClientRect().height)]; }));
  expect(tabs.length).toBeGreaterThan(2); tabs.forEach(t => { expect(t[0], 'підвкладка: зона 44 пт').toBeGreaterThanOrEqual(44); expect(t[1], 'вигляд не змінено (< 40)').toBeLessThan(40); });
});

test('25. підказки: рядок, до якого торкаються, не видаляється з DOM після blur поля, поки триває дотик; після дотику список очищається; тап по підказці й одразу по полю назви: фокус < 150 мс', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const now = new Date().toISOString(); expenses.unshift({ id: generateUUID(), date: localDateISO(), name: 'Продукти Тест', amount: 100, category: '', subcategory: '', manual: true, createdAt: now, updatedAt: now }); renderAll(); switchTab('vytraty'); });
  await page.locator('#expfielda7').click(); await page.keyboard.type('про');
  await expect(page.locator('#name-suggest-list .name-suggest-item').first()).toBeVisible();
  // дотик триває: blur поля (як при тапі по підказці), 400 мс — рядок лишається в DOM
  await page.evaluate(() => { window.__item = document.querySelector('#name-suggest-list .name-suggest-item'); window.__item.dispatchEvent(new Event('touchstart', { bubbles: true })); document.getElementById('expfielda7').blur(); });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__item.isConnected && document.querySelectorAll('#name-suggest-list .name-suggest-item').length > 0), 'рядок у DOM, поки триває дотик').toBe(true);
  await page.evaluate(() => window.__item.dispatchEvent(new Event('touchend', { bubbles: true })));
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('#name-suggest-list .name-suggest-item').length), { timeout: 2000 }).toBe(0);
  // тап по підказці (таймер 150 мс), далі тап по полю назви
  await page.evaluate(() => { suggestSuppressed = false; const i = document.getElementById('expfielda7'); i.value = 'про'; onNameInput({ type: 'input' }); });
  await expect(page.locator('#name-suggest-list .name-suggest-item').first()).toBeVisible();
  await page.evaluate(() => { window.__ev = []; document.addEventListener('pointerdown', () => window.__ev.push(['down', performance.now()]), true); document.addEventListener('focusin', e => window.__ev.push(['focus', performance.now(), e.target.id]), true); });
  const g = await page.evaluate(() => { const r = document.querySelector('#name-suggest-list .name-suggest-item').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 10 }; });
  await page.evaluate(g => { handleSuggestionTouchStart({ touches: [{ clientX: g.x, clientY: g.y, identifier: 21 }] }, 0); }, g);
  await expect.poll(() => page.evaluate(() => document.getElementById('expfielda7').value)).toBe('Продукти Тест');
  await page.evaluate(() => { window.__ev.length = 0; });
  const b = await page.locator('#expfielda7').boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300);
  const ev = await page.evaluate(() => window.__ev), down = ev.find(x => x[0] === 'down'), foc = ev.find(x => x[0] === 'focus' && x[2] === 'expfielda7');
  expect(foc, 'фокус у полі назви: ' + JSON.stringify(ev)).toBeTruthy(); expect(foc[1] - down[1]).toBeLessThan(150);
});
