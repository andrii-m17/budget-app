// Перевірка картки «Найближчі платежі» (CARD-1, Rev 2.32.84): на кожній ширині/темі/стані жоден елемент не виходить за межі (scrollWidth > clientWidth) і жоден рядок не переноситься.
// Запуск: preview на http://localhost:8934 (npx http-server -p 8934 -c-1), потім `node scripts/card-fit-check.mjs [ширини через кому]`. Потрібен Google Chrome (headless, CDP), Node ≥ 22. Дані синтетичні, у робочу базу не пише (мок).
import { spawn } from 'node:child_process';
const WIDTHS = (process.argv[2] || '290,320,360,375,390,430,440,820,1280').split(',').map(Number);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9335', '--user-data-dir=' + (process.env.TMPDIR || '/tmp') + '/chrome-card-fit', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for(let i = 0; i < 50; i++){ try{ const tabs = await (await fetch('http://127.0.0.1:9335/json')).json(); ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; }); break; }catch(e){ await sleep(200); } }
let id = 0; const pend = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if(d.id && pend.has(d.id)){ pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const STATES = `(()=>{const today=kyivTodayISO();const it=(d,name,amount,est)=>({date:d,name,amount,estimated:!!est,month:d.slice(0,7)});const E={unconfirmed:[],undatedCards:{count:0,total:0},noDay:[]};
window.__S={week:{items:[it(ppAddDays(today,2),'Розстрочка А',3200,true),it(ppAddDays(today,4),'Розстрочка Б',9800,true)],later:[],unconfirmed:[it(ppAddDays(today,-20),'Картка Б',5)],undatedCards:{count:2,total:600},noDay:[],load:{count:2,total:13000,estimated:true,unknown:0}},
weekmany:{items:[it(ppAddDays(today,2),'Розстрочка А',3200,true)],later:[],unconfirmed:[it(ppAddDays(today,-20),'Картка Б',5),it(ppAddDays(today,-9),'Картка В',5),it(ppAddDays(today,-3),'Розстрочка Г',5)],undatedCards:{count:2,total:600},noDay:[1],load:{count:1,total:3200,estimated:true,unknown:0}},
long:{items:[it(ppAddDays(today,2),'Розстрочка на дуже довгу назву товару з додатковою назвою і ще трохи тексту',3200,true)],later:[],unconfirmed:[it(ppAddDays(today,-20),'Дуже довга назва платежу без позначки яка не влізе в один рядок на вузькому екрані',5)],undatedCards:{count:12,total:1234567},noDay:[1,2],load:{count:1,total:1234567,estimated:true,unknown:0}},
big:{items:[it(ppAddDays(today,2),'Розстрочка А',1234567,true),it(ppAddDays(today,4),'Розстрочка Б',9800000,true)],later:[],unconfirmed:[],undatedCards:{count:2,total:1234567},noDay:[],load:{count:2,total:11034567,estimated:true,unknown:0}},
empty:{items:[],later:[it(ppAddDays(today,9),'Розстрочка А',5000,true)],...E,load:{count:0,total:0,estimated:false,unknown:0}},
allpaid:{items:[],later:[it(ppAddDays(today,30),'Розстрочка А',5000,true)],...E,load:{count:0,total:0,estimated:false,unknown:0}},
allpaidlong:{items:[],later:[it(ppAddDays(today,30),'Дуже довга назва платежу яка не влізе в один рядок на вузькому екрані',5000,true)],...E,load:{count:0,total:0,estimated:false,unknown:0}}};return 1})()`;
let bad = 0, total = 0;
for(const w of WIDTHS) for(const theme of ['dark', 'light']){
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://localhost:8934/?fixture=typical' }); await sleep(4500);
  await ev(`document.documentElement.setAttribute('data-theme','${theme}')`); await ev(STATES);
  for(const st of ['week', 'weekmany', 'long', 'big', 'empty', 'allpaid', 'allpaidlong']){
    await ev(`window.computeUpcomingNow=function(){return window.__S['${st}']}; renderPaymentsCard(); 1`); await sleep(150);
    const r = JSON.parse(await ev(`(()=>{const e=document.getElementById('payments-card');const over=[...e.querySelectorAll('.pay-line1 .l,.pay-msg .l,.pay-done span.m,.pay-head-left,.pay-sum')].filter(x=>x.className==='pay-sum'?x.getBoundingClientRect().width>x.parentElement.clientWidth+0.5:x.scrollWidth>x.clientWidth+0.5).map(x=>x.className);const wrap=[...e.querySelectorAll('.pay-line1 .l,.pay-msg .l,.pay-done span.m,.pay-title,.pay-done b')].filter(x=>x.getBoundingClientRect().height>24).length;return JSON.stringify({over,wrap,h:Math.round(e.getBoundingClientRect().height)})})()`));
    total++; if(r.over.length || r.wrap){ bad++; console.log('ПРОБЛЕМА', w, theme, st, JSON.stringify(r)); }
  }
}
console.log('перевірено', total, 'проблем', bad);
ws.close(); chrome.kill(); process.exit(bad ? 1 : 0);
