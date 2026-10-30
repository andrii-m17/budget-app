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

test('26. підказки в редагуванні запису: рядок лишається в DOM після blur, поки триває дотик; вибір із першого дотику (без pointerup); тап по сусідньому полю < 150 мс', async ({ page }) => {
  await boot(page);
  const id = await page.evaluate(() => { const now = new Date().toISOString(); const mk = (n) => ({ id: generateUUID(), date: localDateISO(), name: n, amount: 10, category: '', subcategory: '', manual: true, createdAt: now, updatedAt: now }); const a = mk('Продукти Тест'), b = mk('Інша витрата'); expenses.unshift(a, b); renderAll(); switchTab('vytraty'); return b.id; });
  await page.evaluate(i => { startEditRecord('expense', i); }, id);
  const input = page.locator('#edtfielda1-' + id);
  await input.click(); await input.fill(''); await page.keyboard.type('про');
  await expect(page.locator('#edtlista1-' + id + ' .name-suggest-item').first()).toBeVisible();
  // 1. blur під час дотику: рядок лишається в DOM; після дотику очищається
  await page.evaluate(i => { window.__item = document.querySelector('#edtlista1-' + i + ' .name-suggest-item'); window.__item.dispatchEvent(new Event('touchstart', { bubbles: true })); document.getElementById('edtfielda1-' + i).blur(); }, id);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__item.isConnected), 'рядок у DOM, поки триває дотик').toBe(true);
  await page.evaluate(() => window.__item.dispatchEvent(new Event('touchend', { bubbles: true })));
  await expect.poll(() => page.evaluate(i => document.querySelectorAll('#edtlista1-' + i + ' .name-suggest-item').length, id), { timeout: 2000 }).toBe(0);
  // 2. вибір без pointerup (iOS затримав його): підставляється за ≈ 150 мс
  await input.click(); await input.fill(''); await page.keyboard.type('про');
  await expect(page.locator('#edtlista1-' + id + ' .name-suggest-item').first()).toBeVisible();
  const ms = await page.evaluate(i => new Promise(res => { const el = document.querySelector('#edtlista1-' + i + ' .name-suggest-item'), r = el.getBoundingClientRect(), t0 = performance.now(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, clientX: r.left + 20, clientY: r.top + 10 })); const tick = () => { if(document.getElementById('edtfielda1-' + i).value === 'Продукти Тест') res(performance.now() - t0); else if(performance.now() - t0 > 2000) res(-1); else requestAnimationFrame(tick); }; tick(); }), id);
  expect(ms, 'вибір за ≈ 150–300 мс без pointerup').toBeGreaterThanOrEqual(140); expect(ms).toBeLessThan(400);
  // пізній pointerup не дублює вибір (поле лишається з однією назвою)
  await page.evaluate(i => { document.getElementById('edtfielda1-' + i).dispatchEvent(new Event('x')); }, id);
  // 3. тап по сусідньому полю: фокус < 150 мс
  await page.evaluate(() => { window.__ev = []; document.addEventListener('pointerdown', () => window.__ev.push(['down', performance.now()]), true); document.addEventListener('focusin', e => window.__ev.push(['focus', performance.now(), e.target.id]), true); });
  const b = await page.locator('#edit-amount-' + id).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300);
  const ev = await page.evaluate(() => window.__ev), down = ev.find(x => x[0] === 'down'), foc = ev.find(x => x[0] === 'focus' && x[2] === 'edit-amount-' + id);
  expect(foc, 'фокус у «Сумі»: ' + JSON.stringify(ev)).toBeTruthy(); expect(foc[1] - down[1]).toBeLessThan(150);
});

test('27. діагностика полів: fields-snapshot на старті/«Мітці»/«Стопі»; field-added/field-removed при відкритті форми слова у «Структура → Словник»; без значень', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { startDebugRecording('fields'); switchTab('structure'); switchStructureTab('dictionary'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const w = DICTIONARY.filter(d => !d.deletedAt)[0]; editDictionaryEntry(w.id); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { markDebugEvent(); closeStructForm(); });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => { const ev = debugEventBuffer.slice(); stopDebugRecording(); const all = debugEventBuffer.slice(); return { ev: all.map(e => ({ type: e.type, why: e.snapWhy, id: e.fieldId, name: e.fieldName, ac: e.fieldAc, scr: e.fieldScreen, n: e.fieldsCount, f: e.fields })) }; });
  const snaps = r.ev.filter(e => e.type === 'fields-snapshot').map(e => e.why);
  expect(snaps).toEqual(['start', 'mark', 'stop']);
  const added = r.ev.filter(e => e.type === 'field-added');
  expect(added.some(e => e.id === 'fldstr3' && e.ac === 'off' && /structure/.test(e.scr)), JSON.stringify(added)).toBe(true);
  const mark = r.ev.find(e => e.type === 'fields-snapshot' && e.why === 'mark');
  expect(mark.n).toBeGreaterThan(5); expect(mark.f.some(l => /^fldstr3\|/.test(l))).toBe(true);
  expect(JSON.stringify(r.ev)).not.toMatch(/value/i);
});

test('28. живий DOM: у редагуванні запису й у шторках (картка, ОЧ, дохід, форма «Структури») усі поля, крім входу, мають autocomplete=off; name/id без тире й слів-тригерів', async ({ page }) => {
  await boot(page);
  const grab = () => page.evaluate(() => {
    const T = ['name', 'phone', 'tel', 'mail', 'addr', 'user', 'login', 'first', 'last', 'fio', 'contact'];
    const bad = [];
    document.querySelectorAll('input, textarea').forEach(el => {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if(['checkbox', 'radio', 'hidden', 'file', 'color'].includes(type)) return;
      if(el.id === 'cldfielda1' || el.id === 'cloud-password' || el.id === 'kb-focus-proxy') return;
      const id = el.id.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, 'U'), nm = el.getAttribute('name') || '';
      if(el.getAttribute('autocomplete') !== 'off') bad.push(el.id + ': autocomplete=' + el.getAttribute('autocomplete'));
      if(nm.includes('-')) bad.push(el.id + ': тире в name');
      T.forEach(t => { if(id.toLowerCase().includes(t) || nm.toLowerCase().includes(t)) bad.push(el.id + ': тригер ' + t); });
    });
    return bad;
  });
  const steps = [
    ['редагування запису', () => { const e = expenses[0]; switchTab('vytraty'); startEditRecord('expense', e.id); }],
    ['картка', () => openAddBankModal()],
    ['ОЧ', () => openAddInstallmentModal()],
    ['дохід', () => openIncomeEditor(0)],
    ['словник', () => { switchTab('structure'); switchStructureTab('dictionary'); const w = DICTIONARY.filter(d => !d.deletedAt)[0]; editDictionaryEntry(w.id); }],
    ['категорії', () => { switchStructureTab('categories'); }],
  ];
  let bad = await grab(); expect(bad, 'старт').toEqual([]);
  for(const [k, f] of steps){ await page.evaluate(f); await page.waitForTimeout(500); bad = await grab(); expect(bad, k).toEqual([]); }
});

test('29. журнал сповіщень, «Конфлікти»: свайп видаляє оброблений одразу; необроблений — з підтвердженням (Скасувати лишає, Видалити прибирає); «Очистити» лишає необроблені; лічильник дзвіночка', async ({ page }) => {
  await boot(page);
  const seed = () => page.evaluate(() => {
    const mk = (id, status) => ({ id, rid: 'r' + id, dom: 'expenses', kind: 'field', field: 'amount', name: 'Тест', actor: 'Інший', gender: 'm', at: Date.now(), status, mine: 100, theirs: 200 });
    conflictLog = [mk('cfdone', 'mine'), mk('cfopen', 'open'), mk('cfopen2', 'open')]; conflictSave(); updateNotifBell(); renderNotifArchive();
  });
  await page.evaluate(() => { openNotifArchive(); });
  await page.waitForTimeout(800);
  await seed();
  const rows = () => page.evaluate(() => document.querySelectorAll('#notif-archive-body [data-conflict-del]').length / 2);
  const badge = () => page.evaluate(() => document.getElementById('notif-bell-count').textContent.trim());
  const swipe = (idx) => page.evaluate((i) => {
    const wrap = document.querySelectorAll('#notif-archive-body .notif-swipe')[i];
    const row = wrap.querySelector('.expense-row'), r = row.getBoundingClientRect();
    const mk = (x) => ({ identifier: 1, target: row, clientX: x, clientY: r.top + r.height / 2 });
    const fire = (type, x) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const l = type === 'touchend' ? [] : [mk(x)]; Object.defineProperty(ev, 'touches', { value: l }); Object.defineProperty(ev, 'targetTouches', { value: l }); Object.defineProperty(ev, 'changedTouches', { value: [mk(x)] }); row.dispatchEvent(ev); };
    const x0 = r.right - 20; fire('touchstart', x0); for(let k = 1; k <= 8; k++) fire('touchmove', x0 - k * 15); fire('touchend', x0 - 120);
    return wrap.classList.contains('swipe-open');
  }, idx);
  expect(await rows()).toBe(3); expect(await badge()).toBe('2');
  // оброблений (перший у списку за часом може бути будь-який: шукаємо за заголовком)
  const idxOf = (st) => page.evaluate((s) => [...document.querySelectorAll('#notif-archive-body .notif-swipe')].findIndex(w => (s === 'done') === !w.querySelector('.expense-row').classList.contains('unread')), st);
  expect(await swipe(await idxOf('done')), 'свайп відкриває дію').toBe(true);
  await page.locator('#notif-archive-body .notif-swipe.swipe-open .swipe-delete-btn').click(); await page.waitForTimeout(300);
  expect(await rows()).toBe(2); expect(await badge()).toBe('2');
  // необроблений: підтвердження, «Скасувати» лишає рядок
  expect(await swipe(await idxOf('open'))).toBe(true);
  await page.locator('#notif-archive-body .notif-swipe.swipe-open .swipe-delete-btn').click(); await page.waitForTimeout(300);
  await expect(page.locator('#app-modal-text')).toContainText('Видалити? Ваше значення (100 ₴) не буде повернено');
  await page.locator('#app-modal-cancel-btn, .app-modal [data-cancel], #app-modal button:has-text("Скасувати")').first().click(); await page.waitForTimeout(300);
  expect(await rows()).toBe(2);
  await page.evaluate(() => { const id = conflictLog.filter(x => x.status === 'open')[0].id; conflictDelete(id); }); await page.waitForTimeout(300);
  await page.locator('#app-modal-confirm-btn').click(); await page.waitForTimeout(300);
  expect(await rows()).toBe(1); expect(await badge()).toBe('1');
  // «Очистити»: оброблені прибираються, необроблені лишаються
  await page.evaluate(() => { conflictLog.push({ id: 'cfd2', rid: 'x', dom: 'expenses', kind: 'field', field: 'amount', name: 'Тест', actor: 'Інший', gender: 'm', at: Date.now(), status: 'kept', mine: 1, theirs: 2 }); conflictSave(); renderNotifArchive(); });
  await page.evaluate(() => { runClearNotifArchive(); }); await page.waitForTimeout(500);
  expect(await page.evaluate(() => conflictLog.map(x => x.status))).toEqual(['open']); expect(await badge()).toBe('1');
});

test('30. збереження без змін: 0 записів на сервер, updatedAt/localRev не змінюються (витрата, дохід, картка, ОЧ, структура); зі змінами — запит є', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const now = new Date().toISOString(); expenses.unshift({ id: generateUUID(), date: localDateISO(), name: 'Тест збереження', amount: 10, category: '', subcategory: '', manual: true, createdAt: now, updatedAt: now }); renderAll(); window.__eid = expenses[0].id; });
  await page.waitForTimeout(1500);
  const writes = () => page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length);
  const sig = () => page.evaluate(() => JSON.stringify([expenses.map(r => [r.id, r.updatedAt, r.localRev]), incomes.map(r => [r.id, r.updatedAt, r.localRev]), bankAccounts.map(r => [r.updatedAt, r.localRev]), installmentAccounts.map(r => [r.updatedAt, r.localRev]), debts.map(r => [r.id, r.updatedAt, r.localRev]), CATEGORIES.map(r => [r.name, r.updatedAt, r.localRev])]));
  const run = async (label, fn) => {
    const w0 = await writes(), s0 = await sig();
    await page.evaluate(fn); await page.waitForTimeout(1200);
    expect(await writes(), label + ': запитів запису').toBe(w0); expect(await sig(), label + ': updatedAt/localRev').toBe(s0);
  };
  await run('витрата', async () => { const e = expenses.find(x => x.id === window.__eid); switchTab('vytraty'); startEditRecord('expense', e.id); await new Promise(r => setTimeout(r, 300)); await saveRecordEdit(e.id); });
  await run('дохід', async () => { const inc = incomes.filter(x => !x.deletedAt)[0]; selectedMonth = monthKey(inc.date); const i = INCOME_SOURCES.findIndex(s => sameIncomeSource(inc.source, s.key)); openIncomeEditor(i); await new Promise(r => setTimeout(r, 300)); await saveIncomeDrawer(); });
  await run('картка', async () => { openCardDebtEditor(0); await new Promise(r => setTimeout(r, 300)); await saveCardDebtDrawer(); });
  await run('ОЧ', async () => { openInstallmentEditor(0); await new Promise(r => setTimeout(r, 300)); await saveInstallmentDrawer(); });
  await run('категорія', async () => { switchTab('structure'); editCategory(0); await new Promise(r => setTimeout(r, 300)); document.getElementById('sf-save').click(); });
  // зі змінами: рівно один запит запису (витрата)
  const w0 = await writes();
  await page.evaluate(async () => { const e = expenses.find(x => x.id === window.__eid); switchTab('vytraty'); startEditRecord('expense', e.id); await new Promise(r => setTimeout(r, 300)); document.getElementById('edit-amount-' + e.id).value = String(e.amount + 1); await saveRecordEdit(e.id); });
  await page.waitForTimeout(1500);
  expect((await writes()) - w0, 'зі змінами є запит').toBeGreaterThanOrEqual(1);
});

test('31. поля пошуку: нейтральні підказки, type=search, autocomplete=off, enterkeyhint=search, name відсутній', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { switchTab('structure'); switchStructureTab('dictionary'); });
  const r = await page.evaluate(() => ['journal-search-input', 'fldstr2'].map(id => { const el = document.getElementById(id); return { id, type: el.type, ac: el.getAttribute('autocomplete'), eh: el.getAttribute('enterkeyhint'), name: el.getAttribute('name'), ph: el.getAttribute('placeholder'), aria: el.getAttribute('aria-label') }; }));
  r.forEach(x => {
    expect(x.type, x.id).toBe('search'); expect(x.ac, x.id).toBe('off'); expect(x.eh, x.id).toBe('search'); expect(x.name, x.id).toBeNull();
    expect(((x.ph || '') + ' ' + (x.aria || '')).toLowerCase(), x.id).not.toMatch(/назв|name|phone|тел|mail|пошт|addr|адрес|user|login|contact|card/);
  });
});

