// LOGIN-ARROWS (Крок 0): рух шторки входу при натисканні стрілок «Попереднє/Наступне» над клавіатурою; кандидати вмикаються ін'єкцією в сторінку (код застосунку не змінюється;
// (в) потребує прапорця у worktree-копії kbMotionPan). Реальні дотики на симуляторі (Appium + XCUITest, мок хмари).
// Запуск: SIM_VARIANT=base|a1|a2|b|c|g node e2e/ios/login-arrows.mjs --trials 10   (SIM_OUT — тека знімків; SIM_DUMP=1 — лише список кнопок)
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';
const argv = process.argv.slice(2);
const TRIALS = Number(argv.indexOf('--trials') !== -1 ? argv[argv.indexOf('--trials') + 1] : 10);
const VARIANT = process.env.SIM_VARIANT || 'base';
const OUT = path.join(process.env.SIM_OUT || '/tmp/la', VARIANT);
fs.mkdirSync(OUT, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));

// Кандидати: ін'єкції після відкриття форми входу
const INJECT = {
  base: () => {},
  // (а) два кроки: крок 1 — лише Email і «Далі»; крок 2 — лише Пароль + приховане поле username. Тут модельовано крок 1 (єдине видиме поле) і крок 2 (єдине видиме поле + прихований username)
  a: (step) => {
    const email = document.getElementById('cldfielda1'), pass = document.getElementById('cloud-password');
    const wrapE = email.closest('.field'), wrapP = pass.closest('.field');
    if (step === 2) { wrapE.style.display = 'none'; email.setAttribute('tabindex', '-1'); wrapP.style.display = ''; }
    else { wrapP.style.display = 'none'; wrapE.style.display = ''; }
  },
  // (б) readonly на полі без курсора; знімається на прямий дотик (touchstart/pointerdown)
  b: () => {
    const email = document.getElementById('cldfielda1'), pass = document.getElementById('cloud-password');
    const arm = (self, other) => { other.readOnly = true; self.readOnly = false; };
    [email, pass].forEach(f => {
      f.addEventListener('focus', () => arm(f, f === email ? pass : email));
      ['touchstart', 'pointerdown', 'mousedown'].forEach(ev => f.addEventListener(ev, () => { f.readOnly = false; }, { capture: true }));
      f.addEventListener('blur', () => { email.readOnly = false; pass.readOnly = false; });
    });
  },
  // (в) без компенсації pan-comp для полів входу (прапорець читає worktree-копія kbMotionPan)
  c: () => { window.__loginNoPanComp = true; },
  // (г) поля впритул під заголовком: без блоку «Ви не увійшли»
  g: () => {
    const s = document.createElement('style');
    s.textContent = '#cloud-login-form .profile-head{display:none !important} #cloud-login-form{padding-top:0 !important}';
    document.head.appendChild(s);
  },
};

async function arrowButtons(d){
  await L.toNative(d);
  const els = await d.$$('-ios predicate string:type IN {"XCUIElementTypeButton"} AND visible == 1');
  const out = [];
  for (const e of els) { try { out.push({ name: await e.getAttribute('name'), label: await e.getAttribute('label'), enabled: await e.getAttribute('enabled'), y: (await e.getLocation()).y, x: (await e.getLocation()).x, el: e }); } catch (e2) {} }
  await L.toWeb(d);
  return out;
}
const isNext = b => /^(Next|Наступне|Next Field|Наступне поле)$/i.test(b.name || '') || /Next Field|Наступне поле|^Next$/i.test(b.label || '');
const isPrev = b => /^(Previous|Попереднє|Previous Field|Попереднє поле)$/i.test(b.name || '') || /Previous Field|Попереднє поле|^Previous$/i.test(b.label || '');

// Покадрова вибірка ВИДИМОГО верху шторки (rect.top − visualViewport.offsetTop: що бачить користувач) і visualViewport.offsetTop; шторка position:fixed, тож зсув видимої області без компенсації виглядає як стрибок шторки
const SAMPLER = () => {
  window.__fr = []; const t0 = performance.now(); let on = true; window.__frStop = () => { on = false; };
  const dr = document.getElementById('profile-drawer');
  (function f(){ if (!on) return; const vv = window.visualViewport, r = dr.getBoundingClientRect(); window.__fr.push([Math.round(performance.now() - t0), Math.round((r.top - vv.offsetTop) * 10) / 10, Math.round(vv.offsetTop * 10) / 10, Math.round(vv.height), document.activeElement && document.activeElement.id || '']); requestAnimationFrame(f); })();
};

async function main(){
  const dev = L.pickDevice(process.env.SIM_IPHONE || 'iPhone 16 Pro Max');
  L.bootSim(dev); L.ensureSimClip(dev);
  await L.startServers('/tmp/la-logs');
  const d = await L.openSession(dev, 'PORTRAIT');
  const res = { variant: VARIANT, version: L.appVersion(), device: dev.name + ' ' + dev.runtime, trials: [] };
  try {
    try { await L.launchPwa(d); } catch (e) { await pause(2000); await L.launchPwa(d); }
    await L.loadApp(d);
    const map = await L.calibrate(d);
    await L.toWeb(d);
    for (let k = 0; k < TRIALS; k++) {
      await L.toWeb(d);
      await d.execute(() => { try { closeProfileLoginDrawer(); } catch (e) {} });
      await pause(700);
      await d.execute(() => { showProfileLoginForm(); });
      await pause(1200);
      if (VARIANT === 'a1') await d.execute(INJECT.a, 1); else if (VARIANT === 'a2') await d.execute(INJECT.a, 2); else await d.execute(INJECT[VARIANT]);
      const tr = { k, rows: [] };
      const firstId = VARIANT === 'a2' ? '#cloud-password' : '#cldfielda1';
      await L.tapSelector(d, map, firstId);
      await pause(1800);
      const base = await d.execute(() => { const vv = window.visualViewport; return { top: document.getElementById('profile-drawer').getBoundingClientRect().top, vvTop: vv.offsetTop, vvH: Math.round(vv.height), active: document.activeElement && document.activeElement.id }; });
      tr.afterOpen = base;
      if (k === 0) await L.shot(d, path.join(OUT, 't0-email-focused'));
      const btns = await arrowButtons(d);
      if (process.env.SIM_DUMP) { console.log('BTNS ' + JSON.stringify(btns.map(b => ({ n: b.name, l: b.label, e: b.enabled, x: b.x, y: b.y })))); break; }
      // Стрілок нема в нативному дереві: координати відносно рядка «Паролі» (панель QuickType) або верху клавіатури; панель: ∧ x≈0.103·W, ∨ x≈0.226·W, центр ≈ 35 pt над верхом рядка «Паролі»
      const pw = btns.find(b => b.name === 'Паролі');
      const kt = await L.keyboardTopNative(d);
      const barY = pw ? pw.y - 35 : (kt != null ? kt - 52 : null);
      tr.barY = barY;
      const W = map.win.width;
      for (const [label, x] of [['down', W * 0.226], ['up', W * 0.103]]) {
        if (barY == null) { tr.rows.push({ label, skipped: 'немає координат панелі' }); continue; }
        await L.toWeb(d);
        const act0 = await d.execute(() => document.activeElement && document.activeElement.id);
        const wall0 = Date.now();
        await d.execute(SAMPLER);
        await L.tapScreen(d, x, barY);
        await pause(800);
        await L.toWeb(d);
        const fr = await d.execute(() => { window.__frStop(); return window.__fr; });
        const tops = fr.map(f => f[1]), vvs = fr.map(f => f[2]);
        const active = await d.execute(() => document.activeElement && document.activeElement.id);
        const evs = await d.execute(w => (typeof recBuf !== 'undefined' ? recBuf : []).filter(e => e.wall >= w && /^(pan-comp|pan-corrected|switch-native|native-switch|sheet-anim|kb-vv-resize)$/.test(e.type)).map(e => [e.type, e.panShift != null ? e.panShift : null, e.vvOffsetTop != null ? e.vvOffsetTop : null, e.drawerTop != null ? e.drawerTop : null]), wall0);
        tr.rows.push({ label, from: act0, evs, active, switched: active !== act0, frames: fr.length, maxMove: Math.round((Math.max(...tops) - Math.min(...tops)) * 10) / 10, maxVvTop: Math.max(...vvs), endTopDelta: Math.round((tops[tops.length - 1] - tops[0]) * 10) / 10, series: k === 0 ? fr.filter((_, i) => i % 3 === 0).slice(0, 18) : undefined });
        if (k === 0) await L.shot(d, path.join(OUT, 't0-after-' + label));
        await pause(500);
      }
      if (process.env.SIM_EXTRA && VARIANT !== 'a1' && VARIANT !== 'a2') {
        // прямі дотики по іншому полю й Return («Далі» на клавіатурі), з тією ж покадровою вибіркою; після кожного кроку — чи можна друкувати
        const meas = async (label, act) => {
          await L.toWeb(d);
          const act0 = await d.execute(() => document.activeElement && document.activeElement.id);
          await d.execute(SAMPLER); await act(); await pause(900); await L.toWeb(d);
          const fr = await d.execute(() => { window.__frStop(); return window.__fr; });
          const tops = fr.map(f => f[1]);
          const st = await d.execute(() => ({ active: document.activeElement && document.activeElement.id, ro: document.activeElement && document.activeElement.readOnly }));
          tr.rows.push({ label, from: act0, active: st.active, readOnly: st.ro, switched: st.active !== act0, maxMove: Math.round((Math.max(...tops) - Math.min(...tops)) * 10) / 10, maxVvTop: Math.max(...fr.map(f => f[2])) });
        };
        await meas('tapPassword', () => L.tapSelector(d, map, '#cloud-password'));
        await meas('tapEmail', () => L.tapSelector(d, map, '#cldfielda1'));
        await meas('return', async () => { const b2 = await arrowButtons(d); const rk = b2.find(b => b.name === 'Next:' || b.name === 'Return'); if (rk) await L.tapScreen(d, rk.x + 20, rk.y + 20); });
        // друк у поле, що в фокусі (пароль): символ з клавіатури
        await L.toNative(d);
        const keys = await d.$$('-ios predicate string:type == "XCUIElementTypeKey"');
        for (const kk of keys) { const nn = await kk.getAttribute('name'); if (nn && nn.length === 1 && nn !== ' ') { await kk.click(); break; } } // будь-яка літера активної розкладки
        await L.toWeb(d); await pause(300);
        tr.typed = await d.execute(() => { const a = document.activeElement; return a ? { id: a.id, len: a.value.length } : null; });
      }
      res.trials.push(tr);
      console.log('TRIAL ' + JSON.stringify(tr));
    }
  } finally { try { await d.deleteSession(); } catch (e) {} L.killChildren(); }
  const moves = res.trials.flatMap(t => t.rows.filter(r => r.maxMove != null).map(r => r.maxMove));
  console.log('RESULT ' + JSON.stringify({ variant: VARIANT, n: res.trials.length, moves, maxMove: moves.length ? Math.max(...moves) : null, notSwitched: res.trials.filter(t => t.rows.some(r => r.switched === false)).length }));
}
main().catch(e => { console.error(e); L.killChildren(); process.exit(2); });
