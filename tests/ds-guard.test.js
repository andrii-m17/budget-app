// DS-2: охоронний тест «сирі значення й старі назви в css/app.css не зростають». Кожна ревізія DS-2 (a→d) зменшує числа нижче; збільшувати їх не можна.
// Лічильники (без коментарів): hex і rgba( поза tokens.css; px у border-radius; посилання var(--color-…), var(--ui-…), var(--radius-…).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');
const TOK = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8');
const strip = (s) => s.replace(/\/\*[^]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
function counts(src){
  const nc = strip(src);
  let radiusPx = 0; (nc.match(/border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:[^;}]*/g) || []).forEach((d) => { radiusPx += (d.match(/(?<![\w.#-])\d*\.?\d+px/g) || []).length; });
  const refs = (re) => (nc.match(re) || []).length;
  return { hex: refs(/#[0-9a-fA-F]{3,8}\b/g), rgba: refs(/rgba?\(/g), radiusPx, refColor: refs(/var\(\s*--color-/g), refUi: refs(/var\(\s*--ui-/g), refRadius: refs(/var\(\s*--radius-/g) };
}
// Базові числа: стан після останньої ревізії DS-2 (Rev 2.32.342, DS-N3)
const BASE = { hex: 31, rgba: 27, radiusPx: 0, refColor: 293, refUi: 65, refRadius: 50 };
test('DS-2: сирі hex/rgba(, px у border-radius і посилання на старі назви не зростають', function(){
  const c = counts(APP);
  Object.keys(BASE).forEach(function(k){ assert.ok(c[k] <= BASE[k], k + ': ' + c[k] + ' > ' + BASE[k] + ' (число можна лише зменшувати; нові значення — через токени з css/tokens.css)'); });
});
test('DS-2d: радіуси 12/18/22/28/999 px у app.css записані токенами (--r-s, --r-m, --r-l, --r-xl, --r-pill)', function(){
  const nc = strip(APP);
  const bad = (nc.match(/border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:[^;}]*(?<![\w.#-])(?:12|18|22|28|999)px/g) || []);
  assert.deepEqual(bad, [], 'радіус зі шкали записано сирим px: ' + bad.join(' | '));
  assert.ok(TOK.indexOf('--r-l: 22px') !== -1 && TOK.indexOf('--r-xl: 28px') !== -1);
});
test('DS-2d: сирі rgba(34,197,94,.16/.32) (точні --accent-bg/--accent-line) замінено токенами', function(){
  assert.equal((strip(APP).match(/rgba\(\s*34\s*,\s*197\s*,\s*94\s*,\s*0?\.(16|32)\s*\)/g) || []).length, 0);
});
test('DS-N2: сирих font-size у px поза винятками (поля вводу, kb-*) немає; усе на токени --fs-*', function(){
  const r = require('node:child_process').spawnSync('node', [path.join(__dirname, '..', 'scripts', 'ds2-apply.js'), '--fs', '--dry'], { encoding: 'utf8', maxBuffer: 1e9 });
  const lines = r.stdout.trim().split('\n');
  assert.equal(JSON.parse(lines[0]).replaced.fs, 0, 'є font-size у px, який можна замінити на токен');
  const ex = JSON.parse(lines[1]).fsExceptions;
  assert.ok(ex.length <= 19, 'винятків (поля вводу) не більше 19, зараз ' + ex.length);
  ex.forEach(function(e){ assert.ok(/input|select|textarea|sf-input|sf-select|mono-token-input|chk-fld|journal-date-input/.test(e.sel.split(' ⟶ ').pop()), 'виняток не поле вводу: ' + e.sel); });
  ['--fs-large: 34px', '--fs-title1: 28px', '--fs-title2: 22px', '--fs-title3: 20px', '--fs-body: 17px', '--fs-callout: 16px', '--fs-subhead: 15px', '--fs-footnote: 13px', '--fs-caption1: 12px', '--fs-caption2: 11px'].forEach(function(t){ assert.ok(TOK.indexOf(t) !== -1, t); });
});
test('DS-N3: сирих border-radius у px у app.css немає (лише токени --r-*, 50%, calc, inherit); малі радіуси оголошено', function(){
  assert.equal(counts(APP).radiusPx, 0);
  assert.ok(TOK.indexOf('--r-xs: 8px') !== -1 && TOK.indexOf('--r-2xs: 4px') !== -1);
});
test('DS-N4a: тривалості (transition/animation) у app.css на токени --t-*, крім винятків (шторки, kb-*, таббар/«вгору», infinite, > 900 мс, reduced-motion, !important)', function(){
  const r = require('node:child_process').spawnSync('node', [path.join(__dirname, '..', 'scripts', 'ds2-apply.js'), '--dur', '--dry'], { encoding: 'utf8', maxBuffer: 1e9 });
  const lines = r.stdout.trim().split('\n');
  assert.equal(JSON.parse(lines[0]).replaced.durN4, 0, 'є тривалість, яку можна замінити на токен');
  const ex = JSON.parse(lines[1]).durExceptions;
  assert.ok(ex.length <= 30, 'винятків не більше 30, зараз ' + ex.length);
});
