// Жест шторок: свайп донизу за смужку (initDrawerSwipeToDismiss)
// Перенесено з index.html дослівно, без змін (Rev 2.32.370, DS-4a0). Звичайний скрипт: підключається в index.html після розмітки шторок і перед основним скриптом; виконується під час завантаження, як і раніше.

// Rev #30 (6D.12) — свайп-донизу для закриття .drawer (як iOS bottom sheet).
// Один генеричний обробник на всі 5 drawer'ів через спільний .drawer-handle
// клас — НЕ дублює close-логіку кожного drawer'а (валідацію/збереження не
// чіпаємо), а просто клікає вже наявну .drawer-close кнопку цього ж
// drawer'а по завершенню жесту. Під час драгу transition вимкнено і
// transform керується напряму пальцем; відпущено вище порогу (90px) —
// клік по close, інакше — inline-стилі скидаються й .drawer.open transition
// сам плавно повертає картку на місце.
(function initDrawerSwipeToDismiss(){
  document.querySelectorAll('.drawer').forEach(function(drawer){
    const handle = drawer.querySelector('.drawer-handle');
    if(!handle) return;
    let startY = 0, currentY = 0, dragging = false;
    function onStart(e){
      dragging = true;
      startY = currentY = (e.touches ? e.touches[0].clientY : e.clientY);
      drawer.style.transition = 'none';
      if(e.pointerId !== undefined && handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
    }
    function onMove(e){
      if(!dragging) return;
      currentY = (e.touches ? e.touches[0].clientY : e.clientY);
      const dy = Math.max(0, currentY - startY);
      drawer.style.transform = 'translateY(' + dy + 'px)';
    }
    function onEnd(){
      if(!dragging) return;
      dragging = false;
      const dy = currentY - startY;
      drawer.style.transition = '';
      drawer.style.transform = '';
      if(dy > 90){
        const closeBtn = drawer.querySelector('.drawer-close');
        if(closeBtn) closeBtn.click();
      }
    }
    handle.addEventListener('touchstart', onStart, {passive:true});
    handle.addEventListener('touchmove', onMove, {passive:true});
    handle.addEventListener('touchend', onEnd);
    handle.addEventListener('touchcancel', onEnd);
    handle.addEventListener('pointerdown', onStart);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  });
})();
(window.__MT_FILES = window.__MT_FILES || []).push('sheets.js');
