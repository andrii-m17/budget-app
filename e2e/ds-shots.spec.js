// DS-N1…N4: знімки «до/після» для погодження вигляду (390 пт, CSS-масштаб, 5 екранів і 6 шторок у двох темах) і значення всіх токенів tokens.css. Запуск лише з DS_SHOTS_DIR і DS_SHOTS_SUFFIX (before|after).
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test('ds-shots: знімки й значення токенів', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(DIR, { recursive: true });
  const tok = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8').replace(/\/\*[^]*?\*\//g, '');
  const names = Array.from(new Set(tok.match(/--[a-zA-Z0-9-]+(?=\s*:)/g) || []));
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user);
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  const vars = {}; const overflow = {}; const nested = {}; const heights = {};
  const scrollH = () => { let m = 0; document.querySelectorAll('*').forEach(e => { if(/(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4) m = Math.max(m, e.scrollHeight); }); return Math.max(m, document.documentElement.scrollHeight); };
  // вкладені радіуси (DS-N3): елемент із радіусом, що лежить у предку з радіусом на відстані ≤ 6 px від його краю; внутрішній ефективний радіус має бути ≤ зовнішній − відступ (радіус обмежується половиною меншої сторони)
  const collectNested = () => { const out = []; const eff = (el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); const v = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => { const m = cs[k].match(/([\d.]+)px/); return m ? parseFloat(m[1]) : (/%/.test(cs[k]) ? Math.min(r.width, r.height) / 2 : 0); }); return Math.min(Math.max.apply(null, v), r.width / 2, r.height / 2); }; document.querySelectorAll('body *').forEach(el => { if(!el.getClientRects().length) return; const ri = eff(el); if(ri <= 0) return; const r = el.getBoundingClientRect(); if(r.width === 0 || r.height === 0) return; let p = el.parentElement; while(p && p !== document.body){ const ro = eff(p); if(ro > 0){ const pr = p.getBoundingClientRect(); const gap = Math.min(r.left - pr.left, r.top - pr.top, pr.right - r.right, pr.bottom - r.bottom); if(gap >= 0 && gap <= 6 && ri > ro - gap + 0.5){ const d = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''); out.push(d(el) + ' (r ' + Math.round(ri * 10) / 10 + ') у ' + d(p) + ' (r ' + Math.round(ro * 10) / 10 + ', відступ ' + Math.round(gap * 10) / 10 + ')'); } break; } p = p.parentElement; } }); return out; };
  // елементи, де текст не вміщується: обрізаний по ширині (overflow не visible, scrollWidth > clientWidth, не горизонтальна прокрутка) або line-clamp із прихованими рядками
  const collectOverflow = () => { const out = []; document.querySelectorAll('body *').forEach(el => { if(!el.getClientRects().length || el.offsetWidth === 0) return; const cs = getComputedStyle(el); if(cs.visibility === 'hidden') return; const txt = (el.value != null && el.tagName === 'INPUT') ? '' : (Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()); const clampedW = cs.overflowX !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && el.scrollWidth > el.clientWidth + 1; const clampedH = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1; if((clampedW || clampedH) && (txt || el.tagName === 'INPUT')) out.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '') + ' «' + txt.slice(0, 30) + '»' + (clampedH ? ' [clamp]' : '')); }); return out; };
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    vars[theme] = await page.evaluate((ns) => { const cs = getComputedStyle(document.documentElement); const o = {}; ns.forEach(n => { o[n] = cs.getPropertyValue(n).trim(); }); return o; }, names);
    const shot = async (n) => { await page.waitForTimeout(700); overflow[theme + '-' + n] = await page.evaluate(collectOverflow); nested[theme + '-' + n] = await page.evaluate(collectNested); heights[theme + '-' + n] = await page.evaluate(scrollH); await page.screenshot({ path: path.join(DIR, n + '-' + theme + '-' + SUF + '.png'), scale: 'css' }); };
    await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(2500); await shot('analytics');
    for (const tab of ['accounting', 'vytraty', 'structure', 'service']){ await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(500); await shot(tab); }
    const overlays = [['settings', () => openSettings(), () => { const b = document.querySelector('.drawer.open .drawer-close, .app-modal.open .drawer-close'); if(b) b.click(); }], ['notif', () => openNotifArchive(), () => closeNotifArchive()], ['profile', () => openProfileMenu(), () => closeProfileMenu()], ['monoscreen', () => openMonoScreen(), () => closeMonoScreen()], ['inbox', () => openMonoInbox({ tab: 'new' }), () => closeMonoInbox()], ['trash', () => openTrashScreen(), () => closeTrashScreen()]];
    for (const [n, open, close] of overlays){ try{ await page.evaluate(open); await page.waitForTimeout(700); await shot('ov-' + n); await page.evaluate(close); await page.waitForTimeout(400); }catch(e){} }
    // скло плаваючих елементів: натиск таббару (блиск) і таббар поверх тексту (прокручений список)
    await page.evaluate(() => switchTab('accounting')); await page.waitForTimeout(400);
    await page.evaluate(() => { document.querySelector('nav.tabbar').classList.add('pressed'); }); await shot('tabbar-press');
    await page.evaluate(() => { document.querySelector('nav.tabbar').classList.remove('pressed'); switchTab('vytraty'); }); await page.waitForTimeout(500);
    await page.evaluate(() => { document.querySelectorAll('*').forEach(e => { if(e.scrollHeight > e.clientHeight + 300 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) e.scrollTop = 420; }); }); await shot('tabbar-over-text');
    await page.evaluate(() => switchTab('analytics'));
  }
  // довгі списки: фікстура large, «Облік» і «Структура»
  await page.goto('/index.html?fixture=large');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user);
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    for (const tab of ['accounting', 'structure']){
      await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(800);
      overflow[theme + '-long-' + tab] = await page.evaluate(collectOverflow); heights[theme + '-long-' + tab] = await page.evaluate(scrollH);
      await page.screenshot({ path: path.join(DIR, 'long-' + tab + '-' + theme + '-' + SUF + '.png'), scale: 'css' });
    }
  }
  fs.writeFileSync(path.join(DIR, 'vars-' + SUF + '.json'), JSON.stringify(vars, null, 1));
  fs.writeFileSync(path.join(DIR, 'overflow-' + SUF + '.json'), JSON.stringify(overflow, null, 1));
  fs.writeFileSync(path.join(DIR, 'nested-' + SUF + '.json'), JSON.stringify(nested, null, 1));
  fs.writeFileSync(path.join(DIR, 'heights-' + SUF + '.json'), JSON.stringify(heights, null, 1));
});
