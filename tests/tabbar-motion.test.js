// Rev 2.32.355 (DS-3b): рух таббару — умова анімації іконки, бульбашка, натиск, reduced-motion (джерело: css/app.css, js/shell.js)
const test = require('node:test');
const assert = require('node:assert');
const { buildSandbox, readAppCss } = require('./extract');
const CSS = readAppCss();
const c = buildSandbox({}, ['shouldAnimateTabIcon', 'tabAnimBlockReason']);
const ok = { switching: true, enabled: true, visible: true, kbOpen: false, drawerOpen: false, autofocus: false, reduced: false };
test('shouldAnimateTabIcon: лише реальна зміна вкладки без перешкод', function(){
  assert.equal(c.shouldAnimateTabIcon(ok), true);
  assert.equal(c.shouldAnimateTabIcon(Object.assign({}, ok, { switching: false })), false, 'повторний дотик / та сама вкладка');
  assert.equal(c.shouldAnimateTabIcon(Object.assign({}, ok, { enabled: false })), false, 'старт / відновлення вкладки до першого жесту');
  assert.equal(c.shouldAnimateTabIcon(Object.assign({}, ok, { visible: false })), false);
  assert.equal(c.shouldAnimateTabIcon(Object.assign({}, ok, { kbOpen: true })), false, 'відкрита клавіатура');
  assert.equal(c.shouldAnimateTabIcon(Object.assign({}, ok, { drawerOpen: true })), false, 'відкрита шторка');
  assert.equal(c.shouldAnimateTabIcon(Object.assign({}, ok, { autofocus: true })), false, 'зараз відкриється клавіатура');
  assert.equal(c.shouldAnimateTabIcon(Object.assign({}, ok, { reduced: true })), false, 'reduced-motion');
  assert.equal(c.shouldAnimateTabIcon(), false);
});
test('бульбашка: 520 мс, крива макета, без старої пружини; will-change таббару не знято', function(){
  assert.ok(/\.tabbar-bubble\{[^}]*transition:transform 520ms cubic-bezier\(\.3,1\.12,\.5,1\)/.test(CSS));
  assert.ok(!/\.tabbar-bubble\{[^}]*cubic-bezier\(\.34,1\.56,\.64,1\)/.test(CSS));
  assert.ok(/will-change:transform, backdrop-filter;/.test(CSS));
});
test('keyframes макета дослівно й анімації лише за класом .tb-anim.active', function(){
  assert.ok(CSS.indexOf('@keyframes tbSlice{ 0%{ transform:scale(1); } 45%{ transform:scale(1.16); } 100%{ transform:scale(1); } }') !== -1);
  assert.ok(CSS.indexOf('@keyframes tbPress{ 0%{ transform:scale(1); } 30%{ transform:scale(.86); } 70%{ transform:scale(1.04); } 100%{ transform:scale(1); } }') !== -1);
  assert.ok(CSS.indexOf('@keyframes tbNode{ 0%{ transform:scale(.55); } 60%{ transform:scale(1.15); } 100%{ transform:none; } }') !== -1);
  assert.ok(CSS.indexOf('@keyframes tbSpin{ from{ transform:rotate(180deg); } to{ transform:none; } }') !== -1);
  assert.ok(CSS.indexOf('@keyframes tbPie{ 0%{ transform:scale(.86); } 100%{ transform:none; } }') !== -1);
  ['tbSlice', 'tbPress', 'tbNode', 'tbSpin', 'tbPie'].forEach(function(n){
    (CSS.match(new RegExp('[^{}]*\\{[^}]*animation:' + n + '\\b', 'g')) || []).forEach(function(r){ assert.ok(/tb-anim\.active/.test(r), n + ' поза .tb-anim.active: ' + r.slice(0, 80)); });
  });
});
test('натиск: .86 за 110 мс (макет) лише на .tbx, стан .tb-down; скло й кнопка не стискаються (Rev 2.32.361, DS-3b4)', function(){
  assert.ok(/nav\.tabbar\.tb-down button\.preview-active \.tbx, nav\.tabbar button\.pressing \.tbx\{ scale:\.86; opacity:\.75; transition:scale var\(--tb-press\)/.test(CSS));
  assert.ok(/nav\.tabbar\{ --tb-rel:380ms; --tb-press:110ms; \}/.test(CSS), 'натиск 110 мс (значення макета; змінна замість токена --t-micro 120 мс)');
  assert.ok(!/\.pressing\{[^}]*scale/.test(CSS));
});
test('скло: ефект .pressed (збільшення, блиск бульбашки) лише при свайпі; простий дотик його не вмикає', function(){
  const SRC = require('./extract').readIndexWithCss();
  const ts = SRC.slice(SRC.indexOf("bar.addEventListener('touchstart'"), SRC.indexOf("bar.addEventListener('touchmove'"));
  assert.ok(ts.indexOf("classList.add('tb-down')") !== -1 && ts.indexOf("classList.add('pressed')") === -1, 'touchstart: лише tb-down');
  const tm = SRC.slice(SRC.indexOf("bar.addEventListener('touchmove'"), SRC.indexOf("bar.addEventListener('touchmove'") + 900);
  assert.ok(/hasMoved = true;\n\s+bar\.classList\.add\('pressed'\)/.test(tm), 'pressed вмикається при досягненні порога руху');
  assert.ok(/nav\.tabbar\.pressed \.tabbar-glass\{ transform:scale\(1\.035\)/.test(CSS), 'ефект скла лишається за .pressed');
});
test('іконки 22 px, «+» 44 px, колір вибраного --accent-text (як у макеті)', function(){
  assert.ok(/nav\.tabbar svg\{ width:22px; height:22px; \}/.test(CSS));
  assert.ok(/\.tab-vytraty \.tb-icon-wrap\{ position:relative; width:44px; height:44px;[^}]*margin-top:-22px;/.test(CSS));
  assert.ok(/nav\.tabbar button\.active, nav\.tabbar button\.preview-active\{ color:var\(--accent-text\); \}/.test(CSS));
});
test('reduced-motion: один блок вимикає бульбашку, натиск, анімації іконок і поворот «+», колір не чіпає', function(){
  const m = CSS.match(/@media \(prefers-reduced-motion: reduce\)\{\s*\.tabbar-bubble\{[^@]*?\n  \}/);
  assert.ok(m, 'блок не знайдено');
  const b = m[0];
  assert.ok(/\.tabbar-bubble\{ transition:none; \}/.test(b) && /scale:1; opacity:1;/.test(b) && /animation:none;/.test(b) && /tb-icon-wrap svg\{ transition:none; \}/.test(b));
  assert.ok(!/color/.test(b.replace(/animation[^;]*;/g, '')), 'зміну кольору не вимикаємо');
});
test('розмітка: кожна кнопка таббару має .tbx; нових полів вводу немає', function(){
  const SRC = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const nav = SRC.slice(SRC.indexOf('<nav class="tabbar">'), SRC.indexOf('</nav>', SRC.indexOf('<nav class="tabbar">')));
  assert.equal((nav.match(/<button/g) || []).length, 5);
  assert.equal((nav.match(/class="tbx"/g) || []).length, 5);
  assert.ok(!/<input|<textarea|<select/.test(nav));
});
test('tabAnimBlockReason: причина відмови для самописця (DS-3b3), порядок пріоритету', function(){
  const r = (o) => c.tabAnimBlockReason(Object.assign({}, ok, o));
  assert.equal(r({}), '');
  assert.equal(r({ switching: false }), 'same-tab'); assert.equal(r({ enabled: false }), 'start'); assert.equal(r({ visible: false }), 'hidden');
  assert.equal(r({ kbOpen: true }), 'kb'); assert.equal(r({ drawerOpen: true }), 'drawer'); assert.equal(r({ autofocus: true }), 'autofocus'); assert.equal(r({ reduced: true }), 'reduced');
  assert.equal(r({ switching: false, enabled: false, kbOpen: true }), 'same-tab', 'та сама вкладка важливіша за решту');
  assert.equal(c.tabAnimBlockReason(), 'same-tab');
});
test('самописець: тип tab-anim і ключі трасування в білих списках (без заборонених імен ключів)', function(){
  const SRC = require('./extract').readIndexWithCss();
  const ti = SRC.indexOf('const REC_ALLOWED_TYPES = ['); const types = SRC.slice(ti, SRC.indexOf('];', ti));
  assert.ok(types.indexOf("'tab-anim'") !== -1);
  const ki = SRC.indexOf('const REC_ALLOWED_KEYS = ['); const keys = SRC.slice(ki, SRC.indexOf('];', ki));
  ['via', 'started', 'ran', 'finished', 'why', 'cutAfterMs', 'cutBy', 'lagMs', 'anims', 'from', 'to', 'frames', 'maxGapMs', 'ms'].forEach(function(k){ assert.ok(keys.indexOf("'" + k + "'") !== -1, k); });
});
