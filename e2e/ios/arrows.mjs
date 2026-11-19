// FIX-1119 п.11: чи є стрілки «вгору/вниз» (панель «Попереднє/Наступне/Готово») над клавіатурою на полях входу. Реальні дотики на симуляторі; знімки пишуться в SIM_OUT.
// Для порівняння ревізій: скрипт і lib.mjs копіюються в git worktree потрібної ревізії; мок хмари, жодної робочої бази.
import fs from 'node:fs';
import * as L from './lib.mjs';
const pause = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.SIM_OUT || '/tmp/sim-arrows';
fs.mkdirSync(OUT, { recursive: true });
async function main(){
  const dev = L.pickDevice(process.env.SIM_IPHONE || 'iPhone 16 Pro Max');
  L.bootSim(dev); L.ensureSimClip(dev);
  await L.startServers('/tmp/sim-arrows-logs');
  const d = await L.openSession(dev, 'PORTRAIT');
  const out = { version: L.appVersion(), shots: [] };
  try{
    await L.launchPwa(d); await L.loadApp(d);
    const map = await L.calibrate(d);
    await L.toWeb(d);
    await d.execute(() => { showProfileLoginForm(); });
    await pause(1500);
    for(const sel of ['#cldfielda1', '#cloud-password']){
      await L.toWeb(d);
      await L.tapSelector(d, map, sel);
      await pause(1800);
      const f = await L.shot(d, OUT + '/' + out.version + '-' + sel.replace('#', ''));
      out.shots.push(f);
      const info = await d.execute(() => ({ form: !!document.getElementById('cloud-login-form-el'), active: document.activeElement && document.activeElement.id }));
      out.shots.push(info);
    }
    console.log(JSON.stringify(out));
  } finally { try{ await d.deleteSession(); }catch(e){} L.killChildren(); }
}
main().catch(e => { console.error(e); L.killChildren(); process.exit(1); });
