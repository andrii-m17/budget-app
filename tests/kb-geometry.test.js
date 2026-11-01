// Rev 2.32.238 (KB-GEOM): діагностика геометрії клавіатури — клас пристрою, знімок без значень полів, підключення слухачів.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const g = buildSandbox({}, []);
const J = (x) => JSON.parse(JSON.stringify(x));

test('клас пристрою: iPhone, iPad (також iPadOS «як Mac»), Android, desktop', () => {
  assert.equal(g.kbgDeviceClass({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), 'iPhone');
  assert.equal(g.kbgDeviceClass({ ua: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }), 'iPad');
  assert.equal(g.kbgDeviceClass({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), 'iPad');
  assert.equal(g.kbgDeviceClass({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }), 'desktop');
  assert.equal(g.kbgDeviceClass({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126' }), 'Android');
  assert.equal(g.kbgDeviceClass({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'desktop');
});
test('знімок: висота клавіатури = innerHeight − vv.height − vv.offsetTop; відступ таб-бара від низу; листи й поле — лише прямокутники; без полів зі значеннями', () => {
  const e = J(g.kbgSnapshot({ why: 'focus', device: 'iPad', innerWidth: 820, innerHeight: 1180, vv: { width: 820, height: 800, offsetTop: 0, offsetLeft: 0, scale: 1 }, safeTop: 0, safeBottom: 20, coarse: true, hover: false, standalone: true, hasVk: false, viewportMeta: 'width=device-width, viewport-fit=cover', tabbar: { top: 1100, bottom: 1173, height: 73 }, sheet: { top: 300, bottom: 790, height: 490 }, field: { top: 700, bottom: 744 }, kbCss: '380px', liftCss: '120' }));
  assert.equal(e.kbHeightCalc, 380); assert.equal(e.tabbarGap, 7); assert.equal(e.devClass, 'iPad'); assert.equal(e.orientation, 'portrait');
  assert.deepEqual([e.sheetTop, e.sheetBottom, e.sheetHeight, e.fieldTop, e.fieldBottom], [300, 790, 490, 700, 744]);
  assert.equal(e.vkPresent, false); assert.equal(e.vkOverlays, null); assert.equal(e.kbInset, '380px'); assert.equal(e.sheetLiftCss, '120');
  assert.ok(!('value' in e) && !('text' in e) && !('fieldId' in e), 'без значень і ідентифікаторів полів');
  const n = J(g.kbgSnapshot({ why: 'vv', device: 'desktop', innerWidth: 1280, innerHeight: 800, vv: null }));
  assert.equal(n.kbHeightCalc, null); assert.ok(!('tabbarGap' in n) && !('sheetTop' in n) && !('fieldTop' in n));
});
test('підключення: слухачі лише в записі, на focusin/visualViewport (resize, scroll) з «осіданням» 150 мс, плюс старт/«Мітка»/«Стоп»; ключі в allowlist; kb-* не чіпаємо', () => {
  assert.match(SRC, /on\(window\.visualViewport, 'resize', onKbgVvChange\);/); assert.match(SRC, /on\(window\.visualViewport, 'scroll', onKbgVvChange\);/);
  assert.match(SRC, /on\(document, 'focusin', onKbgFocusIn, true\);/);
  assert.match(SRC, /setTimeout\(function\(\)\{ kbgSettleTimer = null; recordKbGeometry\(why \+ '-settled'\); \}, 150\);/);
  assert.equal((SRC.match(/recordKbGeometry\('(start|mark|stop)'\)/g) || []).length, 3);
  ['kbgWhy', 'devClass', 'ptrCoarse', 'hoverHover', 'standaloneMode', 'vkPresent', 'vkOverlays', 'viewportMeta', 'tabbarGap', 'sheetTop', 'sheetBottom', 'sheetHeight', 'fieldTop', 'fieldBottom', 'kbHeightCalc', 'sheetLiftCss'].forEach(k => assert.ok(SRC.includes("'" + k + "'"), k));
  const body = SRC.slice(SRC.indexOf('function kbgMeasure'), SRC.indexOf('function pushDebugEvent'));
  assert.ok(!/\.value\b|\.textContent|\.innerText|setProperty|classList\.(add|remove)/.test(body), 'лише читання: без значень полів, без змін стилів і класів');
});

test('Rev 2.32.239: нова формула клавіатури — iPad і Android завжди, iPhone лише з перемикачем (локально); стара формула лишається для iPhone', () => {
  const mk = (ua, flag, platform, mtp) => { const ls = flag ? { 'budget-kb-new-formula-iphone': '1' } : {}; return buildSandbox({ navigator: { userAgent: ua, platform: platform || '', maxTouchPoints: mtp || 5 }, localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; } } }, ['kbUseNewFormula', 'kbIsIphone', 'KB_NEWF_KEY']); };
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126';
  assert.equal(mk(IPHONE, false).kbUseNewFormula(), false, 'iPhone за замовчуванням — стара');
  assert.equal(mk(IPHONE, true).kbUseNewFormula(), true, 'iPhone з перемикачем — нова');
  assert.equal(mk(IPAD, false).kbUseNewFormula(), true); assert.equal(mk(AND, false).kbUseNewFormula(), true);
  assert.equal(mk('Mozilla/5.0 (Macintosh)', false, 'MacIntel', 5).kbUseNewFormula(), true, 'iPadOS «як Mac» — iPad');
  const g2 = buildSandbox({}, ['computeSheetLiftLegacy']);
  assert.equal(g2.computeSheetLiftLegacy(780, 894, 389, 8), 283, 'стара формула без змін');
  assert.match(SRC, /TODO: прибрати після підтвердження iPhone/);
  assert.match(SRC, /id="kb-newf-btn" role="switch" aria-checked="false"/);
});
