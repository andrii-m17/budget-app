// SIM-2: npm run e2e:ios — клавіатура й форми в PWA на симуляторі iPhone та iPad (Appium + XCUITest, веб-кліп з головного екрана).
// Застосунок з локального статичного сервера на моку хмари (?fixture=typical); справжніх даних і серверів Supabase немає.
// Функціональні перевірки й інваріанти позиції — абсолютні; кадри, паузи й тривалість анімації — відносно еталона симулятора (docs/ui/sim/baseline.json).
// Оновити еталон для поточної версії: SIM_UPDATE_BASELINE=1 npm run e2e:ios. Код виходу 1, якщо хоч один сценарій не пройшов.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const VERSION = L.appVersion();
const OUT = path.join(L.ROOT, 'docs', 'ui', 'sim', VERSION);
const BASE_FILE = path.join(L.ROOT, 'docs', 'ui', 'sim', 'baseline.json');
const D = L.DESIGN, R = L.REL;
// Швидкий режим за замовчуванням: iPhone портрет, один холодний + один прогрітий прохід (1–2 хв); --target card|login — лише цей лист. Повна матриця: npm run e2e:ios:full. Еталон (3 прогріті проходи) — лише SIM_UPDATE_BASELINE=1.
const UPDATE = !!process.env.SIM_UPDATE_BASELINE;
const FULL = !!process.env.SIM_FULL;
const argv = process.argv.slice(2);
const TARGET = argv.indexOf('--target') !== -1 ? argv[argv.indexOf('--target') + 1] : null;
const REPS = Number(process.env.SIM_REPS || (UPDATE ? 4 : 2));
const GROUP = process.env.SIM_GROUP ? '-' + process.env.SIM_GROUP : '';
const PHONE = process.env.SIM_IPHONE || 'iPhone 16 Pro Max', PAD = process.env.SIM_IPAD || 'iPad (10th generation)';
const ONLY = process.env.SIM_ONLY ? process.env.SIM_ONLY.split(',') : (FULL ? null : ['iphone-portrait']);
const CONFIGS = [
  { id: 'iphone-portrait', device: PHONE, orientation: 'PORTRAIT', kbMode: 'always' },
  { id: 'iphone-landscape', device: PHONE, orientation: 'LANDSCAPE', kbMode: 'always' },
  { id: 'ipad-portrait', device: PAD, orientation: 'PORTRAIT', kbMode: 'always' },
  { id: 'ipad-landscape', device: PAD, orientation: 'LANDSCAPE', kbMode: 'always' },
  { id: 'ipad-trackpad-portrait', device: PAD, orientation: 'PORTRAIT', kbMode: 'resize' }, // «iPad із трекпадом»: гібридний режим, як його бачить симулятор без підміни
].filter(c => !ONLY || ONLY.indexOf(c.id) !== -1);
const SHEETS = [
  { id: 'card', title: 'Картка боргу', open: () => { switchTab('accounting'); openCardDebtEditor(0); }, sel: '#card-debt-drawer', backdrop: '#card-debt-backdrop', f1: '#cdd-balance', f2: '#cdd-minpay', mode: 'field', switchVia: 'arrow' }, // лист з id на iPhone: старий конвеєр (E2E 38), критерій — поле видно над клавіатурою; перемикання стрілкою «Наступне» панелі над клавіатурою
  { id: 'login', title: 'Вхід', open: () => { showProfileLoginForm(); }, sel: '#profile-drawer', backdrop: '#profile-backdrop', f1: '#cldfielda1', f2: '#cloud-password', mode: 'sheet', switchVia: 'tap' }, // новий конвеєр: критерій — низ листа 8 пт над краєм видимої області
  // Rev 2.32.248 (KB-2): решта форм із полями на єдиному конвеєрі; однопольні листи перемикання «полів» перевіряють на тому самому полі (клавіатура лишається, лист не зсувається).
  { id: 'mono', title: 'Вхідні Mono: операція', open: () => { monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); }, sel: '#mono-detail-drawer', backdrop: '#mono-detail-backdrop', f1: '#fldmono4', f2: '#fldmono4', mode: 'sheet', switchVia: 'tap' },
  { id: 'income', title: 'Дохід', open: () => { openIncomeEditor(0); }, sel: '#income-drawer', backdrop: '#income-backdrop', f1: '#ind-amount', f2: '#ind-amount', mode: 'sheet', switchVia: 'tap' },
  { id: 'installment', title: 'ОЧ', open: () => { switchTab('accounting'); openInstallmentEditor(0); }, sel: '#installment-drawer', backdrop: '#installment-backdrop', f1: '#idd-initial', f2: '#idd-term', landF2: '#idd-initial', mode: 'field', switchVia: 'tap' },
  { id: 'struct', title: 'Структура: категорія', open: () => { showCategoryModal('Нова категорія', '', null, () => {}, null); }, sel: '#struct-drawer', backdrop: '#struct-backdrop', f1: '#fldstr3', f2: '#fldstr3', mode: 'sheet', switchVia: 'tap' },
];
const pause = ms => new Promise(r => setTimeout(r, ms));
const idOf = s => String(s).replace('#', '');
const baseline = fs.existsSync(BASE_FILE) ? JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')) : null;

const animOf = (events, phase) => { const a = events.filter(e => e.type === 'sheet-anim' && e.phase === phase); return a.length ? a[a.length - 1] : null; };
const gapOf = m => m.sheetBottom == null ? null : Math.round((m.vvBottom - m.sheetBottom) * 10) / 10;
const fieldGapOf = m => m.fieldBottom == null ? null : Math.round((m.vvBottom - m.fieldBottom) * 10) / 10; // запас між низом поля й краєм видимої області (≥ 0 — поле видно)
const kbUp = m => (m.innerH - m.vvH) >= D.kbMinShrinkPt;

// Один прохід трьох кроків для листа; повертає кроки з абсолютними причинами й сирими метриками.
async function pass(d, map, cfg, sh0, rep){
  const first = rep === 0;
  // iPad: конвеєр і геометрія листа інші, інваріанти iPhone (низ листа 8 пт, kb-open, стрілка панелі) не застосовуються; лишаються функціональні перевірки й відносні до еталона
  const ipad = cfg.id.indexOf('ipad') === 0;
  const land = cfg.orientation === 'LANDSCAPE'; // ландшафт iPhone: поля поруч видно над клавіатурою, панель стрілок має інше розташування — перемикання дотиком по полю
  const sh = ipad ? Object.assign({}, sh0, { mode: 'none', switchVia: 'tap' }) : (land ? Object.assign({}, sh0, { switchVia: 'tap', f2: sh0.landF2 || sh0.f2 }) : sh0);
  await L.loadApp(d);
  await L.recorderStart(d);
  const steps = [];
  const name = s => path.join(OUT, cfg.id + '-' + sh.id + '-' + s);
  const opened = { id: 'open-focus', title: 'відкриття листа, дотик у поле, клавіатура', why: [] };
  await L.toWeb(d); await d.execute(o => { new Function('return (' + o + ')')()(); }, sh.open.toString());
  await pause(1300);
  const f = [];
  if(first) f.push(await L.shot(d, name('open-focus-before')));
  const mk1 = await L.eventMark(d);
  await L.tapSelector(d, map, sh.f1);
  await pause(1800);
  const m1 = await L.metrics(d, sh.sel, sh.f1), ev1 = await L.eventsSince(d, mk1);
  if(first) f.push(await L.shot(d, name('open-focus-after')));
  const g1 = gapOf(m1), a1 = animOf(ev1, 'open');
  if(!kbUp(m1)) opened.why.push('клавіатура не з\'явилась (видима область ' + m1.vvH + ' з ' + m1.innerH + ')');
  if(m1.active !== idOf(sh.f1)) opened.why.push('фокус у «' + m1.active + '», очікувалось «' + idOf(sh.f1) + '»');
  const fg1 = fieldGapOf(m1); opened.fieldGap = fg1;
  if(sh.mode === 'none'){ /* лише відносно еталона */ }
  else if(sh.mode === 'sheet'){ if(g1 == null || Math.abs(g1 - D.sheetGapPt) > D.sheetTolPt) opened.why.push('низ листа над краєм видимої області: ' + g1 + ' пт (інваріант ' + D.sheetGapPt + ' ± ' + D.sheetTolPt + ')'); }
  else if(fg1 == null || fg1 < 0) opened.why.push('поле «' + idOf(sh.f1) + '» під клавіатурою (' + fg1 + ' пт до краю видимої області)');
  if(!ipad && !m1.kbOpenClass) opened.why.push('клас kb-open не встановлено');
  if(!a1 && !ipad) opened.why.push('події sheet-anim (open) немає');
  Object.assign(opened, { m: m1, gap: g1, anim: a1 ? { frames: a1.frames, maxGapMs: a1.maxGapMs, durationMs: a1.durationMs } : null, events: ev1, files: f });
  steps.push(opened);

  const sw = { id: 'switch', title: 'перемикання полів', why: [] };
  const mk2 = await L.eventMark(d);
  const f2 = []; if(first) f2.push(await L.shot(d, name('switch-before')));
  if(sh.switchVia === 'arrow'){ // стрілка «Наступне» панелі над клавіатурою: її нема в DOM, шукаємо від верху нативної клавіатури
    const kt = await L.keyboardTopNative(d);
    if(kt != null) await L.tapScreen(d, map.win.width * 0.255, kt - 52); else sw.why.push('верх клавіатури в нативному дереві не знайдено');
  }else if(!(land && sh.f2 === sh.f1)) await L.tapSelector(d, map, sh.f2); // ландшафт, одне поле: повторний дотик не потрібен (поле вже у фокусі; верх листа за краєм екрана)
  await pause(1500);
  const m2 = await L.metrics(d, sh.sel, sh.f2), ev2 = await L.eventsSince(d, mk2);
  if(first) f2.push(await L.shot(d, name('switch-after')));
  const g2 = gapOf(m2), a2 = animOf(ev2, 'switch');
  if(!kbUp(m2)) sw.why.push('клавіатура зникла під час перемикання');
  if(m2.active !== idOf(sh.f2)) sw.why.push('фокус у «' + m2.active + '», очікувалось «' + idOf(sh.f2) + '»');
  const fg2 = fieldGapOf(m2); sw.fieldGap = fg2;
  if(sh.mode === 'none'){ /* лише відносно еталона */ }
  else if(sh.mode === 'sheet'){
    if(g2 == null || Math.abs(g2 - D.sheetGapPt) > D.sheetTolPt) sw.why.push('низ листа над краєм видимої області: ' + g2 + ' пт (інваріант ' + D.sheetGapPt + ' ± ' + D.sheetTolPt + ')');
    if(g1 != null && g2 != null && Math.abs(g2 - g1) > D.sheetTolPt) sw.why.push('лист зсунувся на ' + Math.round(Math.abs(g2 - g1) * 10) / 10 + ' пт між полями');
  }else if(fg2 == null || fg2 < 0) sw.why.push('поле «' + idOf(sh.f2) + '» під клавіатурою (' + fg2 + ' пт до краю видимої області)');
  if(a2 && a2.jumpMaxPx != null && a2.jumpMaxPx > D.sheetTolPt) sw.why.push('стрибок при перемиканні ' + a2.jumpMaxPx + ' пт (> ' + D.sheetTolPt + ')');
  Object.assign(sw, { m: m2, gap: g2, anim: a2 ? { frames: a2.frames, maxGapMs: a2.maxGapMs, durationMs: a2.durationMs, jumpMaxPx: a2.jumpMaxPx } : null, events: ev2, files: f2 });
  steps.push(sw);

  const cl = { id: 'close', title: 'закриття, клавіатура зникає, таб-бар на місці', why: [] };
  const mk3 = await L.eventMark(d);
  const f3 = []; if(first) f3.push(await L.shot(d, name('close-before')));
  await L.tapSelector(d, map, sh.backdrop, { x: 24, y: 70 });
  await pause(1800);
  let m3 = await L.metrics(d, sh.sel), taps = 1;
  if(m3.drawerOpen && !kbUp(m3)){ await L.tapSelector(d, map, sh.backdrop, { x: 24, y: 70 }); await pause(1500); m3 = await L.metrics(d, sh.sel); taps = 2; } // перший дотик по підкладці лише ховає клавіатуру (поведінка застосунку); другий закриває лист
  if(m3.drawerOpen && land){ for(let k = 0; k < 2 && m3.drawerOpen; k++){ await L.toWeb(d); await d.execute(q => { (document.querySelector(q + ' .drawer-close') || document.querySelector(q + ' #sf-cancel')).click(); }, sh.sel); await pause(1500); m3 = await L.metrics(d, sh.sel); } taps = 2; } // ландшафт: лист вищий за екран (кнопка × за верхнім краєм, розміри — UI-1) і займає всю ширину — закриваємо програмним кліком по ×
  const ev3 = await L.eventsSince(d, mk3);
  if(first) f3.push(await L.shot(d, name('close-after')));
  const a3 = animOf(ev3, 'close');
  if(taps > 2) cl.why.push('потрібно більше двох дотиків');
  if(kbUp(m3)) cl.why.push('клавіатура лишилась після закриття');
  if(m3.drawerOpen) cl.why.push('лист не закрився');
  if(Math.abs(m3.vvH - m3.innerH) > 2) cl.why.push('видима область не повернулась: ' + m3.vvH + ' проти ' + m3.innerH);
  if(m3.kbOpenClass) cl.why.push('клас kb-open лишився');
  if(m3.tabbarVisible === false) cl.why.push('таб-бар не видно');
  if(m3.tabbarGap != null && m3.tabbarGap < D.tabbarMinPt) cl.why.push('таб-бар від низу ' + m3.tabbarGap + ' пт (< ' + D.tabbarMinPt + ')');
  if(!a3 && !ipad) cl.why.push('події sheet-anim (close) немає');
  Object.assign(cl, { taps: taps, m: m3, anim: a3 ? { frames: a3.frames, maxGapMs: a3.maxGapMs, durationMs: a3.durationMs } : null, events: ev3, files: f3 });
  steps.push(cl);
  return steps;
}

function relativeWhy(cfgId, scnId, anim, pos){
  const b = baseline && baseline.scenarios && baseline.scenarios[cfgId + '/' + scnId];
  if(!b) return { why: [], note: baseline ? 'у еталоні сценарію немає' : 'еталона немає' };
  const why = [];
  if(pos && b.gap != null && pos.gap != null && Math.abs(pos.gap - b.gap) > R.posTolPt) why.push('низ листа ' + pos.gap + ' пт проти еталона ' + b.gap);
  if(pos && b.fieldGap != null && pos.fieldGap != null && Math.abs(pos.fieldGap - b.fieldGap) > R.posTolPt) why.push('запас поля ' + pos.fieldGap + ' пт проти еталона ' + b.fieldGap);
  if(!b.anim || !anim) return { why: why, note: '' };
  const e = b.anim;
  if(anim.frames != null && e.frames != null && anim.frames < Math.floor(e.frames * R.framesMinRatio)) why.push('кадрів ' + anim.frames + ' проти еталона ' + e.frames);
  if(anim.maxGapMs != null && e.maxGapMs != null && anim.maxGapMs > Math.max(e.maxGapMs * R.gapRatio, e.maxGapMs + R.gapAbsMs)) why.push('пауза ' + anim.maxGapMs + ' мс проти еталона ' + e.maxGapMs);
  if(anim.durationMs != null && e.durationMs != null && anim.durationMs > e.durationMs * R.durationRatio + R.durationAbsMs) why.push('тривалість ' + anim.durationMs + ' мс проти еталона ' + e.durationMs);
  return { why: why, note: '' };
}

async function main(){
  const t0 = Date.now();
  fs.mkdirSync(OUT, { recursive: true });
  await L.startServers(OUT);
  const all = [], info = [], newBase = { version: VERSION, scenarios: {} };
  for(const cfg of CONFIGS){
    const dev = L.pickDevice(cfg.device);
    L.bootSim(dev);
    let clip; try{ clip = L.ensureSimClip(dev); }catch(e){ all.push({ cfg: cfg.id, id: 'clip', title: 'PWA на ' + cfg.id, why: [String(e.message)], files: [], events: [], anim: null, m: {} }); continue; }
    info.push({ cfg: cfg.id, device: dev.name, runtime: dev.runtime, others: clip.others, kbMode: cfg.kbMode });
    L.setKbMode(cfg.kbMode);
    let d;
    try{
      d = await L.openSession(dev, cfg.orientation);
      await L.launchPwa(d);
      await L.loadApp(d);
      const map = await L.calibrate(d);
      info[info.length - 1].calibration = map.ok ? 'ok' : 'збій';
      await L.recorderStart(d); const reason = await L.kbModeReason(d); info[info.length - 1].kbReason = reason;
      if(!reason || reason.indexOf(cfg.kbMode + ':') !== 0) throw new Error('режим клавіатури ' + reason + ', очікувався ' + cfg.kbMode);
      for(const sh of SHEETS.filter(s => !TARGET || s.id === TARGET)){
        const runs = [];
        try{ for(let i = 0; i < REPS; i++) runs.push(await pass(d, map, cfg, sh, i)); }
        catch(e){ all.push({ cfg: cfg.id, id: sh.id + '-error', title: sh.title + ': збій прогону', why: ['помилка прогону: ' + String(e && e.message || e).split('\n')[0]], files: [], events: [], anim: null, m: {} }); continue; }
        ['open-focus', 'switch', 'close'].forEach((sid, k) => {
          const all3 = runs.map(r => r[k]), r0 = all3[0];
          const per = all3.length > 1 ? all3.slice(1) : all3; // прогрітий стан (друга й далі проходи); перший прохід — холодний запуск, окремим рядком
          if(sid === 'open-focus' && all3.length > 1){ const c = all3[0]; all.push({ cfg: cfg.id, id: sh.id + '-cold-open', title: sh.title + ': перше відкриття після запуску застосунку (холодна клавіатура)', why: c.why.slice(), note: '', repeats: 1, anim: c.anim, gap: c.gap, fieldGap: c.fieldGap, m: c.m, events: c.events, files: c.files.slice() }); }
          const why = []; per.forEach(p => p.why.forEach(w => { if(why.indexOf(w) === -1) why.push(w); }));
          const agg = { frames: L.median(per.map(p => p.anim && p.anim.frames)), maxGapMs: L.median(per.map(p => p.anim && p.anim.maxGapMs)), durationMs: L.median(per.map(p => p.anim && p.anim.durationMs)), jumpMaxPx: L.median(per.map(p => p.anim && p.anim.jumpMaxPx)) };
          const aggAnim = per.some(p => p.anim) ? agg : null;
          const rel = relativeWhy(cfg.id, sh.id + '-' + sid, aggAnim, { gap: L.median(per.map(p => p.gap)), fieldGap: L.median(per.map(p => p.fieldGap)) });
          rel.why.forEach(w => why.push(w));
          const scn = { cfg: cfg.id, id: sh.id + '-' + sid, title: sh.title + ': ' + r0.title, why: why, note: rel.note, repeats: REPS, anim: aggAnim, animPerRun: per.map(p => p.anim), fieldGapPerRun: per.map(p => p.fieldGap), gapPerRun: per.map(p => p.gap), whyPerRun: per.map(p => p.why), gap: L.median(per.map(p => p.gap)), fieldGap: L.median(per.map(p => p.fieldGap)), m: r0.m, events: r0.events, files: r0.files };
          all.push(scn);
          newBase.scenarios[cfg.id + '/' + scn.id] = { anim: aggAnim, gap: scn.gap, fieldGap: scn.fieldGap };
        });
      }
    }catch(e){
      all.push({ cfg: cfg.id, id: 'session', title: 'сесія ' + cfg.id, why: ['сесію не відкрито: ' + String(e && e.message || e).split('\n')[0]], files: [], events: [], anim: null, m: {} });
    }finally{ try{ if(d) await d.deleteSession(); }catch(e){} }
  }
  all.forEach(r => {
    let size = 0; (r.files || []).forEach(f => { try{ size += fs.statSync(f).size; }catch(e){} });
    if(size > 300 * 1024){ (r.files || []).forEach(f => { try{ fs.unlinkSync(f); }catch(e){} }); r.filesDropped = 'знімки > 300 КБ, лише JSON'; r.files = []; }
    r.files = (r.files || []).map(f => path.basename(f));
    r.verdict = r.why.length ? 'впав' : 'пройшов';
    fs.writeFileSync(path.join(OUT, r.cfg + '-' + r.id + '.json'), JSON.stringify(r, null, 1));
  });
  if(UPDATE){ if(baseline && baseline.scenarios) Object.keys(baseline.scenarios).forEach(k => { if(!newBase.scenarios[k] && !CONFIGS.some(c => k.indexOf(c.id + '/') === 0)) newBase.scenarios[k] = baseline.scenarios[k]; }); newBase.runtime = info.map(i => i.cfg + ': ' + i.device + ' ' + i.runtime).join('; '); newBase.reps = REPS; newBase.note = 'Еталон симулятора (медіана за ' + REPS + ' проходи) для версії ' + VERSION + '. Оновлюється SIM_UPDATE_BASELINE=1.'; fs.writeFileSync(BASE_FILE, JSON.stringify(newBase, null, 1)); }
  const dur = Math.round((Date.now() - t0) / 1000), fails = all.filter(r => r.why.length);
  const md = ['# SIM-2 · ' + VERSION + ' · PWA на симуляторі iOS', '',
    'Прогін: ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ', ' + dur + ' с, проходів на сценарій: ' + REPS + '. ' + info.map(i => i.cfg + ' = ' + i.device + ' (' + i.runtime + '; режим клавіатури ' + (i.kbReason || '—') + '; калібрування ' + (i.calibration || '—') + '; на симуляторі ще PWA з іншими адресами: ' + i.others + ', їх не запускали)').join('; ') + '.',
    'Еталон: ' + (UPDATE ? 'ЩОЙНО оновлено для ' + VERSION : (baseline ? 'версія ' + baseline.version + (baseline.version !== VERSION ? ' (відстає від ' + VERSION + ': оновіть SIM_UPDATE_BASELINE=1 після перевірки)' : '') : 'немає (перший прогін: SIM_UPDATE_BASELINE=1)')) + '.',
    'Абсолютно: клавіатура з\'явилась/зникла, фокус, `kb-open`, таб-бар ≥ ' + D.tabbarMinPt + ' пт, низ листа ' + D.sheetGapPt + ' ± ' + D.sheetTolPt + ' пт над краєм видимої області. Відносно еталона: кадри ≥ ' + R.framesMinRatio * 100 + '%, пауза ≤ ×' + R.gapRatio + ' (мін. +' + R.gapAbsMs + ' мс), тривалість ≤ ×' + R.durationRatio + ' (+' + R.durationAbsMs + ' мс).', '',
    '| Конфігурація | Сценарій | Результат | Причина |', '|---|---|---|---|'];
  all.forEach(r => md.push('| ' + r.cfg + ' | ' + r.title + ' | ' + r.verdict + ' | ' + (r.why.join('; ') || r.note || '—') + ' |'));
  md.push('', 'Разом: ' + (all.length - fails.length) + ' пройшло, ' + fails.length + ' впало.');
  fs.writeFileSync(path.join(OUT, 'summary' + GROUP + '.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
  L.killChildren();
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error(e); L.killChildren(); process.exit(2); });
