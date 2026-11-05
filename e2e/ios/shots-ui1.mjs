// UI-1: знімки листів у ландшафті (і контрольні портретні) на симуляторі: node e2e/ios/shots-ui1.mjs before|after
// Лист відкривається без клавіатури, у світлій і темній темі; розміри листа пишуться в docs/ui/sim/UI-1/<фаза>.json.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';
const PHASE = process.argv[2] || 'after';
const OUT = path.join(L.ROOT, 'docs', 'ui', 'sim', 'UI-1');
const PHONE = process.env.SIM_IPHONE || 'iPhone 16 Pro Max', PAD = process.env.SIM_IPAD || 'iPad (10th generation)';
const CONFIGS = [
  { id: 'iphone-landscape', device: PHONE, orientation: 'LANDSCAPE', sheets: ['login', 'card', 'mono', 'income'] },
  { id: 'ipad-landscape', device: PAD, orientation: 'LANDSCAPE', sheets: ['login', 'card'] },
  { id: 'iphone-portrait', device: PHONE, orientation: 'PORTRAIT', sheets: ['login', 'card'] },
  { id: 'ipad-portrait', device: PAD, orientation: 'PORTRAIT', sheets: ['login', 'card'] },
].filter(c => !process.env.SIM_ONLY || process.env.SIM_ONLY.split(',').includes(c.id));
const SHEETS = {
  login: { sel: '#profile-drawer', open: () => { showProfileLoginForm(); } },
  card: { sel: '#card-debt-drawer', open: () => { switchTab('accounting'); openCardDebtEditor(0); } },
  mono: { sel: '#mono-detail-drawer', open: () => { monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); } },
  income: { sel: '#income-drawer', open: () => { openIncomeEditor(0); } },
};
const pause = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
await L.startServers(OUT);
const rep = {};
for(const cfg of CONFIGS){
  const dev = L.pickDevice(cfg.device); L.bootSim(dev); L.ensureSimClip(dev); L.setKbMode('always');
  let d;
  try{
    d = await L.openSession(dev, cfg.orientation); await L.launchPwa(d);
    for(const theme of ['light', 'dark']){
      for(const sid of cfg.sheets){
        await L.loadApp(d);
        await L.toWeb(d);
        await d.execute(t => { setThemeChoice(t); }, theme); await pause(400);
        await d.execute(o => { new Function('return (' + o + ')')()(); }, SHEETS[sid].open.toString());
        await pause(1500);
        const m = await d.execute(s => { const e = document.querySelector(s); if(!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, top: r.top, bottom: r.bottom, height: r.height, innerW: innerWidth, innerH: innerHeight, scrollH: e.scrollHeight, clientH: e.clientHeight }; }, SHEETS[sid].sel);
        const f = await L.shot(d, path.join(OUT, PHASE + '-' + cfg.id + '-' + sid + '-' + theme));
        rep[cfg.id + '/' + sid + '/' + theme] = { m, file: path.basename(f) };
        console.log(cfg.id, sid, theme, JSON.stringify(m));
      }
    }
  }catch(e){ console.error('ПОМИЛКА', cfg.id, e.message); rep[cfg.id] = { error: e.message }; }
  finally{ try{ if(d) await d.deleteSession(); }catch(e){} }
}
fs.writeFileSync(path.join(OUT, PHASE + '.json'), JSON.stringify(rep, null, 1));
L.killChildren();
