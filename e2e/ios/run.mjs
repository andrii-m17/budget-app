// SIM-1: npm run e2e:ios — клавіатура й форми на симуляторі iPhone та iPad (Appium + XCUITest + Safari).
// Застосунок з локального статичного сервера на моку хмари (?fixture=typical), справжніх даних і серверів Supabase немає. Лише інструменти.
// Результат: docs/ui/sim/<версія>/ (JSON з цифрами, знімки JPEG ≤ 300 КБ на сценарій, summary.md). Код виходу 1, якщо хоч один сценарій не пройшов.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const VERSION = L.appVersion();
const OUT = path.join(L.ROOT, 'docs', 'ui', 'sim', VERSION);
const T = L.THRESHOLDS;
const PHONE = process.env.SIM_IPHONE || 'iPhone 16 Pro Max', PAD = process.env.SIM_IPAD || 'iPad (10th generation)';
const ONLY = process.env.SIM_ONLY ? process.env.SIM_ONLY.split(',') : null; // напр. SIM_ONLY=iphone-portrait
const CONFIGS = [
  { id: 'iphone-portrait', device: PHONE, orientation: 'PORTRAIT' },
  { id: 'iphone-landscape', device: PHONE, orientation: 'LANDSCAPE' },
  { id: 'ipad-portrait', device: PAD, orientation: 'PORTRAIT' },
  { id: 'ipad-landscape', device: PAD, orientation: 'LANDSCAPE' },
].filter(c => !ONLY || ONLY.indexOf(c.id) !== -1);

const SHEETS = [
  { id: 'card', title: 'Картка боргу', open: () => { switchTab('accounting'); openCardDebtEditor(0); }, sel: '#card-debt-drawer', backdrop: '#card-debt-backdrop', f1: '#cdd-balance', f2: '#cdd-limit' },
  { id: 'login', title: 'Вхід', open: () => { showProfileLoginForm(); }, sel: '#profile-drawer', backdrop: '#profile-backdrop', f1: '#cldfielda1', f2: '#cloud-password' },
];
const pause = ms => new Promise(r => setTimeout(r, ms));
// Довідково: зазор між низом листа й верхом справжньої клавіатури (точки екрана; у вкладці Safari visualViewport враховує й панель браузера, тож цифри розходяться): низ листа = зсув вікна перегляду + низ у CSS-пікселях × масштаб. null, якщо клавіатури чи листа нема.
const nativeGap = (m, map, kb) => !map.calibrated ? null : (m.sheetBottom == null || kb.top == null) ? null : Math.round((kb.top - (map.oy + m.sheetBottom * map.k)) * 10) / 10;
const idOf = s => String(s).replace('#', '');

function animChecks(events, phases, needFrames){
  const why = [];
  const anims = events.filter(e => e.type === 'sheet-anim' && phases.indexOf(e.phase) !== -1);
  if(!anims.length) why.push('подій sheet-anim (' + phases.join('/') + ') немає');
  anims.forEach(a => {
    if(needFrames && a.frames < T.minFrames) why.push(a.phase + ': кадрів ' + a.frames + ' (< ' + T.minFrames + ')');
    if(a.maxGapMs > T.maxGapMs) why.push(a.phase + ': пауза ' + a.maxGapMs + ' мс (> ' + T.maxGapMs + ')');
    if(a.phase === 'switch' && a.jumpMaxPx != null && a.jumpMaxPx > T.sheetTolPt) why.push(a.phase + ': стрибок ' + a.jumpMaxPx + ' пт (> ' + T.sheetTolPt + ')');
  });
  return { why, anims: anims.map(a => ({ phase: a.phase, frames: a.frames, maxGapMs: a.maxGapMs, durationMs: a.durationMs, jumpMaxPx: a.jumpMaxPx })) };
}

async function runSheet(d, cfg, sh, rec){
  // підготовка: чисте завантаження, «прогрів» (одне відкриття/закриття без вимірювання), запис діагностики
  await L.loadApp(d);
  await d.execute((o) => { const f = new Function('return (' + o + ')')(); f(); }, sh.open.toString());
  await pause(1200);
  await d.execute(() => { document.querySelectorAll('.drawer.open, .drawer-backdrop.open').forEach(x => x.classList.remove('open')); document.body.classList.remove('kb-open'); });
  await pause(800);
  await d.refresh(); await L.loadApp(d);
  await L.recorderStart(d);

  // --- 1. відкриття листа і дотик у перше поле ---
  const s1 = { id: sh.id + '-open-focus', title: sh.title + ': відкриття листа, дотик у поле, клавіатура', why: [] };
  await d.execute((o) => { new Function('return (' + o + ')')()(); }, sh.open.toString());
  await pause(1200);
  const before = await L.shot(d, path.join(OUT, cfg.id + '-' + s1.id + '-before'));
  const mark1 = await L.eventMark(d);
  const tap1 = await L.tapSelector(d, sh.f1);
  await pause(1800);
  const kbi1 = await L.keyboardInfo(d), kb1 = kbi1.shown;
  const m1 = await L.metrics(d, sh.sel);
  const map1 = await L.mapNow(d);
  const ev1 = await L.eventsSince(d, mark1);
  const after = await L.shot(d, path.join(OUT, cfg.id + '-' + s1.id + '-after'));
  if(!kb1) s1.why.push('екранна клавіатура не з\'явилась');
  if(m1.active !== idOf(sh.f1)) s1.why.push('фокус у «' + m1.active + '», очікувалось «' + idOf(sh.f1) + '»');
  const gap1 = m1.sheetBottom == null ? null : Math.round((m1.vvBottom - m1.sheetBottom) * 10) / 10, nat1 = nativeGap(m1, map1, kbi1);
  if(gap1 == null) s1.why.push('низ листа не виміряно');
  else if(Math.abs(gap1 - T.sheetGapPt) > T.sheetTolPt) s1.why.push('низ листа над клавіатурою ' + gap1 + ' пт (очікувалось ' + T.sheetGapPt + ' ± ' + T.sheetTolPt + ')');
  if(!m1.kbOpenClass) s1.why.push('клас kb-open не встановлено');
  const a1 = animChecks(ev1, ['open'], true); a1.why.forEach(w => s1.why.push(w));
  Object.assign(s1, { metrics: { ...m1, keyboardTopPt: kbi1.top, keyboardHeightPt: kbi1.height, sheetGapVisualViewport: gap1, sheetGapToNativeKeyboard: nat1, keyboardShown: kb1, tap: tap1 }, anim: a1.anims, events: ev1, files: [before, after] });
  rec.push(s1);

  // --- 2. перемикання на друге поле ---
  const s2 = { id: sh.id + '-switch', title: sh.title + ': перемикання полів', why: [] };
  const b2 = await L.shot(d, path.join(OUT, cfg.id + '-' + s2.id + '-before'));
  const mark2 = await L.eventMark(d);
  await L.tapSelector(d, sh.f2);
  await pause(1500);
  const kbi2 = await L.keyboardInfo(d), kb2 = kbi2.shown;
  const m2 = await L.metrics(d, sh.sel);
  const map2 = await L.mapNow(d);
  const ev2 = await L.eventsSince(d, mark2);
  const a2s = await L.shot(d, path.join(OUT, cfg.id + '-' + s2.id + '-after'));
  if(!kb2) s2.why.push('клавіатура зникла під час перемикання');
  if(m2.active !== idOf(sh.f2)) s2.why.push('фокус у «' + m2.active + '», очікувалось «' + idOf(sh.f2) + '»');
  const gap2 = m2.sheetBottom == null ? null : Math.round((m2.vvBottom - m2.sheetBottom) * 10) / 10, nat2 = nativeGap(m2, map2, kbi2);
  if(gap2 == null) s2.why.push('низ листа не виміряно');
  else if(Math.abs(gap2 - T.sheetGapPt) > T.sheetTolPt) s2.why.push('низ листа над клавіатурою ' + gap2 + ' пт (очікувалось ' + T.sheetGapPt + ' ± ' + T.sheetTolPt + ')');
  const drift = gap1 == null || gap2 == null ? null : Math.round(Math.abs(gap2 - gap1) * 10) / 10;
  if(drift != null && drift > T.sheetTolPt) s2.why.push('лист зсунувся на ' + drift + ' пт між полями');
  const a2 = animChecks(ev2.filter(e => e.type !== 'sheet-anim' || e.phase === 'switch'), ['switch'], false);
  a2.why.filter(w => w.indexOf('немає') === -1).forEach(w => s2.why.push(w)); // для перемикання подія може бути відсутня, якщо лист не рухався
  Object.assign(s2, { metrics: { ...m2, keyboardTopPt: kbi2.top, sheetGapVisualViewport: gap2, sheetGapToNativeKeyboard: nat2, driftPt: drift, keyboardShown: kb2 }, anim: a2.anims, events: ev2, files: [b2, a2s] });
  rec.push(s2);

  // --- 3. закриття дотиком по підкладці ---
  const s3 = { id: sh.id + '-close', title: sh.title + ': закриття, клавіатура зникає, таб-бар на місці', why: [] };
  const b3 = await L.shot(d, path.join(OUT, cfg.id + '-' + s3.id + '-before'));
  const mark3 = await L.eventMark(d);
  await L.tapSelector(d, sh.backdrop, { x: 24, y: 70 });
  await pause(1800);
  const kb3 = await L.keyboardShown(d);
  const m3 = await L.metrics(d, sh.sel);
  const ev3 = await L.eventsSince(d, mark3);
  const a3s = await L.shot(d, path.join(OUT, cfg.id + '-' + s3.id + '-after'));
  if(kb3) s3.why.push('клавіатура лишилась після закриття');
  if(m3.drawerOpen) s3.why.push('лист не закрився');
  if(Math.abs(m3.vvH - m3.innerH) > 2) s3.why.push('видима область не повернулась: ' + m3.vvH + ' проти ' + m3.innerH);
  if(m3.kbOpenClass) s3.why.push('клас kb-open лишився');
  if(m3.tabbarVisible === false) s3.why.push('таб-бар не видно');
  if(m3.tabbarGap != null && m3.tabbarGap < T.tabbarMinPt) s3.why.push('таб-бар від низу ' + m3.tabbarGap + ' пт (< ' + T.tabbarMinPt + ')');
  const a3 = animChecks(ev3, ['close'], true); a3.why.filter(w => w.indexOf('немає') === -1).forEach(w => s3.why.push(w));
  Object.assign(s3, { metrics: { ...m3, keyboardShown: kb3 }, anim: a3.anims, events: ev3, files: [b3, a3s] });
  rec.push(s3);
}

const fmt = s => s.why.length ? 'впав' : 'пройшов';
async function main(){
  const t0 = Date.now();
  fs.mkdirSync(OUT, { recursive: true });
  await L.startServers(OUT);
  const all = [];
  const info = [];
  for(const cfg of CONFIGS){
    const dev = L.pickDevice(cfg.device);
    L.bootSim(dev);
    info.push({ cfg: cfg.id, device: dev.name, runtime: dev.runtime });
    let d;
    try{
      d = await L.openSession(dev, cfg.orientation);
      for(const sh of SHEETS){
        const rec = [];
        try{ await runSheet(d, cfg, sh, rec); }
        catch(e){ rec.push({ id: sh.id + '-error', title: sh.title + ': збій прогону', why: ['помилка прогону: ' + String(e && e.message || e).split('\n')[0]], metrics: {}, anim: [], events: [], files: [] }); }
        rec.forEach(r => { r.cfg = cfg.id; all.push(r); });
      }
    }catch(e){
      all.push({ cfg: cfg.id, id: 'session', title: 'сесія ' + cfg.id, why: ['сесію не відкрито: ' + String(e && e.message || e).split('\n')[0]], files: [], events: [], anim: [], metrics: {} });
    }finally{ try{ if(d) await d.deleteSession(); }catch(e){} }
  }
  // JSON зі цифрами на кожен сценарій; знімки лишаємо, якщо разом ≤ 300 КБ на сценарій
  all.forEach(r => {
    let size = 0; (r.files || []).forEach(f => { try{ size += fs.statSync(f).size; }catch(e){} });
    if(size > 300 * 1024){ (r.files || []).forEach(f => { try{ fs.unlinkSync(f); }catch(e){} }); r.filesDropped = 'знімки > 300 КБ, лише JSON'; r.files = []; }
    r.files = (r.files || []).map(f => path.basename(f));
    r.verdict = fmt(r);
    fs.writeFileSync(path.join(OUT, r.cfg + '-' + r.id + '.json'), JSON.stringify(r, null, 1));
  });
  const dur = Math.round((Date.now() - t0) / 1000);
  const fails = all.filter(r => r.why.length);
  const md = ['# SIM-1 · ' + VERSION + ' · симулятор iOS (Safari, вкладка)', '',
    'Прогін: ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ', ' + dur + ' с. Пристрої: ' + info.map(i => i.cfg + ' = ' + i.device + ' (' + i.runtime + ')').join('; ') + '.',
    'Пороги (наявні): sheet-anim ≥ ' + T.minFrames + ' кадрів (відкриття/закриття) і пауза ≤ ' + T.maxGapMs + ' мс; низ листа над клавіатурою ' + T.sheetGapPt + ' ± ' + T.sheetTolPt + ' пт; таб-бар від низу ≥ ' + T.tabbarMinPt + ' пт. Фокус ставиться дотиком, екранна клавіатура.', '',
    '| Конфігурація | Сценарій | Результат | Причина |', '|---|---|---|---|'];
  all.forEach(r => md.push('| ' + r.cfg + ' | ' + r.title + ' | ' + r.verdict + ' | ' + (r.why.join('; ') || '—') + ' |'));
  md.push('', 'Разом: ' + (all.length - fails.length) + ' пройшло, ' + fails.length + ' впало.');
  fs.writeFileSync(path.join(OUT, 'summary.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
  L.killChildren();
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error(e); L.killChildren(); process.exit(2); });
