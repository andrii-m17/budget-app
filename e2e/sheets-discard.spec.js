// Rev 2.32.376 (DS-4c): підтвердження «Скасувати зміни?» при закритті зміненої форми (картка, ОЧ, дохід, «Структура», операція Monobank, запис діагностики); форма входу — без діалогу.
// Усі шляхи закриття (затемнення, Esc, «Закрити», свайп) ідуть через requestCloseSheet; збереження кнопкою — без діалогу; клавіатура закривається штатно перед діалогом.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
async function boot(page, o){
  o = o || {};
  await page.setViewportSize({ width: o.w || 390, height: 844 }); await installClock(page);
  await page.addInitScript(() => { window.__kbNoAuto = true; window.__vv = { h: null, top: 0 }; });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const vv = window.visualViewport, H0 = window.innerHeight; window.__H0 = H0;
    Object.defineProperty(vv, 'height', { configurable: true, get(){ return window.__vv.h == null ? H0 : window.__vv.h; } });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get(){ return window.__vv.top; } });
    window.__isOpen = (id) => document.getElementById(id).classList.contains('open');
    window.__swipe = async (sel, dy, steps, gap) => {
      const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.x + r.width / 2, y0 = r.y + r.height / 2;
      const fire = (type, yy) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: yy, button: type === 'pointerdown' ? 0 : -1 }));
      fire('pointerdown', y0); for (let i = 1; i <= steps; i++){ if(gap) await new Promise(r => setTimeout(r, gap)); fire('pointermove', y0 + dy * i / steps); } fire('pointerup', y0 + dy);
    };
    window.__data = () => { try{ return JSON.stringify([typeof bankAccounts !== 'undefined' ? bankAccounts : 0, typeof debts !== 'undefined' ? debts : 0, typeof installmentAccounts !== 'undefined' ? installmentAccounts : 0, typeof incomes !== 'undefined' ? incomes : 0, typeof categories !== 'undefined' ? categories : 0]); }catch(e){ return 'x'; } };
  });
}
// id шторки, відкриття, зміна поля (значення перед і після), поле для перевірки «введене збережено»
const FORMS = {
  card: { id: 'card-debt-drawer', field: '#cdd-balance', open: () => { switchTab('accounting'); openCardDebtEditor(0); }, edit: () => { const e = document.getElementById('cdd-balance'); e.value = '12 345'; e.dispatchEvent(new Event('input', { bubbles: true })); } },
  inst: { id: 'installment-drawer', field: '#iddfielda1', open: () => { switchTab('accounting'); openInstallmentEditor(0); }, edit: () => { const e = document.getElementById('iddfielda1'); e.value = e.value + ' Х'; e.dispatchEvent(new Event('input', { bubbles: true })); } },
  income: { id: 'income-drawer', field: '#ind-amount', open: () => { switchTab('accounting'); openIncomeEditor(0); }, edit: () => { const e = document.getElementById('ind-amount'); e.value = '77 000'; e.dispatchEvent(new Event('input', { bubbles: true })); } },
  struct: { id: 'struct-drawer', field: '#fldstr3', open: () => { switchTab('structure'); showCategoryModal('Нова категорія', '', CATEGORY_TYPES[0], function(){}, null); }, edit: () => { const e = document.getElementById('fldstr3'); e.value = 'Тестова'; e.dispatchEvent(new Event('input', { bubbles: true })); } },
  mono: { id: 'mono-detail-drawer', field: '#fldmono4', open: async () => { await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); }, edit: () => { const e = document.getElementById('fldmono4'); e.value = 'Інша примітка'; e.dispatchEvent(new Event('input', { bubbles: true })); } },
  debug: { id: 'debug-record-drawer', field: '#debug-record-scenario', open: () => { openDebugRecordDrawer(); }, edit: () => { const e = document.getElementById('debug-record-scenario'); e.value = 'мій-сценарій'; e.dispatchEvent(new Event('input', { bubbles: true })); } }
};
const openForm = async (page, k) => { await page.evaluate(FORMS[k].open); await page.waitForTimeout(900); };
const editForm = async (page, k) => { await page.evaluate(FORMS[k].edit); await page.waitForTimeout(150); };
const dialog = (page) => page.evaluate(() => { const m = document.getElementById('app-modal'); return { open: m.classList.contains('open'), text: (document.getElementById('app-modal-text') || {}).textContent || '', cancel: (document.getElementById('app-modal-cancel-btn') || {}).textContent, ok: (document.getElementById('app-modal-confirm-btn') || {}).textContent, danger: /danger/.test((document.getElementById('app-modal-confirm-btn') || {}).className || ''), labelled: m.getAttribute('aria-labelledby') }; });
async function closeVia(page, k, via){
  const id = FORMS[k].id;
  if(via === 'backdrop'){ await page.touchscreen.tap(195, 24); }
  else if(via === 'esc'){ await page.keyboard.press('Escape'); }
  else if(via === 'close'){ await page.evaluate((id) => { const d = document.getElementById(id); (d.querySelector('.drawer-close') || d.querySelector('.sr-close')).click(); }, id); }
  else if(via === 'swipe'){ await page.evaluate((h) => __swipe(h, 150, 10, 30), '#' + id + ' .drawer-handle'); }
  await page.waitForTimeout(900);
}
const VIAS = ['backdrop', 'esc', 'close', 'swipe'];
let n = 137;
for (const k of Object.keys(FORMS)){
  test((n++) + '. ' + k + ': без змін закривається мовчки на всіх 4 шляхах; зі змінами — діалог «Скасувати зміни?» (шлях → діалог, шторка лишається), «Продовжити» зберігає введене, «Скасувати зміни» закриває без збереження', async ({ page }) => {
    test.setTimeout(150000);
    await boot(page);
    const f = FORMS[k], fails = [];
    for (const via of VIAS){
      await openForm(page, k);
      await closeVia(page, k, via);
      if(await page.evaluate((id) => __isOpen(id), f.id)) fails.push(via + ': без змін шторка не закрилась');
      if((await dialog(page)).open) fails.push(via + ': без змін з\'явився діалог');
    }
    const before = await page.evaluate(() => __data());
    for (const via of VIAS){
      await openForm(page, k); await editForm(page, k);
      const typed = await page.evaluate((s) => document.querySelector(s).value, f.field);
      await closeVia(page, k, via);
      const d = await dialog(page), open = await page.evaluate((id) => __isOpen(id), f.id);
      if(!d.open || !/Скасувати зміни\?/.test(d.text) || !/Внесені зміни не буде збережено\./.test(d.text)) fails.push(via + ': діалогу немає або текст інший: ' + JSON.stringify(d));
      else if(d.cancel !== 'Продовжити редагування' || d.ok !== 'Скасувати зміни' || !d.danger) fails.push(via + ': кнопки ' + JSON.stringify(d));
      else if(!d.labelled) fails.push(via + ': немає aria-labelledby');
      if(!open) fails.push(via + ': шторка закрилась до вибору');
      // «Продовжити редагування»: введене лишається
      if(d.open){
        await page.evaluate(() => document.getElementById('app-modal-cancel-btn').click()); await page.waitForTimeout(500);
        const kept = await page.evaluate((s) => document.querySelector(s).value, f.field);
        const sq = (s) => String(s).replace(/\s/g, ''); // поле суми форматується при втраті фокуса (пробіли розрядів)
        if(sq(kept) !== sq(typed)) fails.push(via + ': «Продовжити» змінило введене: ' + typed + ' → ' + kept);
        if(!(await page.evaluate((id) => __isOpen(id), f.id))) fails.push(via + ': після «Продовжити» шторка закрита');
        if((await dialog(page)).open) fails.push(via + ': діалог лишився після «Продовжити»');
        // повторно й «Скасувати зміни»
        await closeVia(page, k, via);
        await page.evaluate(() => document.getElementById('app-modal-confirm-btn').click()); await page.waitForTimeout(600);
        if(await page.evaluate((id) => __isOpen(id), f.id)) fails.push(via + ': «Скасувати зміни» не закрило шторку');
        if((await dialog(page)).open) fails.push(via + ': діалог лишився після «Скасувати зміни»');
      } else { await page.evaluate((id) => { const d = document.getElementById(id); d.classList.remove('open'); }, f.id); }
    }
    expect(await page.evaluate(() => __data()), 'дані не змінились (нічого не збережено)').toBe(before);
    expect(fails, fails.join('\n')).toEqual([]);
  });
}
test('143. Esc і дотик поза діалогом = «Продовжити редагування»; Esc закриває лише діалог, шторка лишається', async ({ page }) => {
  await boot(page);
  await openForm(page, 'income'); await editForm(page, 'income');
  await closeVia(page, 'income', 'close');
  expect((await dialog(page)).open).toBe(true);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  expect((await dialog(page)).open, 'Esc закрив діалог').toBe(false);
  expect(await page.evaluate(() => __isOpen('income-drawer')), 'шторка лишилась').toBe(true);
  expect(await page.evaluate(() => document.getElementById('ind-amount').value.replace(/\s/g, ''))).toBe('77000');
  await closeVia(page, 'income', 'close');
  expect((await dialog(page)).open).toBe(true);
  await page.evaluate(() => document.getElementById('modal-backdrop').click()); await page.waitForTimeout(500); // дотик поза діалогом
  expect((await dialog(page)).open, 'дотик поза діалогом закрив діалог').toBe(false);
  expect(await page.evaluate(() => __isOpen('income-drawer'))).toBe(true);
});
test('144. збереження кнопкою — без діалогу (картка, дохід, «Структура»)', async ({ page }) => {
  test.setTimeout(90000);
  await boot(page);
  const fails = [];
  const SAVE = { card: () => document.querySelector('#card-debt-drawer .submit-btn.debt').click(), income: () => document.querySelector('#income-drawer .submit-btn.income').click(), struct: () => document.getElementById('sf-save').click() };
  for (const k of ['card', 'income', 'struct']){
    await openForm(page, k); await editForm(page, k);
    await page.evaluate(SAVE[k]); await page.waitForTimeout(1200);
    if((await dialog(page)).open && /Скасувати зміни\?/.test((await dialog(page)).text)) fails.push(k + ': діалог скасування після збереження');
    for (let i = 0; i < 3; i++){ if(await page.evaluate((id) => __isOpen(id), FORMS[k].id)){ const t = await dialog(page); if(t.open && !/Скасувати зміни\?/.test(t.text)){ await page.evaluate(() => document.getElementById('app-modal-confirm-btn').click()); await page.waitForTimeout(900); } else break; } }
    if(await page.evaluate((id) => __isOpen(id), FORMS[k].id)) fails.push(k + ': шторка лишилась відкритою після збереження');
  }
  expect(fails, fails.join('\n')).toEqual([]);
});
test('145. форма входу: зі змінами закривається мовчки на всіх шляхах (без діалогу)', async ({ page }) => {
  await boot(page);
  for (const via of ['backdrop', 'esc']){
    await page.evaluate(() => showProfileLoginForm()); await page.waitForTimeout(900);
    await page.evaluate(() => { const e = document.getElementById('cldfielda1'); if(e){ e.value = 'abc'; e.dispatchEvent(new Event('input', { bubbles: true })); } });
    if(via === 'backdrop') await page.touchscreen.tap(195, 24); else await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => __isOpen('profile-drawer')), via + ': форма входу закрилась').toBe(false);
    expect((await dialog(page)).open, via + ': діалогу немає').toBe(false);
  }
});
test('146. свайп зміненої форми: шторка пружно повертається (--sheet-drag очищено), потім діалог; самописець: sheet-swipe why=dirty, sheet-discard ask/continue/discard', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { recBuf.length = 0; });
  await openForm(page, 'card'); await editForm(page, 'card');
  await page.evaluate((h) => __swipe(h, 150, 10, 30), '#card-debt-drawer .drawer-handle');
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => __isOpen('card-debt-drawer')), 'шторка лишається').toBe(true);
  await page.waitForTimeout(900);
  expect((await dialog(page)).open, 'діалог після повернення').toBe(true);
  expect(await page.evaluate(() => document.getElementById('card-debt-drawer').style.getPropertyValue('--sheet-drag')), 'змінну очищено').toBe('');
  await page.evaluate(() => document.getElementById('app-modal-cancel-btn').click()); await page.waitForTimeout(400);
  await closeVia(page, 'card', 'esc');
  await page.evaluate(() => document.getElementById('app-modal-confirm-btn').click()); await page.waitForTimeout(600);
  const ev = await page.evaluate(() => recBuf.filter(e => e.type === 'sheet-swipe' || e.type === 'sheet-discard').map(e => [e.type, e.drawerId, e.via || e.why, e.choice || e.closed]));
  const sd = ev.filter(e => e[0] === 'sheet-discard').map(e => e[2] + ':' + e[3]);
  expect(sd, JSON.stringify(ev)).toEqual(['swipe:ask', 'swipe:continue', 'esc:ask', 'esc:discard']);
  expect(ev.some(e => e[0] === 'sheet-swipe' && e[2] === 'dirty' && e[3] === false), JSON.stringify(ev)).toBe(true);
});
test('147. клавіатура відкрита: дотик по затемненню спершу закриває клавіатуру штатно, потім діалог; шторка не закривається й не стрибає', async ({ page }) => {
  test.setTimeout(90000);
  await boot(page);
  await openForm(page, 'card');
  await page.evaluate(() => { document.querySelector('#cdd-balance').scrollIntoView({ block: 'nearest' }); });
  const bb = await page.locator('#cdd-balance').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(200);
  await page.evaluate(() => { const k = Math.round(window.__H0 * 0.4); window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(700);
  await editForm(page, 'card');
  const kbOn = await page.evaluate(() => document.documentElement.classList.contains('kb-sheet') || document.body.classList.contains('kb-open'));
  // дотик по затемненню над листом
  await page.evaluate(() => document.getElementById('card-debt-backdrop').click());
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.__vv.top = 0; window.visualViewport.dispatchEvent(new Event('resize')); }); // система закриває клавіатуру
  await page.waitForTimeout(1600);
  const st = await page.evaluate(() => ({ open: __isOpen('card-debt-drawer'), dlg: document.getElementById('app-modal').classList.contains('open'), kb: document.documentElement.classList.contains('kb-sheet') || document.documentElement.classList.contains('kb-sheet-closing') || document.body.classList.contains('kb-open'), tf: getComputedStyle(document.getElementById('card-debt-drawer')).transform }));
  expect(kbOn, 'клавіатура була відкрита').toBe(true);
  expect(st.open, 'шторка лишилась: ' + JSON.stringify(st)).toBe(true);
  expect(st.dlg, 'діалог показано після клавіатури: ' + JSON.stringify(st)).toBe(true);
  expect(st.kb, 'клавіатурні класи зняті: ' + JSON.stringify(st)).toBe(false);
});
