// Rev 2.32.188 (CENSUS-GATE): syncNameDomainsOnConnect({ census:false }) не робить переписів id; nameDomainDirtyBreakdown лише рахує причини «брудності».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

test('census:false — жодного перепису, push усіх довідників лишається; за замовчуванням перепис є', async function(){
  const calls = [];
  const rec = function(n){ return async function(){ calls.push(n); return null; }; };
  const g = { nameDomainChildren: 0, captureDebugGeometry: function(){} };
  ['reconcileCategoriesCensus', 'reconcileSubcategoriesCensus', 'reconcileDictionaryCensus', 'reconcileBankAccountsCensus', 'reconcileInstallmentAccountsCensus',
    'pushCategoriesPilot', 'pushSubcategoriesPilot', 'pushDictionaryPilot', 'pushBankAccountsPilot', 'pushInstallmentAccountsPilot', 'pushHiddenEntitiesPilot'].forEach(function(n){ g[n] = rec(n); });
  const ctx = buildSandbox(g, ['syncNameDomainsOnConnect']);
  await ctx.syncNameDomainsOnConnect({ census: false });
  assert.equal(calls.filter(function(n){ return /Census$/.test(n); }).length, 0);
  assert.equal(calls.filter(function(n){ return /^push/.test(n); }).length, 6);
  calls.length = 0;
  await ctx.syncNameDomainsOnConnect({ skipChildren: true });
  assert.equal(calls.filter(function(n){ return /Census$/.test(n); }).length, 5);
});

test('nameDomainDirtyBreakdown: осиротілі батьки та інші класи лише рахуються (без назв)', function(){
  const same = { cloudId: 'x', updatedAt: 't', syncedUpdatedAt: 't' };
  const g = {
    CATEGORIES: [Object.assign({ name: 'A' }, same), { name: 'B', updatedAt: 't' }],
    SUBCATEGORIES: [Object.assign({ name: 's1', category: 'A', syncedCategoryId: 'x' }, same), Object.assign({ name: 's2', category: 'ZZ' }, same), Object.assign({ name: 's3', category: 'B', syncedCategoryId: 'q' }, same)],
    DICTIONARY: [Object.assign({ kw: 'w', cat: 'A', sub: '', syncedCategoryId: 'x' }, same), Object.assign({ kw: 'o', cat: 'ZZ' }, same)],
    bankAccounts: [], installmentAccounts: [{ cloudId: 'i', updatedAt: 'n', syncedUpdatedAt: 'o' }],
    hiddenFrom: { k1: { updatedAt: 'a', syncedUpdatedAt: 'b' }, k2: { updatedAt: 'a', syncedUpdatedAt: 'a' } },
  };
  const ctx = buildSandbox(g, ['isDirty', 'isSubcategoryDirty', 'categoriesByNameMap', 'dictionaryParentIds', 'nameDomainDirtyBreakdown']);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.nameDomainDirtyBreakdown())), { noCloudId: 1, unsynced: 1, orphanParent: 3, parentChanged: 0, hidden: 1 });
});
