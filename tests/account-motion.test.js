// Rev 2.29.0 (A, B) — поява «Обліку», перехід вкладок (firstFrameMs/gapAtFrame), підмітальник натискань (ROADMAP 32.48).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['rowsToAnimate', 'accountRevealPlan', 'shouldSweepPress', 'dashboardReplayMode']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));
const ACCT = SRC.slice(SRC.indexOf('// ===== Rev 2.29.0 (A) — поява «Обліку»'), SRC.indexOf('function renderDashboard(){'));

test('rowsToAnimate: перші max видимих; порожнє/некоректне → []', () => {
  assert.deepEqual(j('rowsToAnimate([0,1,2,3,4,5,6,7,8,9,10,11,12],10)'), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(j('rowsToAnimate([3,4],10)'), [3, 4]);
  assert.deepEqual(j('rowsToAnimate([],10)'), []);
  assert.deepEqual(j('rowsToAnimate(null,10)'), []);
  assert.deepEqual(j('rowsToAnimate([1,2,3],0)'), []);
});

test('accountRevealPlan: «Щоразу» повторює, перший показ/місяць — full, фон — none, reduced/hidden — none з причиною', () => {
  const base = { hidden: false, reduced: false, active: true, played: true, sameMonth: true, changed: false };
  const P = (o, v) => j('accountRevealPlan(' + JSON.stringify(Object.assign({}, base, o)) + ',' + JSON.stringify(v) + ')');
  assert.deepEqual(P({ trigger: 'visit' }, 'always'), { mode: 'replay', skipped: null });
  assert.deepEqual(P({ trigger: 'first', played: false }, 'always'), { mode: 'full', skipped: null });
  assert.deepEqual(P({ trigger: 'visit', played: false }, 'first'), { mode: 'full', skipped: null });
  assert.deepEqual(P({ trigger: 'month', sameMonth: false }, 'first'), { mode: 'full', skipped: null });
  assert.deepEqual(P({ trigger: 'render', changed: true }, 'always'), { mode: 'none', skipped: 'no-change' }, 'фоновий рендер не анімується');
  assert.deepEqual(P({ trigger: 'visit' }, 'first'), { mode: 'none', skipped: 'variant' });
  assert.deepEqual(P({ trigger: 'visit' }, 'changes'), { mode: 'none', skipped: 'no-change' });
  assert.deepEqual(P({ trigger: 'visit', reduced: true }, 'always'), { mode: 'none', skipped: 'reduced' });
  assert.deepEqual(P({ trigger: 'first', played: false, hidden: true }, 'always'), { mode: 'none', skipped: 'hidden' });
});

test('shouldSweepPress: знімає лише невідстежуваний .is-pressed через ≥300 мс; активне натискання (інший тап) — не витік', () => {
  const S = (i, n) => j('shouldSweepPress(' + JSON.stringify(i) + ',' + n + ')');
  assert.equal(S({ pressed: true, tracked: false, sinceMs: 1000 }, 1300), true);
  assert.equal(S({ pressed: true, tracked: false, sinceMs: 1000 }, 1299), false);
  assert.equal(S({ pressed: true, tracked: true, sinceMs: 1000 }, 5000), false, 'активне натискання не підмітаємо');
  assert.equal(S({ pressed: false, tracked: false, sinceMs: 0 }, 5000), false);
  assert.equal(S(null, 5000), false);
});

test('«Облік»: сума в підсумку має data-final з тієї ж змінної, що й текст fmt(); 5 лічильників; лічильників ≤ 6', () => {
  [['income-summary-total', 'sum'], ['installment-total-value', 'sum'], ['installment-balance-total-value', 'sum']].forEach(([id, v]) => assert.ok(SRC.includes(`setDashFinal('${id}', ${v})`), id));
  assert.ok(SRC.includes("setDashFinal('card-debt-summary-balance', totalBalance); setDashFinal('card-debt-summary-minpay', totalMinpay);"));
  assert.match(ACCT, /const ACCT_COUNTER_IDS = \[[^\]]*\]/);
  assert.equal((ACCT.match(/'[a-z-]+'/g) || []).length > 0, true);
  assert.match(ACCT, /runner\.counters\.length >= DASH_MAX_COUNTERS/);
});

test('фоновий рендер «Обліку» не запускає анімацію й не перемальовує вузол при незмінному вмісті', () => {
  assert.match(ACCT, /if\(el\.__acctHtml === value && el\.firstChild\) return;/);
  assert.match(ACCT, /if\(acctState\.running\) finishAccount\(\);\s*acctState\.deferred\.rows\.forEach/, 'зміна вмісту під час анімації → finish');
  const after = ACCT.slice(ACCT.indexOf('function acctAfterRender'), ACCT.indexOf('function onAccountVisit'));
  assert.match(after, /let trigger = 'render';/);
  assert.match(after, /else if\(acctState\.seenMonth !== null && acctState\.seenMonth !== selectedMonth\) trigger = 'month'/);
  assert.match(SRC, /safeCall\(acctAfterRender, 'acctAfterRender'\)/);
  ['income-table', 'bank-debt-table', 'installment-table'].forEach(id => assert.ok(ACCT.includes("'" + id + "'"), id));
});

test('сегменти: лише opacity+transform (--motion-s), висота не міняється; reduced → без анімації; лише при кліку користувача', () => {
  const pan = ACCT.slice(ACCT.indexOf('function acctAnimatePanel'), ACCT.indexOf('function playAccount'));
  assert.match(pan, /motionReduced\(\)/);
  assert.match(pan, /opacity: 0, transform: 'translateY\('/);
  assert.ok(!/height|margin|padding|top|display/.test(pan.replace(/translateY|motionDuration/g, '')), 'жодних змін розкладки');
  assert.equal((SRC.match(/switchAccountingTab\('[a-z]+', \{ animate: true \}\)/g) || []).length, 3);
  assert.match(SRC, /if\(opts && opts\.animate\) acctAnimatePanel\(/);
});

test('рядки: до 10 видимих по черзі (25·k), нижче екрана — IntersectionObserver з dwell/перевіркою розмітки; reduced/без IO → кінцевий стан', () => {
  assert.match(ACCT, /const ACCT_MAX_ROWS = 10;/);
  assert.match(ACCT, /ACCT_ROW_STAGGER_MS = 25/);
  assert.match(ACCT, /rowsToAnimate\(visibleIdx, ACCT_MAX_ROWS\)/);
  assert.match(ACCT, /shouldDeferChart\(mode, false, typeof IntersectionObserver === 'function'\)/);
  assert.match(ACCT, /rootMargin: '0px 0px -10% 0px', threshold: \[0, CHART_REVEAL_RATIO\]/);
  assert.match(ACCT, /row\.style\.opacity = '0'; row\.style\.transform = 'translateY\('/);
  assert.ok(!/row\.style\.(height|display|margin|padding)/.test(ACCT));
  assert.match(ACCT, /if\(!\(rc\.height > 0\) \|\| visH \/ rc\.height < CHART_REVEAL_RATIO\)\{ st\.ok = false; return; \}/);
});

test('події: account-enter (tab, mode, elements, counters, rows, frames, maxGapMs, durationMs, intensity, reduced, skipped, variant); пропуск теж пишеться', () => {
  assert.match(ACCT, /kind: 'account-enter', tab: 'accounting', mode: mode, skipped: null, elements: unitsN \+ rowsN, counters: r\.counters\.length, rows: rowsN/);
  assert.match(ACCT, /function recordAcctSkip\(reason\)\{\s*recordMotionPerf\(\{ kind: 'account-enter'/);
  assert.match(ACCT, /if\(trigger !== 'render'\) recordAcctSkip\(d\.skipped\)/);
  ['rows', 'deferredRows', 'variant', 'leakSelector', 'selector', 'firstFrameMs', 'gapAtFrame'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
});

test('перехід вкладок (B1): новий .view прихований opacity:0 до старту, анімація стартує в наступному кадрі (rAF), запасний старт, will-change лише на час анімації, firstFrameMs/gapAtFrame', () => {
  const tt = SRC.slice(SRC.indexOf('function playTabTransition'), SRC.indexOf('// --- Реакція на натискання'));
  assert.match(tt, /toEl\.style\.opacity = '0';/);
  assert.match(tt, /requestAnimationFrame\(start\);\s*startSafety = setTimeout\(start, 100\);/);
  assert.match(tt, /toEl\.style\.willChange = 'transform, opacity'; fromEl\.style\.willChange = 'transform, opacity';/);
  assert.match(tt, /toEl\.style\.opacity = ''; toEl\.style\.willChange = ''; fromEl\.style\.willChange = '';/, 'знімається по завершенні');
  assert.match(tt, /firstFrameMs: Math\.round\(firstFrameMs\), gapAtFrame: gapAt/);
  assert.ok(!/contain\s*:/.test(tt), 'contain не додавався (небезпечно для .view)');
  assert.ok(!/getBoundingClientRect|offset(Top|Left|Width|Height)/.test(tt.slice(tt.indexOf('function tick'), tt.indexOf('function done'))), 'тік без читань розмітки');
});

test('натискання (B2): touchend/touchcancel, MutationObserver на видалення, підмітальник 300 мс із press-leak-fixed; pressLeak не рахує активні натискання', () => {
  assert.match(SRC, /document\.addEventListener\('touchend', pressEndAllTouch, opt\)/);
  assert.match(SRC, /document\.addEventListener\('touchcancel', pressEndAllTouch, opt\)/);
  assert.match(SRC, /new MutationObserver\(function\(records\)\{\s*if\(!pressStates\.size\) return;/);
  const sw = SRC.slice(SRC.indexOf('function sweepPress'), SRC.indexOf('function pressEnd('));
  assert.match(sw, /if\(pressStates\.has\(el\)\) return;/);
  assert.match(sw, /kind: 'press-leak-fixed', selector: sel/);
  assert.match(sw, /setTimeout\(function\(\)\{\s*const r = sweepPress\(releasedAt\);/);
  assert.match(sw, /leakSelector:/);
});

test('жодного transform на body/html/nav.tabbar у модулі «Обліку»; без штучних затримок (лише dwell і повтор готовності)', () => {
  assert.ok(!/document\.body\.animate|documentElement\.animate|tabbar[^\n]*\.animate/.test(ACCT));
  assert.equal((ACCT.match(/setTimeout\(/g) || []).length, 2);
  assert.ok(!/pointer-?[Ee]vents/.test(ACCT));
});
