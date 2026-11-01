// Rev 2.32.229 (BASE-CENSUS): підрахунок записів без зліпка — лише числа, без назв, сум і id.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const g = buildSandbox({}, ['baselineCensusRows']);
const J = (x) => JSON.parse(JSON.stringify(x));

test('підрахунок: усього, з сервера, без зліпка, брудні, ризикові', function(){
  const rows = g.baselineCensusRows({
    expenses: { list: () => [
      { cloudId: 'a', serverBase: {}, serverUpdatedAt: 't', localRev: 1, syncedRev: 1 },                       // у порядку
      { cloudId: 'b', localRev: 3, syncedRev: 1 },                                                              // ризик
      { localRev: 1, syncedRev: 0 },                                                                            // новий, ще не на сервері
      { cloudId: 'c', serverBase: {}, serverUpdatedAt: 't', localRev: 2, syncedRev: 1 },                       // брудний, але зі зліпком
      { cloudId: 'd', syncedUpdatedAt: 'x' },                                                                   // чистий без зліпка
    ] },
    hidden: { list: () => [] },
    broken: { list: () => { throw new Error('x'); } },
  });
  assert.deepEqual(J(rows[0]), { dom: 'expenses', total: 5, cloud: 4, noBase: 3, dirty: 3, risk: 1 });
  assert.deepEqual(J(rows[1]), { dom: 'hidden', total: 0, cloud: 0, noBase: 0, dirty: 0, risk: 0 });
  assert.equal(rows[2].total, 0, 'збій читання списку не валить підрахунок');
});
test('подія baseline-census: ключі в allowlist, виклик при старті, «Мітці» і «Стопі», у події лише числа', function(){
  ['censusTotal', 'censusCloud', 'censusNoBase', 'censusDirty', 'censusRisk'].forEach(k => assert.ok(SRC.includes("'" + k + "'"), k));
  assert.equal((SRC.match(/recordBaselineCensus\('(start|mark|stop)'\)/g) || []).length, 3);
  const body = SRC.slice(SRC.indexOf('function recordBaselineCensus'), SRC.indexOf('function recordFieldsSnapshot'));
  assert.match(body, /type: 'baseline-census'/);
  assert.ok(!/\.name|\.note|\.amount|cloudId/.test(body), 'у події немає назв, сум чи id');
});
