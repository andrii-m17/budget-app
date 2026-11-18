// Rev 2.32.355 (DS-3b): рух таббару — умова анімації іконки, бульбашка, натиск, reduced-motion (джерело: css/app.css, js/shell.js)
const test = require('node:test');
const assert = require('node:assert');
const { buildSandbox, readAppCss } = require('./extract');
const CSS = readAppCss();
const c = buildSandbox({}, ['shouldAnimateTabIcon']);
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
test('натиск: .86 за --t-micro лише на .tbx (не на склі й кнопці)', function(){
  assert.ok(/nav\.tabbar\.pressed button\.preview-active \.tbx, nav\.tabbar button\.pressing \.tbx\{ scale:\.86; opacity:\.75; transition:scale var\(--t-micro\)/.test(CSS));
  assert.ok(!/\.pressing\{[^}]*scale/.test(CSS));
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
