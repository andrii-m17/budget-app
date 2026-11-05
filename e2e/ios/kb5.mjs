// KB-5 (Rev 2.32.258): npm run e2e:ios:bg — згортання застосунку з відкритою клавіатурою (iPhone, симулятор).
// Сценарій: форма з полем у фокусі + клавіатура → «Додому» → повернення в застосунок → поле НЕ лишається у фокусі,
// дотик у те саме поле одразу піднімає клавіатуру. Другий сценарій — поле «Примітка» у «Вхідних»: скільки разів міняється
// фокус/виділення під час набору (діагностика курсора, KB-5b). Код виходу 1, якщо хоч одна перевірка не пройшла.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const OUT = path.join(L.ROOT, 'docs', 'ui', 'sim', L.appVersion());
const PHONE = process.env.SIM_IPHONE || 'iPhone 16 Pro Max';
const pause = ms => new Promise(r => setTimeout(r, ms));
const res = [];
const check = (name, ok, note) => { res.push({ name, ok: !!ok, note: note || '' }); console.log((ok ? '  ✔ ' : '  ✖ ') + name + (note ? ' — ' + note : '')); };

async function goHomeAndBack(d){
  await L.toNative(d);
  await d.execute('mobile: pressButton', { name: 'home' });
  await d.pause(2500);
  let ic = null;
  for(let i = 0; i < 8 && !ic; i++){
    for(const e of await d.$$('-ios predicate string:name == "' + L.CLIP_TITLE + '" AND type == "XCUIElementTypeIcon"')){ if(await e.isDisplayed()){ ic = e; break; } }
    if(!ic){ await d.execute('mobile: swipe', { direction: i < 5 ? 'left' : 'right' }); await d.pause(700); }
  }
  if(!ic) throw new Error('іконки застосунку не видно');
  await ic.click(); await d.pause(2500);
  await L.toWeb(d);
}

async function main(){
  fs.mkdirSync(OUT, { recursive: true });
  await L.startServers(OUT);
  const dev = L.pickDevice(PHONE);
  L.bootSim(dev); L.ensureSimClip(dev); L.setKbMode('always');
  let d;
  try{
    d = await L.openSession(dev, 'PORTRAIT');
    await L.launchPwa(d); await L.loadApp(d);
    const map = await L.calibrate(d);
    await L.recorderStart(d);

    // 1. Згортання з відкритою клавіатурою у формі (лист «Картка боргу»)
    await L.toWeb(d);
    await d.execute(() => { switchTab('accounting'); openCardDebtEditor(0); });
    await d.pause(1200);
    await L.tapSelector(d, map, '#cdd-balance'); await d.pause(1800);
    check('до згортання: поле у фокусі й клавіатура є', (await L.metrics(d, '#card-debt-drawer', '#cdd-balance')).active === 'cdd-balance' && (await L.keyboardTopNative(d)) != null);
    await goHomeAndBack(d);
    const after = await L.metrics(d, '#card-debt-drawer', '#cdd-balance');
    check('після повернення: фокус знято з поля, kb-open знято', after.active !== 'cdd-balance' && !after.kbOpenClass, 'active=' + after.active + ', kb-open=' + after.kbOpenClass);
    await L.tapSelector(d, map, '#cdd-balance'); await d.pause(1800);
    const kb2 = await L.keyboardTopNative(d);
    check('дотик у те саме поле одразу відкриває клавіатуру', kb2 != null && (await L.metrics(d, '#card-debt-drawer', '#cdd-balance')).active === 'cdd-balance', 'kbTop=' + kb2);

    // 2. «Вхідні»: набір у полі «Примітка» — фокус і виділення не мають смикатися (діагностика KB-5b)
    await L.toWeb(d);
    await d.execute(() => { document.activeElement && document.activeElement.blur(); document.querySelectorAll('.drawer.open .drawer-close').forEach(b => b.click()); });
    await d.pause(900);
    await d.execute(async () => { await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); });
    await d.pause(1200);
    await d.execute(() => { const c0 = (DICTIONARY.find(e => e && e.cat && !e.deletedAt && getCategoryType(e.cat) !== null) || {}).cat; DICTIONARY.push({ kw: 'kava', cat: c0, sub: '' }); window.__kw = 'kava'; window.__kbp = { focusin: 0, focusout: 0, sel: 0, input: 0, rects: [] }; const dr = document.getElementById('mono-detail-drawer'); const snap = (tag) => { const fr = f.getBoundingClientRect(), r = dr.getBoundingClientRect(); window.__kbp.rects.push([tag, Math.round(performance.now()), Math.round(fr.top * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.height * 10) / 10, dr.scrollTop, Math.round(visualViewport.height), Math.round(visualViewport.offsetTop)]); };window.__snap = snap; var f = document.getElementById('fldmono4'); f.addEventListener('focusin', () => window.__kbp.focusin++); f.addEventListener('focusout', () => window.__kbp.focusout++); document.addEventListener('selectionchange', () => { if(document.activeElement === f) window.__kbp.sel++; }); f.addEventListener('input', () => window.__kbp.input++); });
    const mk = await L.eventMark(d);
    await L.tapSelector(d, map, '#fldmono4'); await d.pause(1800);
    const evs = await d.execute((m) => debugEventBuffer.slice(m).map(e => e.type + (e.ms != null ? ':' + e.ms : '') + (e.mode ? ':' + e.mode : '')), mk);
    console.log('  події після дотику: ' + evs.join(', '));
    await L.toNative(d);
    await d.pause(1500);
    const kw = await (async () => { await L.toWeb(d); const k = await d.execute(() => window.__kw); await L.toNative(d); return k; })();
    const mk2 = await (async () => { await L.toWeb(d); const m = await d.execute(() => debugEventBuffer.length); await L.toNative(d); return m; })();
    try{ await d.execute('mobile: keys', { keys: Array.from(kw) }); await L.toWeb(d); await d.execute(() => window.__snap('after-typing')); for(let i = 0; i < 8; i++){ await d.pause(100); await d.execute(() => window.__snap('t')); } await L.toNative(d); }catch(e){ console.log('  (mobile: keys недоступний: ' + String(e.message).split('\n')[0] + ')'); }
    await d.pause(1500);
    await L.toWeb(d);
    const probe = await d.execute(() => ({ p: window.__kbp, v: document.getElementById('fldmono4').value, active: document.activeElement && document.activeElement.id }));
    const tops = probe.p.rects.map(r => r[3]); const jitter = Math.round((Math.max.apply(null, tops) - Math.min.apply(null, tops)) * 10) / 10;
    await L.toWeb(d); const vvEv = await d.execute((m) => debugEventBuffer.slice(m).filter(e => e.type === 'vv-resize').map(e => e.vvH), mk2);
    console.log('  ЗНАХІДКА KB-5b (інформативно, не перевірка): під час набору в «Примітці» лист зсувався на ' + jitter + ' пт; visualViewport.height стрибав: ' + vvEv.join('→') + ' (506 = клавіатура, 826 = на весь екран)');
    check('«Вхідні»: поле лишається у фокусі під час набору, без зайвих focusout', probe.active === 'fldmono4' && probe.p.focusout === 0, JSON.stringify(probe.p));
  }catch(e){
    check('сесія/сценарій', false, String(e && e.message || e).split('\n')[0]);
  }finally{ try{ if(d) await d.deleteSession(); }catch(e){} }
  const fails = res.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'kb5-background.json'), JSON.stringify(res, null, 1));
  console.log('\nKB-5: ' + (res.length - fails.length) + ' пройшло, ' + fails.length + ' впало.');
  L.killChildren();
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error(e); L.killChildren(); process.exit(2); });
