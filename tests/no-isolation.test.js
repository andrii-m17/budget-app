// Rev 2.32.81 (ISOL-1): ізоляцію тестових імен «TRASH-TEST-» прибрано повністю.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, '..', 'dev', 'mock-cloud.js'), 'utf8');

test('ISOL-1: у коді немає фільтра за назвою TRASH-TEST (предикатів, прапорця, кнопки очищення), записи з будь-якою назвою синхронізуються однаково', function(){
  ['isTestSyncIgnored', 'isTestRecordName', 'isTestHiddenKey', 'syncableRecords', 'filterTestRows', 'shouldIgnoreForSync', 'testIgnoreFlag', 'collectTestRecords', 'countTestRecords',
    'describeTestRecords', 'cleanupTestRecordsFromUi', 'cleanupTestRecordsNow', 'budget_ignore_test_prefix_v1', 'TEST_IGNORE_LS_KEY', 'test-cleanup'].forEach(function(n){
    const rest = SRC.replace(/\/\/ Rev 2\.32\.81 \(ISOL-1\):[^\n]*\n/, ''); // у пояснювальному коментарі назви згадано
    assert.ok(rest.indexOf(n) === -1, n + ' лишився в index.html');
  });
  assert.ok(!/TRASH-TEST/.test(SRC.replace(/\/\/ Rev 2\.32\.81 \(ISOL-1\):[^\n]*\n/, '')), 'TRASH-TEST у коді застосунку');
  assert.ok(!/Очистити тестові записи/.test(SRC), 'кнопки очищення тестових записів немає');
});
test('ISOL-1: applyCensus не має виключень за назвою (немає третього аргумента skip); 8 pull читають усі рядки; push-шляхи не відфільтровують записи', function(){
  assert.match(SRC, /function applyCensus\(entries, cloudIds\)\{/);
  assert.ok(!/function applyCensus\([^)]*skip/.test(SRC));
  assert.equal((SRC.match(/for\(const row of data\)\{/g) || []).length >= 8, true);
  const batch = SRC.slice(SRC.indexOf('async function pushExpensesBatch(records)'), SRC.indexOf('async function pushExpensesBatch(records)') + 600);
  assert.ok(!/syncable|TEST/.test(batch));
});
test('ISOL-1: правило «автоматичні тести не пишуть у робочу базу» не залежить від імен: мок за замовчуванням, захисник «лише перегляд» (Rev 2.32.75)', function(){
  assert.match(SRC, /function detectCloudEnv\(origin, realDbFlag\)/); assert.match(SRC, /function classifyBlockedRequest\(/);
  assert.ok(!/TRASH-TEST/.test(MOCK), 'у моку назв TRASH-TEST немає');
});
