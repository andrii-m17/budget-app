// Rev 2.14.0 — допоміжний модуль для тестів фінансової логіки.
//
// index.html — не ES-модуль (весь код у звичайних <script> тегах, змінні й
// функції спільні через глобальну область), тому напряму зробити
// `require('../index.html')` не можна — та й не варто: файл виконує DOM-
// ініціалізацію (event listeners, localStorage, рендер) одразу при завантаженні,
// а ми хочемо перевіряти ЛИШЕ чисті розрахункові функції без браузера.
//
// Рішення: витягуємо джерело потрібної function-декларації прямо з index.html
// (пошук збалансованих фігурних дужок від "function ім'я(" до кінця тіла) і
// виконуємо цей рядок коду в ізольованому vm.context, куди самі підставляємо
// лише ті глобальні змінні/функції, від яких конкретна функція залежить
// (напр. масив `debts`, хелпер `isHiddenForMonth`). Це і є "викликати
// ізольовано" для функцій, що технічно лишаються частиною монолітного файлу —
// без рефакторингу самого застосунку.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE_PATH = path.join(__dirname, '..', 'index.html');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

// Повертає вихідний код однієї function-декларації (з тілом) за назвою.
// Rev #28.B — тепер розпізнає й `async function NAME(...)`: без цього
// маркер `function NAME(` знаходив старт ПІСЛЯ ключового слова `async `,
// і вирізаний фрагмент (function-тіло з `await` усередині, але без самого
// `async`) падав у vm.runInContext з "await is only valid in async
// functions" — перший async-код серед extract-тестів (idbAdapter*/
// migrateLocalStorageToIndexedDb, Stage B).
function extractFunctionSource(fnName){
  const marker = `function ${fnName}(`;
  let start = SOURCE.indexOf(marker);
  if(start === -1){
    throw new Error(`extractFunctionSource: функцію "${fnName}" не знайдено в index.html — можливо, її перейменували/видалили. Онови tests/.`);
  }
  const asyncPrefix = 'async ';
  if(SOURCE.slice(Math.max(0, start - asyncPrefix.length), start) === asyncPrefix){
    start -= asyncPrefix.length;
  }
  const braceOpen = SOURCE.indexOf('{', start);
  let depth = 0;
  let i = braceOpen;
  for(; i < SOURCE.length; i++){
    if(SOURCE[i] === '{') depth++;
    else if(SOURCE[i] === '}'){
      depth--;
      if(depth === 0){ i++; break; }
    }
  }
  if(depth !== 0){
    throw new Error(`extractFunctionSource: не вдалось знайти кінець тіла функції "${fnName}" (незбалансовані дужки).`);
  }
  return SOURCE.slice(start, i);
}

// Повертає вихідний код однієї top-level `const ІМ'Я = ...;` декларації
// (напр. UA_MONTHS) — на відміну від функцій, тут кінцем служить перший
// top-level ";", а не збалансована фігурна дужка, тому рахуємо глибину
// [](){} разом і ігноруємо ";" усередині рядкових літералів.
function extractConstSource(constName){
  const marker = `const ${constName} = `;
  const start = SOURCE.indexOf(marker);
  if(start === -1){
    throw new Error(`extractConstSource: константу "${constName}" не знайдено в index.html — можливо, її перейменували/видалили. Онови tests/.`);
  }
  let depth = 0;
  let i = start;
  let quote = null;
  for(; i < SOURCE.length; i++){
    const ch = SOURCE[i];
    if(quote){
      if(ch === '\\') { i++; continue; }
      if(ch === quote) quote = null;
      continue;
    }
    if(ch === '"' || ch === "'" || ch === '`'){ quote = ch; continue; }
    if(ch === '[' || ch === '(' || ch === '{') depth++;
    else if(ch === ']' || ch === ')' || ch === '}') depth--;
    else if(ch === ';' && depth === 0){ i++; break; }
  }
  return SOURCE.slice(start, i);
}

// Витягує кілька функцій/констант і виконує їх у одному vm.context разом із
// наданими глобальними змінними-заглушками (напр. { debts: [...] }).
// Повертає той самий context — виклик context.fnName(...) викликає РЕАЛЬНИЙ
// код з index.html. Ім'я з великої літери й ВСІМА ВЕЛИКИМИ (напр. UA_MONTHS)
// трактується як const-декларація, інакше — як function-декларація.
function buildSandbox(globals, names){
  const context = vm.createContext(Object.assign({}, globals));
  // Rev 2.32.75 (K3): push-функції питають isCloudWriteReady()/isWriteBlocked(); у тестах за замовчуванням запис дозволений
  // (тест може передати власні версії в globals).
  vm.runInContext("if(typeof isWriteBlocked === 'undefined') var isWriteBlocked = function(){ return false; };"
    + "if(typeof blockedByReadOnly === 'undefined') var blockedByReadOnly = function(){ return false; };"
    + "if(typeof READONLY_USER_HINT === 'undefined') var READONLY_USER_HINT = 'x';"
    + "if(typeof isCloudWriteReady === 'undefined') var isCloudWriteReady = function(){ return !isWriteBlocked() && (typeof isCloudSessionReady === 'function' ? isCloudSessionReady() : false); };", context);
  // Rev 2.32.192 (SHADOW-REV): тіньові помічники обліку версій викликаються з push/save-функцій; додаємо їх у кожен sandbox автоматично (тести не мусять перелічувати їх у NAMES).
  const SHADOW = ['shadowNormalize', 'shadowNormalizeLazy', 'shadowNormalizeList', 'shadowNormalizeMap', 'shadowNormalizeAll', 'shadowSnap', 'shadowSetServer', 'shadowAfterPush', 'shadowRet', 'shadowServerAt', 'shadowDirtyNew', 'shadowDirtyOld', 'shadowDiffCounts', 'shadowDiffReport',
    // Rev 2.32.193 (MERGE-EXP): злиття витрат і журнал конфліктів; push/pull витрат викликають їх завжди
    'recordKey', 'EXP_MERGE_FIELDS', 'EXP_ROW_COLS', 'CONFLICT_TTL_MS', 'LS_KEY_CONFLICTS', 'CONFLICT_FIELD_ACC',
    'renderAfterSync', 'keyboardFieldActive', 'flushRenderAfterSync', 'MONO_NAV_EARLY_MS', 'PUSH_HIGHLIGHT_MS', 'pushHighlightStart', 'pushHighlightStop', 'expFieldVal', 'expSnap', 'expSnapFromRow', 'expFieldEq', 'expMerge', 'expSetFromSnap', 'expMergeServerRow', 'expLinkedNameForRow', 'expMigrateBase', 'pushExpenseCas', 'expRecordConflicts', 'INC_MERGE_FIELDS', 'INC_ROW_COLS', 'DEBT_MERGE_FIELDS', 'DEBT_ROW_COLS', 'mdFieldVal', 'mdSnap', 'mdFieldEq', 'mdMerge', 'mdSetFromSnap', 'mdMergeServerRow', 'mdMigrateBase', 'mdPushCas', 'mdPullDirty', 'mdIsEcho', 'mdBatchCas', 'mdRecordConflicts', 'MERGE_DOMAINS', 'pushIncomeRecordPilotCore', 'pushDebtRecordPilotCore',
    'conflictLoad', 'conflictPrune', 'conflictSave', 'conflictOpenCount', 'conflictValueText', 'conflictActor', 'conflictVerb', 'conflictModel', 'conflictDoneModel', 'mdWhere', 'hiddenDecisionParts', 'hiddenTargetOf', 'NOTIF_TRASH_SVG', 'conflictValueForConfirm', 'conflictClearDone', 'conflictProcessedCount', 'SYNC_SLOT_SYNCING_MS', 'SYNC_SLOT_PENDING_MS', 'SYNC_SLOT_FADE_MS', 'SYNC_MIN_SYNCING_MS', 'SYNC_RESULT_MS', 'CLOUD_ICON_D', 'SYNC_SLOT_CLOUD_D', 'SYNC_SLOT_BANG', 'SYNC_SLOT_SVG', 'SYNC_SLOT_LABEL', 'expSyncEntry', 'expSyncClear', 'expSyncSlots', 'expSyncPaint', 'expSyncSet', 'expSyncDone', 'expRowBlink', 'expRowsFor', 'expSyncBegin', 'expSyncEnd', 'expSyncStateFor', 'expSyncSlotHtml', 'expPulledMark', 'expPulledPhase', 'pushExpenseRecordPilotCore', 'conflictRowsHtml', 'conflictRowsNode', 'CONFLICT_BTN_STYLE', 'conflictStillValid', 'conflictResolve', 'conflictUiBusy', 'conflictFlushCards', 'conflictSectionHtml'];
  vm.runInContext("if(typeof conflictLog === 'undefined') var conflictLog = [];"
    + "if(typeof conflictAnnounce === 'undefined') var conflictAnnounce = [];"
    + "if(typeof conflictFlushTimer === 'undefined') var conflictFlushTimer = null;"
    + "if(typeof editingRecordKey === 'undefined') var editingRecordKey = null;"
    + "if(typeof updateNotifBell === 'undefined') var updateNotifBell = function(){};"
    + "if(typeof authorInfoFor === 'undefined') var authorInfoFor = function(){ return null; };"
    + "if(typeof showToast === 'undefined') var showToast = function(){};"
    + "if(typeof expSyncEntries === 'undefined') var expSyncEntries = new Map();"
    + "if(typeof recentlyPulledExpenseState === 'undefined') var recentlyPulledExpenseState = new Map();"
    + "if(typeof recentlyPulledIncomeState === 'undefined') var recentlyPulledIncomeState = new Map();"
    + "if(typeof safeId === 'undefined') var safeId = function(x){ return String(x); };"
    + "if(typeof escapeAttr === 'undefined') var escapeAttr = function(x){ return String(x); };"
    + "if(typeof MutationObserver === 'undefined') var MutationObserver = function(){ this.observe = function(){}; this.disconnect = function(){}; };"
    + "if(typeof renderAfterSyncPending === 'undefined') var renderAfterSyncPending = null;"
    + "if(typeof lastSuggestKey === 'undefined') var lastSuggestKey = '';"
    + "if(typeof suggestTouchAt === 'undefined') var suggestTouchAt = 0;"
    + "if(typeof performance === 'undefined') var performance = { now: function(){ return Date.now(); } };"
    + "if(typeof suggestTapTimer === 'undefined') var suggestTapTimer = null;"
    + "if(typeof suggestListTouching === 'undefined') var suggestListTouching = false;"
    + "if(typeof suggestListTouchAt === 'undefined') var suggestListTouchAt = 0;"
    + "if(typeof suggestClearPending === 'undefined') var suggestClearPending = false;"
    + "if(typeof suggestClearTimer === 'undefined') var suggestClearTimer = null;"
    + "if(typeof suggestHideTimer === 'undefined') var suggestHideTimer = null;"
    + "if(typeof suggestHandledRow === 'undefined') var suggestHandledRow = null;"
    + "if(typeof suggestHandledTouchIds === 'undefined') var suggestHandledTouchIds = [];"
    + "if(typeof pushHighlightHandle === 'undefined') var pushHighlightHandle = null;"
    + "if(typeof motionReduced === 'undefined') var motionReduced = function(){ return true; };"
    + "if(typeof setTimeout === 'undefined') var setTimeout = function(){ return 0; };"
    + "if(typeof clearTimeout === 'undefined') var clearTimeout = function(){};", context);
  names = names.concat(SHADOW.filter(n => !names.includes(n)));
  const source = names.map(name => {
    return /^[A-Z][A-Z0-9_]*$/.test(name) ? extractConstSource(name) : extractFunctionSource(name);
  }).join('\n\n');
  vm.runInContext(source, context, { filename: 'index.html (extracted)' });
  // Rev 2.32.80 (PAGING-1): pull*Core читають через fetchDeltaRows (сторінки по 500). Наявні тести мають власні прості фейк-клієнти (eq/gte без order/limit/or), тому за замовчуванням
  // у sandbox діє «стара» поведінка (один select + маркер); тести сторінкування (tests/paging.test.js) підставляють справжню fetchDeltaRows.
  if(!Object.prototype.hasOwnProperty.call(globals || {}, 'fetchDeltaRows') && !/function fetchDeltaRows\(/.test(source)){
    vm.runInContext("var fetchDeltaRows = async function(client, table, columns, domain){ let query = client.from(table).select(columns).eq('family_id', cloudFamilyId); query = applySyncMarker(query, domain); return await query; };", context);
  }
  return context;
}

// Виконує довільний вираз усередині вже створеного sandbox-контексту —
// потрібно, коли тестові дані мають бути "рідними" для реалму vm.Context
// (напр. new Date(...) для функції, що робить `instanceof Date`, бо Date з
// головного реалму Node не пройде цю перевірку в іншому vm.Context).
function evalInSandbox(context, expr){
  return vm.runInContext(expr, context);
}

module.exports = { extractFunctionSource, extractConstSource, buildSandbox, evalInSandbox };
