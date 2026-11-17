// DS-2: порівняння двох тек, зібраних e2e/ds-compare.spec.js (стилі елементів і знімки). Використання: node scripts/ds-compare.js <до> <після>
'use strict';
const fs = require('fs'), path = require('path');
const [A, B] = process.argv.slice(2);
if(!A || !B){ console.error('node scripts/ds-compare.js <тека-до> <тека-після>'); process.exit(2); }
let PNG; try{ PNG = require(path.join(process.cwd(), 'node_modules/playwright-core/lib/utilsBundle')).PNG; }catch(e){ PNG = null; }
let bad = 0, styles = 0, shots = 0, elems = 0;
for(const f of fs.readdirSync(A).sort()){
  if(/^styles-.*\.json$/.test(f)){
    const a = JSON.parse(fs.readFileSync(path.join(A, f), 'utf8')), bf = path.join(B, f);
    if(!fs.existsSync(bf)){ console.log('НЕМАЄ', f); bad++; continue; }
    const b = JSON.parse(fs.readFileSync(bf, 'utf8')); styles++;
    // <script> без впливу на вигляд (STRUCT-2 додає теги підключення): виключаємо з порівняння, щоб індекси елементів не зсувалися
    const noScript = (x) => x.data.filter(r => !/^SCRIPT/.test(String(r[1])));
    a.data = noScript(a); b.data = noScript(b);
    if(a.data.length !== b.data.length){ console.log(f, 'різна кількість елементів', a.data.length, b.data.length); bad++; continue; }
    let d = 0;
    for(let i = 0; i < a.data.length; i++){ elems++; for(let k = 1; k < a.data[i].length; k++){ if(a.data[i][k] !== b.data[i][k]){ d++; if(d <= 5) console.log(f, 'елемент', a.data[i][1], a.props[k - 2] || 'ім\'я', JSON.stringify(a.data[i][k]), '→', JSON.stringify(b.data[i][k])); } } }
    if(d){ bad++; console.log(f, 'відмінностей', d); }
  }else if(/\.png$/.test(f) && PNG){
    const bf = path.join(B, f); if(!fs.existsSync(bf)){ console.log('НЕМАЄ', f); bad++; continue; }
    const x = PNG.sync.read(fs.readFileSync(path.join(A, f))), y = PNG.sync.read(fs.readFileSync(bf)); shots++;
    if(x.width !== y.width || x.height !== y.height){ console.log(f, 'різний розмір'); bad++; continue; }
    let n = 0; for(let i = 0; i < x.data.length; i += 4){ if(x.data[i] !== y.data[i] || x.data[i+1] !== y.data[i+1] || x.data[i+2] !== y.data[i+2]) n++; }
    if(n){ bad++; console.log(f, 'пікселів відрізняється', n); }
  }
}
console.log('стани:', styles, 'елементів (з повторами):', elems, 'знімків:', shots, 'з різницею:', bad);
process.exit(bad ? 1 : 0);
