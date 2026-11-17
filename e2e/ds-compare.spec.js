// DS-2 (Rev 2.32.335+): збір обчислених стилів усіх елементів DOM шести екранів і кількох шторок у двох темах (+ знімки 390 пт). Запуск лише з DS_CMP_DIR (порівняння «до/після» робить scripts/ds-compare.js); у звичайних прогонах пропускається.
// DS_CMP_DIR=<тека> npx playwright test e2e/ds-compare.spec.js --project=dark; тоді в <тека>/styles-<тема>-<екран>.json і <тека>/<тема>-<екран>.png
const { test } = require('@playwright/test');
const fs = require('fs');
const { installClock } = require('./clock');
const DIR = process.env.DS_CMP_DIR;
const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius', 'boxShadow', 'fontSize', 'transitionDuration', 'outlineColor', 'fill', 'stroke'];
test.skip(!DIR, 'потрібен DS_CMP_DIR');
test('ds-compare: стилі й знімки', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user);
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500); // індикатор синхронізації не має бути посеред переходу
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  // transition:none заглушає й transitionDuration — тож стилі збираємо ДО вставки заглушки не можна; збираємо з окремим прапорцем нижче
  await page.evaluate(() => { const st = document.querySelector('style:last-of-type'); window.__stubStyle = st; });
  const collect = async (name, theme) => {
    // прибираємо заглушку лише на час збору, щоб transitionDuration був справжнім
    const data = await page.evaluate((props) => {
      const st = window.__stubStyle; const parent = st.parentNode; const next = st.nextSibling; st.remove();
      const out = []; const all = document.querySelectorAll('*');
      all.forEach((el, i) => { const cs = getComputedStyle(el); const o = [i, el.tagName + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '')]; props.forEach(p => o.push(cs[p])); out.push(o); });
      parent.insertBefore(st, next);
      return out;
    }, PROPS);
    fs.writeFileSync(DIR + '/styles-' + theme + '-' + name + '.json', JSON.stringify({ props: PROPS, data }));
    await page.waitForTimeout(600);
    await page.screenshot({ path: DIR + '/' + theme + '-' + name + '.png', fullPage: true });
  };
  for (const theme of ['dark', 'light']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(300);
    await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(2500); await collect('analytics', theme);
    for (const tab of ['accounting', 'vytraty', 'structure', 'service']){ await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(500); await collect(tab, theme); }
    // шторки й екрани (самі стилі DOM шторок присутні завжди; відкриття додає стани .open/.visible)
    const overlays = [['settings', () => openSettings(), () => { const b = document.querySelector('.drawer.open .drawer-close, .app-modal.open .drawer-close'); if(b) b.click(); }], ['notif', () => openNotifArchive(), () => closeNotifArchive()], ['profile', () => openProfileMenu(), () => { const b = document.querySelector('.drawer.open .drawer-close'); if(b) b.click(); }], ['monoscreen', () => openMonoScreen(), () => closeMonoScreen()], ['inbox', () => openMonoInbox({ tab: 'new' }), () => closeMonoInbox()], ['trash', () => openTrashScreen(), () => closeTrashScreen()]];
    for (const [n, open, close] of overlays){
      try{ await page.evaluate(open); await page.waitForTimeout(700); await collect('ov-' + n, theme); await page.evaluate(close); await page.waitForTimeout(400); }catch(e){ fs.writeFileSync(DIR + '/ov-' + n + '-' + theme + '.err', String(e)); }
    }
    await page.evaluate(() => switchTab('analytics'));
  }
});
