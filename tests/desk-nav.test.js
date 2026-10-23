// Rev 2.32.162 (DESK-NAV) — нова десктопна навігаційна панель: структура, активний пункт, згортання й збереження стану, місяць у шапці, бейдж сповіщень, мобільна розкладка без змін.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NC = SRC.replace(/<!--[\s\S]*?-->/g, '');
const CSS = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const NAV_MQ = '@media (min-width:1280px), (min-width:768px) and (hover:hover) and (pointer:fine){';
const navBlock = (function(){ const i = CSS.indexOf(NAV_MQ); assert.ok(i > 0, 'блок навігації'); let d = 0, k = i + NAV_MQ.length - 1; for(; k < CSS.length; k++){ if(CSS[k] === '{') d++; if(CSS[k] === '}'){ d--; if(d === 0) break; } } return CSS.slice(i, k + 1); })();

test('структура: nav з aria-label, п’ять пунктів, нижній ряд (профіль, сповіщення, налаштування), кнопка згортання', function(){
  const nav = NC.match(/<nav class="side-panel" id="side-panel" aria-label="Основна навігація">[\s\S]*?<\/nav>/)[0];
  ['analytics', 'accounting', 'vytraty', 'structure', 'service'].forEach(t => assert.match(nav, new RegExp('data-tab="' + t + '" onclick="switchTab\\(\'' + t + '\'\\)"')));
  const order = ['Аналітика', 'Облік', 'Витрати', 'Структура', 'Сервіс'].map(l => nav.indexOf('<span class="side-label">' + l + '</span>'));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'порядок пунктів');
  const bottom = nav.slice(nav.indexOf('<div class="side-bottom">'));
  assert.ok(bottom.indexOf('id="profile-side-trigger"') < bottom.indexOf('id="notif-side-tab"') && bottom.indexOf('id="notif-side-tab"') < bottom.indexOf('onclick="openSettings()"'));
  assert.match(nav, /id="profile-avatar-side"/); // аватар зі статус-крапкою (renderProfileUI)
  assert.match(nav, /<button type="button" class="side-collapse-btn" id="side-collapse-btn" aria-expanded="true" aria-controls="side-panel" aria-label="Згорнути панель" title="Згорнути панель">/);
  assert.ok(!/month-select-side|class="month-picker"/.test(nav), 'вибору місяця в панелі немає');
  assert.ok(nav.match(/<button[^>]*data-tip="[^"]+"/g).length >= 8, 'підказки на всіх пунктах');
  ['Аналітика', 'Облік', 'Витрати', 'Структура', 'Сервіс', 'Профіль', 'Сповіщення', 'Налаштування'].forEach(l => assert.match(nav, new RegExp('aria-label="' + l + '"')));
});
test('вигляд: радіус 22 px, відступ 12 px, скло (backdrop-filter), токени скла мобільного таб-бара, обводка й тінь, ширини 240/62', function(){
  const panel = navBlock.match(/\.side-panel\{([^}]*)\}/)[1];
  assert.match(panel, /position:fixed/); assert.match(panel, /top:12px; bottom:12px; left:12px/); assert.match(panel, /border-radius:22px/);
  assert.match(panel, /backdrop-filter:blur\(14px\) saturate\(160%\)/); assert.match(panel, /background:var\(--color-glass-bg\)/);
  assert.match(panel, /border:1px solid var\(--color-glass-border\)/); assert.match(panel, /box-shadow:var\(--shadow-glass\)/);
  assert.match(navBlock, /html\{ --side-w:240px; \}/); assert.match(navBlock, /html\.side-collapsed\{ --side-w:62px; \}/);
  const tb = CSS.match(/\.tabbar-glass\{[\s\S]*?\n  \}/)[0];
  assert.match(tb, /var\(--color-glass-bg\)/); assert.match(tb, /var\(--color-glass-border\)/); assert.match(tb, /var\(--shadow-glass\)/);
  assert.equal((CSS.match(/backdrop-filter\s*:/g) || []).length - (CSS.match(/-webkit-backdrop-filter\s*:/g) || []).length > 0, true);
  assert.equal((navBlock.match(/backdrop-filter/g) || []).length, 2, 'у блоці панелі лише одне скло (разом із -webkit-)');
});
test('умова показу: ≥ 1280 px або ≥ 768 px з мишею; дотиковий планшет 768–1279 лишається з нижнім таб-баром', function(){
  assert.ok(navBlock.includes('nav.tabbar{ display:none; }'));
  const t0 = CSS.indexOf('@media (min-width:768px) and (max-width:1279px){'); assert.ok(t0 > 0);
  const tablet = CSS.slice(t0, CSS.indexOf('\n  }', t0)); assert.ok(!/\.side|tabbar/.test(tablet), 'планшетний блок навігації не чіпає');
});
test('активний пункт: скляна пілюля з рамкою акценту (значення .tabbar-bubble), «Витрати» — зелене коло з плюсом без пілюлі', function(){
  assert.match(navBlock, /\.side button\.side-tab\.active\{ background:rgba\(34,197,94,\.16\); border-color:rgba\(34,197,94,\.32\); box-shadow:0 2px 8px rgba\(34,197,94,\.22\); color:var\(--color-primary-hover\); \}/);
  assert.match(CSS, /\.tabbar-bubble\{[\s\S]*?background:rgba\(34,197,94,\.16\);[\s\S]*?border:1px solid rgba\(34,197,94,\.32\);[\s\S]*?box-shadow:0 2px 8px rgba\(34,197,94,\.22\)/);
  assert.match(navBlock, /\.side-plus\{[^}]*border-radius:50%; background:var\(--color-primary\); color:#fff;/);
  assert.match(navBlock, /\.tab-vytraty\.active\{ background:none; border-color:transparent; box-shadow:none;/);
  assert.match(NC, /<span class="side-plus" aria-hidden="true"><svg[^>]*><line x1="12" y1="5" x2="12" y2="19"\/><line x1="5" y1="12" x2="19" y2="12"\/><\/svg><\/span>/);
});
test('aria-current: початковий пункт у розмітці й оновлення в updateActiveTab (один активний)', function(){
  assert.match(NC, /<button class="side-tab active" data-tab="analytics"[^>]*aria-current="page"/);
  assert.match(SRC, /if\(on\) b\.setAttribute\('aria-current', 'page'\); else b\.removeAttribute\('aria-current'\)/);
});

// ---- згортання ----
function envCollapse(stored, width, opts){
  const o = opts || {}; const store = {}; if(stored != null) store['mt-side-collapsed'] = stored;
  const cls = new Set(); const btnAttrs = {}; const listeners = {};
  const btn = { setAttribute: (k, v) => { btnAttrs[k] = v; }, addEventListener: (t, f) => { listeners[t] = f; } };
  const g = {
    localStorage: o.noStorage ? { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); } } : { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    document: { documentElement: { classList: { toggle: (c, on) => { on ? cls.add(c) : cls.delete(c); }, contains: c => cls.has(c) } }, getElementById: id => id === 'side-collapse-btn' ? btn : null },
    window: { innerWidth: width, addEventListener: (t, f) => { listeners['w:' + t] = f; } },
  };
  const c = buildSandbox(g, ['SIDE_COLLAPSE_KEY', 'SIDE_NARROW_PX', 'sideCollapseResolve', 'sideCollapseStored', 'applySideCollapsed', 'toggleSideNav', 'initSideNav']);
  return { c, store, cls, btnAttrs, listeners, g };
}
test('згортання: за замовчуванням вузька лише під 1100 px; збережений вибір важить більше за ширину', function(){
  const e = envCollapse(null, 1000); assert.equal(e.c.sideCollapseResolve(null, 1099), true); assert.equal(e.c.sideCollapseResolve(null, 1100), false);
  assert.equal(e.c.sideCollapseResolve('1', 1600), true); assert.equal(e.c.sideCollapseResolve('0', 800), false);
  assert.equal(e.c.sideCollapseResolve('сміття', 1000), true, 'невідоме значення = за шириною');
});
test('згортання: ініціалізація, перемикання кнопкою, збереження в localStorage, aria і підписи', function(){
  const e = envCollapse(null, 1280); e.c.initSideNav();
  assert.equal(e.cls.has('side-collapsed'), false); assert.equal(e.btnAttrs['aria-expanded'], 'true'); assert.equal(e.btnAttrs['aria-label'], 'Згорнути панель');
  e.listeners.click(); // кнопка
  assert.equal(e.cls.has('side-collapsed'), true); assert.equal(e.store['mt-side-collapsed'], '1'); assert.equal(e.btnAttrs['aria-expanded'], 'false'); assert.equal(e.btnAttrs['aria-label'], 'Розгорнути панель'); assert.equal(e.btnAttrs.title, 'Розгорнути панель');
  e.listeners.click();
  assert.equal(e.cls.has('side-collapsed'), false); assert.equal(e.store['mt-side-collapsed'], '0');
});
test('згортання: стан зберігається між сесіями (перезапуск із ширини 1600 при збереженому «згорнуто») і ширина слідує за вікном, лише якщо вибору не зроблено', function(){
  const saved = envCollapse('1', 1600); saved.c.initSideNav(); assert.equal(saved.cls.has('side-collapsed'), true);
  const open = envCollapse('0', 900); open.c.initSideNav(); assert.equal(open.cls.has('side-collapsed'), false);
  const auto = envCollapse(null, 1400); auto.c.initSideNav(); assert.equal(auto.cls.has('side-collapsed'), false);
  auto.g.window.innerWidth = 1000; auto.listeners['w:resize'](); assert.equal(auto.cls.has('side-collapsed'), true, 'без вибору слідує за шириною');
  open.g.window.innerWidth = 1600; open.listeners['w:resize'](); open.g.window.innerWidth = 700; open.listeners['w:resize'](); assert.equal(open.cls.has('side-collapsed'), false, 'з вибором не слідує');
});
test('згортання: localStorage недоступний — не падає, працює за шириною й перемикається в межах сесії', function(){
  const e = envCollapse(null, 900, { noStorage: true }); e.c.initSideNav(); assert.equal(e.cls.has('side-collapsed'), true);
  e.listeners.click(); assert.equal(e.cls.has('side-collapsed'), false);
});
test('згортання: початковий клас ставить скрипт у <head> до малювання (те саме правило, що в основному скрипті)', function(){
  const head = SRC.slice(0, SRC.indexOf('</head>'));
  assert.match(head, /localStorage\.getItem\('mt-side-collapsed'\);\s*var c = v === '1' \? true : v === '0' \? false : window\.innerWidth < 1100;\s*if\(c\) document\.documentElement\.classList\.add\('side-collapsed'\);/);
});
test('вузька панель: лише іконки, підказки при наведенні й фокусі, без анімації за prefers-reduced-motion', function(){
  assert.match(navBlock, /html\.side-collapsed \.side-label, /); assert.match(navBlock, /html\.side-collapsed \.side-label[^{]*\{ display:none; \}/);
  assert.match(navBlock, /html\.side-collapsed \.side button\.side-tab\[data-tip\]:hover::after, html\.side-collapsed \.side button\.side-tab\[data-tip\]:focus-visible::after/);
  assert.match(navBlock, /content:attr\(data-tip\)/);
  assert.match(CSS, /\(prefers-reduced-motion:reduce\)\{\s*\.side, \.side-panel, \.side-collapse-btn svg\{ transition:none; \}/);
  assert.match(CSS, /\*:not\(\.drawer\):not\(\.drawer-backdrop\):not\(\.side\):not\(\.side-panel\), \*::before/);
});

test('місяць: пілюля в шапці сторінки на десктопі (не ховається), у панелі вибору місяця немає; вибір працює без елемента панелі', function(){
  assert.ok(!/\.month-pill\{ display:none; \}/.test(navBlock) && !/\.month-pill\{ display:none; \}/.test(CSS.slice(CSS.indexOf('Desktop (≥1280px)'))));
  assert.match(NC, /<label class="month-pill" for="month-select-top">/);
  assert.match(SRC, /showMonthPill:true \},\n  accounting/); assert.match(SRC, /vytraty: \{[^}]*showMonthPill:false/);
  assert.match(SRC, /const sideMonth = document\.getElementById\('month-select-side'\); if\(sideMonth\) sideMonth\.value = val;/);
  assert.match(SRC, /const el = document\.getElementById\(id\); if\(!el\) return;/);
});
test('бейдж сповіщень: той самий елемент і updateNotifBell; aria-label несе кількість', function(){
  assert.match(NC, /<span class="notif-bell-count hidden" id="notif-side-count" aria-hidden="true"><\/span>/);
  assert.match(SRC, /const sideCount = document\.getElementById\('notif-side-count'\)/);
  assert.match(NC, /id="notif-side-tab" aria-label="Сповіщення"/);
});
test('мобільна розкладка без змін: .side прихована за замовчуванням, таб-бар і кнопки шапки на місці; нові правила лише в блоці десктопа; логіка навігації не чіпана', function(){
  assert.match(CSS, /\n  \.side\{ display:none; \}/);
  assert.ok(/<nav class="tabbar"/.test(NC) || /<nav[^>]*class="tabbar/.test(NC));
  assert.match(NC, /<div class="page-header-buttons">/); assert.match(NC, /<div class="page-header-buttons-left">/);
  const outside = CSS.replace(navBlock, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const rm0 = outside.indexOf('@media ((min-width:1280px), (min-width:768px) and (hover:hover) and (pointer:fine)) and (prefers-reduced-motion:reduce){'); assert.ok(rm0 > 0);
  const rest = (outside.slice(0, rm0) + outside.slice(outside.indexOf('\n  }', rm0) + 4)).replace(/\*:not\(\.drawer\)[^{]*\{/, '');
  assert.ok(!/\.side-panel|\.side-plus|\.side-collapse-btn\{|html\.side-collapsed/.test(rest), 'нових правил панелі поза десктопним блоком (і його reduced-motion) немає');
  assert.match(SRC, /function switchTab\(tab, opts\)\{/);
  assert.match(NC, /onclick="switchTab\('vytraty'\)"/);
});
