// Жест шторок: свайп донизу за смужку й заголовок, закриття верхньої шторки за Esc
// Перенесено з index.html (Rev 2.32.370, DS-4a0), переписано в Rev 2.32.371 (DS-4a). Звичайний скрипт: підключається в index.html після розмітки шторок і перед основним скриптом; виконується під час завантаження.

// Rev 2.32.371 (DS-4a): жест закриття шторки за макетом analytics-ds.
// - Зона: смужка (.drawer-handle), заголовок (.drawer-head; у «Структури» .sf-title); вміст шторки жест не вмикає (прокрутка й поля незалежні).
// - Пороги з макета: зсув > 110 pt, або швидкість > 0,6 px/мс при зсуві > 30 pt (sheetSwipeDecision).
// - Зсув іде в CSS-змінну --sheet-drag (а не в інлайн transform): базове правило .drawer.open { transform: translateY(var(--sheet-drag, 0px)) }; правило клавіатури (html.kb-sheet .drawer.open, --sheet-lift) не чіпається, а під час клавіатури жест вимкнено.
// - Затемнення слабшає разом зі шторкою; нижче порога шторка пружно повертається (--ease-spring), «зменшити рух» — миттєво.
// - Закриття — через наявну функцію закриття шторки (SHEET_CLOSERS), без стилів напряму: валідація/сценарії закриття не обходяться.
// - Pointer events (touch, миша, перо); без дублювання touch+pointer. Захоплення вказівника лише після руху понад SHEET_SWIPE_SLOP, щоб звичайний дотик по «×» чи заголовку лишався кліком.
const SHEET_SWIPE_CLOSE_PX = 110;
const SHEET_SWIPE_FAST_PX = 30;
const SHEET_SWIPE_FAST_V = 0.6; // px/мс
const SHEET_SWIPE_SLOP = 6;
const SHEET_SWIPE_ZONE = '.drawer-handle, .drawer-head, .sf-title';
const SHEET_CLOSERS = {
  'pay-action-drawer': 'closePayAction', 'mono-detail-drawer': 'closeMonoDetail', 'notifications-drawer': 'closeNotificationsDrawer',
  'trash-detail-drawer': 'closeTrashDetail', 'checks-drawer': 'closeChecksDrawer', 'testing-drawer': 'closeTestingDrawer',
  'rec-report-drawer': 'closeRecReport', 'debug-record-drawer': 'closeDebugRecordDrawer', 'settings-drawer': 'closeSettings',
  'profile-drawer': 'closeProfileLoginDrawer', 'struct-drawer': 'closeStructForm', 'card-debt-drawer': 'closeCardDebtEditor',
  'installment-drawer': 'closeInstallmentEditor', 'income-drawer': 'closeIncomeEditor', 'app-modal': 'closeAppModal', 'bal-sheet-debt': 'closeDebtSheet', 'bal-sheet-inst': 'closeInstSheet', 'bal-sheet-cats': 'closeCatsSheet'
};
// Чиста функція: dy — зсув униз (pt), dt — тривалість жесту (мс) → { close, vel (px/мс) }
function sheetSwipeDecision(dy, dt){
  const d = Math.max(0, Number(dy) || 0), v = d / Math.max(1, Number(dt) || 1);
  return { close: d > SHEET_SWIPE_CLOSE_PX || (d > SHEET_SWIPE_FAST_PX && v > SHEET_SWIPE_FAST_V), vel: v };
}
// Закрити шторку за id через її власну функцію закриття; true — функція знайдена й викликана
function closeSheetById(id){
  const name = SHEET_CLOSERS[id]; const fn = name && window[name];
  if(typeof fn !== 'function') return false;
  fn(); return true;
}
// Відкриті шторки/діалоги, від верхньої до нижньої: .app-modal над шторками (z 96 / 91); серед шторок — за z-index, при рівності пізніша в DOM
function openSheetsTopFirst(){
  const out = [];
  const m = document.getElementById('app-modal'); if(m && m.classList.contains('open')) out.push({ id: 'app-modal', z: 1000, i: 1e9 });
  Array.prototype.forEach.call(document.querySelectorAll('.drawer.open'), function(d, i){ out.push({ id: d.id, z: Number(getComputedStyle(d).zIndex) || 91, i: i }); });
  out.sort(function(a, b){ return (b.z - a.z) || (b.i - a.i); });
  return out.map(function(o){ return o.id; });
}
// Esc: закриває лише верхню шторку чи діалог (раніше — усі разом, а п'ять шторок не закривав зовсім); false — відкритих немає
function closeTopSheet(){
  const ids = openSheetsTopFirst();
  for(let k = 0; k < ids.length; k++){ if(requestCloseSheet(ids[k], 'esc')) return true; } // Rev 2.32.376 (DS-4c): Esc теж через підтвердження для змінених форм
  return false;
}
// Rev 2.32.376 (DS-4c): підтвердження «Скасувати зміни?» при закритті зміненої форми. Один шлях для свайпу, затемнення, Esc і «Закрити»/«×»: requestCloseSheet(id, via).
// Збереження кнопкою викликає власні функції закриття напряму (без діалогу). Не змінена форма закривається мовчки, як раніше. Форма входу (profile-drawer) і довідкові шторки не охоплені.
// Ознака «змінено» — наявна saveFormChanged: порівняння з початковим станом без forceChange (відсутній запис за місяць не робить форму «зміненою» до першої правки).
const SHEET_DISCARD_FORMS = { 'card-debt-drawer': 'card', 'installment-drawer': 'inst', 'income-drawer': 'income', 'struct-drawer': 'struct', 'mono-detail-drawer': 'mono', 'debug-record-drawer': 'debug' };
function sheetIsDirty(id){
  const kind = SHEET_DISCARD_FORMS[id]; if(!kind) return false;
  const d = document.getElementById(id); if(!d || !d.classList.contains('open')) return false;
  try{
    if(kind === 'card' || kind === 'inst' || kind === 'income'){ const s = saveGateSnaps[kind]; return !!s && saveFormChanged(s.fields, readSaveGateFields(kind), false); }
    if(kind === 'struct') return !!(structForm && structForm.snap && structForm.read && saveFormChanged(structForm.snap, structForm.read(), false));
    if(kind === 'mono'){ if(!monoDetailSnap) return false; const cur = monoDetailFieldsNow(); return Object.keys(cur).some(function(k){ return cur[k] !== monoDetailSnap[k]; }); }
    if(kind === 'debug'){ const f = document.getElementById('debug-record-form'); if(!f || f.classList.contains('hidden')) return false; const el = document.getElementById('debug-record-scenario'); return !!el && el.value.trim() !== debugRecordSnap; }
  }catch(e){}
  return false;
}
function sheetDiscardRec(id, via, choice){ try{ if(typeof pushDebugEvent === 'function') pushDebugEvent({ type: 'sheet-discard', drawerId: id, via: via, choice: choice }); }catch(e){} }
// Клавіатура закривається штатно (blur → наявний конвеєр kb-*), діалог — коли лист опустився (без стрибка шторки). Стеля очікування 800 мс.
function sheetWhenKeyboardSettled(drawer, cb){
  const R = document.documentElement;
  const busy = function(){ return R.classList.contains('kb-sheet') || R.classList.contains('kb-sheet-closing') || document.body.classList.contains('kb-open'); };
  const a = document.activeElement;
  if(a && drawer.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){ try{ a.blur(); }catch(e){} }
  if(!busy()){ cb(); return; }
  const t0 = performance.now();
  (function wait(){ if(!busy() || performance.now() - t0 > 800){ cb(); return; } setTimeout(wait, 40); })();
}
// Єдина точка закриття за дією користувача. true — подію оброблено (закрито або показано діалог); false — шторки з таким id нема
function requestCloseSheet(id, via){
  if(sheetIsDirty(id)){
    const drawer = document.getElementById(id);
    if(!document.getElementById('app-modal').classList.contains('open')) sheetWhenKeyboardSettled(drawer, function(){ if(sheetIsDirty(id)) showSheetDiscardConfirm(id, via); });
    return true;
  }
  return closeSheetById(id);
}
// Діалог app-modal (не системний confirm): «Продовжити редагування» — основна, «Скасувати зміни» — червона. Фон, Esc і закриття діалогу = «Продовжити».
function showSheetDiscardConfirm(id, via){
  const drawer = document.getElementById(id);
  const text = document.getElementById('app-modal-text'); text.textContent = '';
  const title = document.createElement('div'); title.style.fontWeight = '700'; title.style.marginBottom = '6px'; title.id = 'app-modal-heading'; title.textContent = 'Скасувати зміни?';
  const body = document.createElement('div'); body.textContent = 'Внесені зміни не буде збережено.';
  text.appendChild(title); text.appendChild(body);
  const modal = document.getElementById('app-modal'); modal.setAttribute('aria-labelledby', 'app-modal-heading'); // VoiceOver читає заголовок
  const cancelBtn = document.getElementById('app-modal-cancel-btn'), confirmBtn = document.getElementById('app-modal-confirm-btn');
  cancelBtn.classList.remove('secondary'); cancelBtn.textContent = 'Продовжити редагування';
  confirmBtn.textContent = 'Скасувати зміни'; confirmBtn.className = 'submit-btn danger-outline';
  const field = drawer ? drawer.querySelector('input:not([type=hidden]), textarea, select') : null;
  confirmBtn.onclick = function(){
    sheetDiscardRec(id, via, 'discard');
    modal.removeAttribute('aria-labelledby');
    closeAppModal();
    lastFocusedBeforeDialog = null;
    closeSheetById(id);
  };
  appModalPurgeStyled = true;
  presentAppModal();
  lastFocusedBeforeDialog = field || drawer || lastFocusedBeforeDialog;
  sheetDiscardRec(id, via, 'ask');
  sheetDiscardWatch(modal, id, via);
}
// Закриття діалогу будь-яким іншим шляхом (Esc, фон, «Продовжити») = «Продовжити редагування»; фіксуємо вибір один раз
function sheetDiscardWatch(modal, id, via){
  let done = false;
  const fin = function(){ if(done) return; done = true; obs.disconnect(); modal.removeAttribute('aria-labelledby'); if(!(document.getElementById(id) && document.getElementById(id).classList.contains('open')) ) return; sheetDiscardRec(id, via, 'continue'); };
  const obs = new MutationObserver(function(){ if(!modal.classList.contains('open')) fin(); });
  obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
}
function sheetSwipeRec(ev){ try{ if(typeof pushDebugEvent === 'function') pushDebugEvent(Object.assign({ type: 'sheet-swipe' }, ev)); }catch(e){} }
// Чому жест зараз вимкнено: '' — можна; 'kb' (клавіатура), 'desktop' (бічна панель ≥ 1280)
function sheetSwipeBlockedWhy(drawer){
  if(document.documentElement.classList.contains('kb-sheet') || document.body.classList.contains('kb-open')) return 'kb';
  const a = document.activeElement; if(a && drawer.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return 'kb';
  try{ if(window.matchMedia && window.matchMedia('(min-width:1280px)').matches) return 'desktop'; }catch(e){}
  return '';
}
(function initDrawerSwipeToDismiss(){
  document.querySelectorAll('.drawer').forEach(function(drawer){
    const backdrop = (drawer.previousElementSibling && drawer.previousElementSibling.classList.contains('drawer-backdrop')) ? drawer.previousElementSibling : null;
    let st = null; // { id, y0, t0, dy, dragging, why, noted }
    function setDrag(dy){
      drawer.style.setProperty('--sheet-drag', dy + 'px');
      if(backdrop) backdrop.style.opacity = String(Math.max(0, 1 - dy / 400));
    }
    function clearDrag(){
      drawer.style.removeProperty('--sheet-drag');
      if(backdrop) backdrop.style.opacity = '';
    }
    drawer.addEventListener('pointerdown', function(e){
      if(!drawer.classList.contains('open') || e.button > 0) return;
      const t = e.target; if(!t || !t.closest) return;
      const zone = t.closest(SHEET_SWIPE_ZONE); if(!zone || !drawer.contains(zone)) return;
      if(t.closest('button, a, input, select, textarea, label')) return; // «×», кнопки й поля в заголовку — звичайні дотики
      st = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0, dragging: false, why: sheetSwipeBlockedWhy(drawer), noted: false };
    });
    drawer.addEventListener('pointermove', function(e){
      if(!st || e.pointerId !== st.id) return;
      const dy = Math.max(0, e.clientY - st.y0);
      if(!st.dragging){
        if(Math.abs(e.clientY - st.y0) < SHEET_SWIPE_SLOP) return;
        if(st.why){ if(!st.noted){ st.noted = true; sheetSwipeRec({ drawerId: drawer.id, delta: Math.round(dy), closed: false, why: st.why }); } return; } // вимкнено: нічого не рухаємо
        if(e.clientY < st.y0){ st = null; return; } // рух угору — не наш жест
        st.dragging = true; // зсув і швидкість рахуємо від моменту дотику (pointerdown), як у макеті
        drawer.style.transition = 'none';
        try{ if(drawer.setPointerCapture) drawer.setPointerCapture(e.pointerId); }catch(err){}
        return;
      }
      st.dy = dy; setDrag(dy);
    });
    function end(e){
      if(!st || (e && e.pointerId !== undefined && e.pointerId !== st.id)) return;
      const s = st; st = null;
      if(!s.dragging) return;
      const dec = sheetSwipeDecision(s.dy, performance.now() - s.t0);
      const reduced = (typeof motionReduced === 'function') && motionReduced();
      const askDiscard = dec.close && e && e.type !== 'pointercancel' && sheetIsDirty(drawer.id); // Rev 2.32.376 (DS-4c): змінена форма — пружне повернення, потім діалог
      if(askDiscard) dec.close = false;
      if(e && e.type === 'pointercancel'){ dec.close = false; }
      sheetSwipeRec({ drawerId: drawer.id, delta: Math.round(s.dy), vel: Math.round(dec.vel * 1000), closed: !!dec.close, why: askDiscard ? 'dirty' : '' });
      if(dec.close){
        drawer.style.transition = ''; // закриття рухає наявний перехід .drawer від поточного положення до низу
        if(!closeSheetById(drawer.id)){ // запасний шлях: «×» шторки
          const btn = drawer.querySelector('.drawer-close'); if(btn) btn.click();
        }
        clearDrag();
      } else {
        drawer.style.transition = reduced ? 'none' : 'transform var(--t-m) var(--ease-spring)';
        clearDrag();
        setTimeout(function(){ drawer.style.transition = ''; }, reduced ? 0 : 380);
        if(askDiscard) setTimeout(function(){ requestCloseSheet(drawer.id, 'swipe'); }, reduced ? 0 : 330);
      }
    }
    drawer.addEventListener('pointerup', end);
    drawer.addEventListener('pointercancel', end);
    // Rev 2.32.377 (DS-4a2): лише власна втрата захоплення шторкою. На iOS дотик неявно захоплюється елементом під пальцем (смужкою/заголовком); коли наш setPointerCapture переносить захоплення на шторку, подія lostpointercapture від смужки спливає сюди й раніше завершувала жест із зсувом 0 (звіт MT-1118-1989, 40 подій delta 0). Синтетичні дотики Playwright цього не відтворюють.
    drawer.addEventListener('lostpointercapture', function(e){ if(e.target !== drawer) return; if(st && st.dragging && e.pointerId === st.id) end(e); });
  });
})();
(window.__MT_FILES = window.__MT_FILES || []).push('sheets.js');
