// Rev 2.32.400 (PRIV-2a): охорона від повернення справжніх імен у репозиторій. Тест обходить усі текстові файли (без .git, node_modules, e2e-results, знімків і docs/ui/sim — їх прибере PRIV-2d),
// розбиває на слова й порівнює SHA-256 слова (точний збіг) або його початку (префікс, щоб ловити відмінки й транслітерацію). Самих імен у репозиторії немає: лише хеші.
// Винятки лише за позначками в рядку: PRIV-2b-REMOVE (INCOME_SOURCES і Excel-мапінг; прибере PRIV-2b) та PRIV-2-HANDLE (робоча адреса застосунку в index.html і send-push-notification; рішення власника 18.11).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const EXACT = new Set([
  '7e39d130ab78ea75c6ab95ef03980814053704a0dc5604e38744156efd60f344',
  '7d0a6306343e37e4037602271c95483257122b3a1083bf6ccd451afe480f291b',
  '1ae9d5031fd18a1f1b870bc1375d78c11030f81b00496757694995fb0582272b',
  '2919dd5638f6d579d33d90a145d31ad955fce4abec09c978700f60ecb00c0c29',
  'de328420331c4874abe6d0ee22fd33a0cbbce32e54c0750eb23fa79699ac0d0b',
  '8d926789e95397cd2a4b3e712991f6321bc2abbe4a97790e301b6072be8dbdc7',
  'd57329cf35760377655bf8417b666cd1b4028878276d8684b9f571746e908996',
  'c180881dbfb98b9d0ddb8893fb368f0f6832764ff3efc0cda28fb50c62938b81',
  '4e3a961fc54475156c6c78debb0a86cfc25ea240074917601f1dd9f131e6430c'
]);
const PREFIX = [
  [5, '5554d3dadc3d155d5e40d08f6f911dc81dccafbddfeedadbeea18655bc5605fc'],
  [5, '8f9d241533ceb0bcb8493733079a4d1140172ac651678960ce777f7ec6261f37'],
  [4, '957d076a807b93636b48dc14925d8ef48768fff263a8acf3cdc473bc3fa88aee'],
  [4, '3fa987493ca3ccfcb95243b881a02b7d2e660bd58f5763086ab1d731e473421b'],
  [7, '0a2a43ae9e70748dd2a62929e713be045c81a906a8da6f943d57dcb9e8b478c4'],
  [6, 'd3b46337bbde24562b5219f54ea9c791d5022378bd1d5cfa778d336451632a17']
];
const MARKERS = ['PRIV-2b-REMOVE', 'PRIV-2-HANDLE'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'e2e-results', 'worktrees', 'test-results']);
const SKIP_PATHS = ['docs/ui/sim/']; // PRIV-2d: знімки й журнали симулятора з іменами — окрема ревізія
const BIN = /\.(png|jpe?g|gif|webp|ico|icns|pdf|woff2?|ttf|zip|xlsx|mp4|mov)$/i;
const ROOT = path.join(__dirname, '..');
function hit(word){
  if(EXACT.has(sha(word))) return true;
  return PREFIX.some(([n, h]) => word.length >= n && sha(word.slice(0, n)) === h);
}
function scanText(text, allowMarkers){
  const found = [];
  text.split('\n').forEach((line, i) => {
    if(allowMarkers && MARKERS.some(m => line.includes(m))) return;
    line.toLowerCase().split(/[^\p{L}]+/u).forEach(w => { if(w && hit(w)) found.push(i + 1); });
  });
  return found;
}
function walk(dir, out){
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    if(SKIP_DIRS.has(e.name)) return;
    const p = path.join(dir, e.name), rel = path.relative(ROOT, p).split(path.sep).join('/');
    if(e.isDirectory()){ if(!SKIP_PATHS.some(s => (rel + '/').startsWith(s))) walk(p, out); return; }
    if(BIN.test(e.name) || SKIP_PATHS.some(s => rel.startsWith(s))) return;
    out.push([p, rel]);
  });
  return out;
}
test('PRIV-2a: у текстових файлах репозиторію немає справжніх імен (лише хеші в тесті; винятки за позначками PRIV-2b-REMOVE / PRIV-2-HANDLE)', function(){
  const bad = [];
  walk(ROOT, []).forEach(([p, rel]) => {
    let t; try{ t = fs.readFileSync(p, 'utf8'); }catch(e){ return; }
    if(t.indexOf('\u0000') >= 0) return;
    const lines = scanText(t, true);
    if(lines.length) bad.push(rel + ': рядки ' + [...new Set(lines)].slice(0, 8).join(', '));
  });
  assert.deepEqual(bad, [], 'знайдено заборонені слова (замініть на «учасник 1/2», «власник», нейтральну заглушку):\n' + bad.join('\n'));
});
test('PRIV-2a: охоронець ловить навмисно додане ім\'я (відмінки й транслітерація), але не чіпає звичайні слова', function(){
  // слова будуються з частин, щоб у файлі не було імені цілим словом
  const n1 = ['анд', 'рій'].join(''), n1gen = ['анд', 'рія'].join(''), n1lat = ['and', 'rii'].join('');
  const n2 = ['о', 'ля'].join(''), n2gen = ['о', 'лі'].join('');
  [n1, n1gen, n1lat, n2, n2gen].forEach(w => assert.ok(scanText('текст ' + w + ' кінець', true).length > 0, 'має ловити: ' + w.length + ' літер'));
  assert.deepEqual(scanText('Андроїд олівець оливкова олія', true), [], 'звичайні слова не ловляться');
  assert.deepEqual(scanText('x ' + n1 + ' /* PRIV-2b-REMOVE */', true), [], 'позначений рядок — виняток');
  assert.ok(scanText('x ' + n1 + ' /* PRIV-2b-REMOVE */', false).length > 0, 'без дозволу позначки ловить');
});
