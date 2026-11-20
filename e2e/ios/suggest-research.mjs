// BUG-SUGGEST (дослідження, Rev 2.32.427+): чи доходить touchstart по підказці до сторінки після сценарію «вибір → дотик у поле → (подвійний дотик) → стирання → нове слово → дотик по підказці».
// Справжні дотики й клавіші на симуляторі (Appium + XCUITest, мок хмари). Код застосунку не змінюється: варіанти (а, б, в) вмикаються ін'єкцією в сторінку.
// Запуск: SIM_VARIANT=base|noselect|a|b|c node e2e/ios/suggest-research.mjs --trials 10   (SIM_OUT — тека знімків, за замовчуванням /tmp/bs)
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';
const argv = process.argv.slice(2);
const TRIALS = Number(argv.indexOf('--trials') !== -1 ? argv[argv.indexOf('--trials') + 1] : 10);
const VARIANT = process.env.SIM_VARIANT || 'base';
const OUT = path.join(process.env.SIM_OUT || '/tmp/bs', VARIANT);
fs.mkdirSync(OUT, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));
const UA = process.env.SIM_LANG === 'uk';
const W1 = UA ? 'студент' : 'qwertyu', W2 = UA ? 'програміст' : 'asdfghjklz'; // 7 і 10 літер
const SETTLE = UA ? 500 : 900; // пауза між набором і дотиком: автовиправлення й прогнози встигають з'явитися

// Для SIM_LANG=uk: предикат XCUITest з кирилицею ненадійний, тож клавіші шукаємо за іменами з дерева (name → елемент); розкладку перемикаємо кнопкою «Наступна клавіатура» доти, доки не з'явиться «ї»
async function keyMap(d){
  const els = await d.$$('-ios predicate string:type == "XCUIElementTypeKey"');
  const m = {}; for(const e of els){ const n = await e.getAttribute('name'); if(n) m[n.normalize('NFC').toLowerCase()] = e; }
  return m;
}
async function ensureLayout(d){
  if(!UA) return;
  for(let i = 0; i < 4; i++){
    const km0 = await keyMap(d); if(process.env.SIM_DEBUG) console.log('LAYOUT', i, Object.keys(km0).join('')); if(km0['ї'.normalize('NFC')]) return; // імена клавіш у нижньому регістрі (великі після автокапіталізації — той самий елемент)
    const g = await d.$('-ios predicate string:name CONTAINS[c] "Next keyboard" OR name CONTAINS[c] "Наступна клавіатура"');
    if(!(await g.isExisting())) throw new Error('Немає ні української розкладки, ні кнопки перемикання клавіатури');
    await g.click(); await pause(900);
  }
  throw new Error('Не вдалось увімкнути українську розкладку');
}
async function typeKeys(d, word){
  await L.toNative(d);
  await ensureLayout(d);
  const km = UA ? await keyMap(d) : null;
  for(const ch of word){
    const key = UA ? km[ch.normalize('NFC').toLowerCase()] : await d.$('-ios predicate string:name ==[c] "' + ch + '" AND type == "XCUIElementTypeKey"');
    if(!key) throw new Error('Немає клавіші ' + ch);
    await key.click(); await pause(180);
  }
  await L.toWeb(d);
}
async function backspaceAll(d){
  for(let i = 0; i < 40; i++){
    const n = await d.execute(() => document.getElementById('expfielda7').value.length);
    if(!n) return;
    await L.toNative(d);
    const key = await d.$('-ios predicate string:name == "delete" AND type == "XCUIElementTypeKey"'); await key.click(); await pause(120);
    await L.toWeb(d);
  }
}
// Які нативні елементи накривають точку (крім Application/Window): для невдалих дотиків
async function coveringAt(d, x, y){
  await L.toNative(d);
  try{
    const src = await d.getPageSource();
    const out = [];
    const re = /<(XCUIElementType\w+)([^>]*?)\/?>/g; let m;
    while((m = re.exec(src))){
      const a = m[2]; const g = n => { const r = new RegExp(n + '="([^"]*)"').exec(a); return r ? r[1] : null; };
      const X = Number(g('x')), Y = Number(g('y')), Wd = Number(g('width')), H = Number(g('height'));
      if(!(Wd > 0 && H > 0)) continue;
      if(x >= X && x <= X + Wd && y >= Y && y <= Y + H && !/Application|Window|Other$/.test(m[1])) out.push(m[1].replace('XCUIElementType', '') + ':' + (g('name') || g('label') || '') + ' [' + X + ',' + Y + ' ' + Wd + 'x' + H + ']');
    }
    return out.slice(0, 8);
  }catch(e){ return ['ERR ' + e.message]; }finally{ await L.toWeb(d); }
}
const cnt = d => d.execute(() => window.__ts.length);

async function main(){
  const dev = L.pickDevice(process.env.SIM_IPHONE || 'iPhone 16 Pro Max');
  L.bootSim(dev); L.ensureSimClip(dev);
  await L.startServers('/tmp/sim-suggest');
  const d = await L.openSession(dev, 'PORTRAIT');
  const res = { lang: UA ? 'uk' : 'en', variant: VARIANT, device: dev.name + ' ' + dev.runtime, trials: [] };
  try{
    try{ await L.launchPwa(d); }catch(e){ await pause(2000); await L.launchPwa(d); }
    await L.loadApp(d);
    const map = await L.calibrate(d);
    await L.toWeb(d);
    await d.execute(() => { switchTab('vytraty'); });
    await pause(800);
    await d.execute(w => { nameHistoryMap[w[0] + ' one'] = { count: 3, lastDate: localDateISO() }; nameHistoryMap[w[1] + ' two'] = { count: 3, lastDate: localDateISO() };
      window.__ts = []; document.addEventListener('touchstart', e => { const t = e.target; window.__ts.push({ at: Math.round(performance.now()), inList: !!(t && t.closest && t.closest('#name-suggest-list')), id: t && (t.id || t.className || t.tagName) }); }, { capture: true, passive: true }); }, [W1, W2]);
    if(VARIANT === 'a') await d.execute(() => document.getElementById('expfielda7').setAttribute('autocorrect', 'off'));
    if(VARIANT === 'b') await d.execute(() => { const f = document.getElementById('expfielda7'); f.addEventListener('input', () => { if(f.selectionStart !== f.selectionEnd){ const n = f.value.length; f.setSelectionRange(n, n); } }); });
    if(VARIANT === 'c') await d.execute(() => { const s = document.createElement('style'); s.textContent = '#name-suggest-list{margin-top:' + (process.env.SIM_GAP || 24) + 'px}'; document.head.appendChild(s); });
    for(let k = 0; k < TRIALS; k++){
      const tr = { k: k, pick1: null, attempts: [], ok2: false };
      await L.toWeb(d);
      await d.execute(() => { const f = document.getElementById('expfielda7'); f.blur(); f.value = ''; try{ hideNameSuggestions(); }catch(e){} suggestSuppressed = false; });
      await pause(700);
      await L.tapSelector(d, map, '#expfielda7'); await pause(1200);
      await typeKeys(d, W1); await pause(SETTLE);
      // вибір 1
      const c0 = await cnt(d);
      await L.shot(d, path.join(OUT, 't' + k + '-1-before-pick1'));
      await L.tapSelector(d, map, '#name-suggest-list.show .name-suggest-item'); await pause(900);
      tr.pick1 = { reached: (await cnt(d)) > c0, len: await d.execute(() => document.getElementById('expfielda7').value.length) };
      // крок 2: дотик у поле; подвійний дотик (base, a, b, c); стирання
      await L.tapSelector(d, map, '#expfielda7'); await pause(900);
      if(VARIANT !== 'noselect'){
        const r = await d.execute(() => { const b = document.getElementById('expfielda7').getBoundingClientRect(); return { x: b.left + b.width * 0.3, y: b.top + b.height / 2 }; });
        await L.toNative(d);
        if(UA){ const x = Math.round(map.ox + r.x * map.kx), y = Math.round(map.oy + r.y * map.ky); // два дотики, початки з інтервалом 180 мс
          await d.performActions([{ type: 'pointer', id: 'f1', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', duration: 0, x, y }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 40 }, { type: 'pointerUp', button: 0 }, { type: 'pause', duration: 140 }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 40 }, { type: 'pointerUp', button: 0 }] }]); await d.releaseActions();
        }else await d.execute('mobile: doubleTap', { x: Math.round(map.ox + r.x * map.kx), y: Math.round(map.oy + r.y * map.ky) });
        await pause(700); await L.toWeb(d);
      }
      await L.shot(d, path.join(OUT, 't' + k + '-2-after-select'));
      await backspaceAll(d); await pause(500);
      await typeKeys(d, W2); await pause(UA ? 500 : 1000);
      tr.typed2 = await d.execute(() => ({ len: document.getElementById('expfielda7').value.length, list: !!document.querySelector('#name-suggest-list.show .name-suggest-item') }));
      // вибір 2: до 3 спроб із паузою 1 с
      for(let a = 1; a <= 3 && !tr.ok2; a++){
        const has = await d.execute(() => !!document.querySelector('#name-suggest-list.show .name-suggest-item'));
        if(!has){ tr.attempts.push({ a: a, noList: true }); break; }
        const pos = await d.execute(() => { const r = document.querySelector('#name-suggest-list.show .name-suggest-item').getBoundingClientRect(), f = document.getElementById('expfielda7').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, fieldBottom: Math.round(f.bottom), rowTop: Math.round(r.top) }; });
        const shotFile = await L.shot(d, path.join(OUT, 't' + k + '-3-before-pick2-a' + a));
        const before = await cnt(d);
        await L.tapSelector(d, map, '#name-suggest-list.show .name-suggest-item'); await pause(900);
        const reached = (await cnt(d)) > before;
        const st = await d.execute(() => ({ len: document.getElementById('expfielda7').value.length, shown: !!document.querySelector('#name-suggest-list.show'), active: document.activeElement && document.activeElement.id }));
        const at = { a: a, reached: reached, fieldBottom: pos.fieldBottom, rowTop: pos.rowTop, len: st.len, active: st.active, shown: st.shown };
        if(!reached) at.covering = await coveringAt(d, Math.round(map.ox + pos.x * map.kx), Math.round(map.oy + pos.y * map.ky));
        tr.attempts.push(at);
        if(st.len > tr.typed2.len || !st.shown) tr.ok2 = true;
        if(!tr.ok2) await pause(1000);
      }
      res.trials.push(tr);
      console.log('TRIAL ' + JSON.stringify(tr));
    }
    res.events = await d.execute(() => (typeof recBuf !== 'undefined' ? recBuf : []).filter(e => e.type === 'suggest-tap' && /^(set|post)$/.test(e.ev)).map(e => [e.ev, e.same, e.lenBefore, e.lenAfter, e.lenPost, e.composing]).slice(-20));
  }finally{
    try{ await d.deleteSession(); }catch(e){}
    L.killChildren();
  }
  const first = res.trials.map(t => t.attempts[0] ? !!t.attempts[0].reached : null);
  console.log('RESULT ' + JSON.stringify({ variant: VARIANT, device: res.device, n: res.trials.length, firstTapReached: first.filter(x => x).length, firstTapMissed: first.filter(x => x === false).length, anyAttemptMissed: res.trials.filter(t => t.attempts.some(a => a.reached === false)).length, notPickedAfter3: res.trials.filter(t => !t.ok2).length }));
}
main().catch(e => { console.error(e); L.killChildren(); process.exit(2); });
