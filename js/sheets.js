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
  'installment-drawer': 'closeInstallmentEditor', 'income-drawer': 'closeIncomeEditor', 'app-modal': 'closeAppModal'
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
  for(let k = 0; k < ids.length; k++){ if(closeSheetById(ids[k])) return true; }
  return false;
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
      if(e && e.type === 'pointercancel'){ dec.close = false; }
      sheetSwipeRec({ drawerId: drawer.id, delta: Math.round(s.dy), vel: Math.round(dec.vel * 1000), closed: !!dec.close, why: '' });
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
      }
    }
    drawer.addEventListener('pointerup', end);
    drawer.addEventListener('pointercancel', end);
    drawer.addEventListener('lostpointercapture', function(e){ if(st && st.dragging && e.pointerId === st.id) end(e); });
  });
})();
(window.__MT_FILES = window.__MT_FILES || []).push('sheets.js');
