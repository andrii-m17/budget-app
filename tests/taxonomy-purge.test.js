// Rev 2.32.7 (T3) — безповоротне видалення категорій/підкатегорій (з гілкою слів): чисті функції та охоронні тести.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['taxonomyUsage', 'purgeTaxonomyPlan', 'taxonomyPlural', 'purgeTaxonomyConfirmText', 'purgeTaxonomyBlockedText', 'removeTaxonomyFromState', 'filterPurgedTaxonomy']);
const J = v => JSON.parse(JSON.stringify(v));
const fresh = () => ({
  categories: [{ name: 'Їжа', active: true, cloudId: 'c0' }, { name: 'Тест1', active: false, cloudId: 'c1' }, { name: 'Авто', active: false, cloudId: 'c2' }],
  subcategories: [{ name: 'Тест-під', category: 'Тест1', active: false, cloudId: 's1' }, { name: 'Кафе', category: 'Їжа', active: true, cloudId: 's0' }, { name: 'Мийка', category: 'Авто', active: false, cloudId: 's2' }],
  dictionary: [{ kw: 'w1', cat: 'Тест1', sub: 'Тест-під', cloudId: 'w1' }, { kw: 'w2', cat: 'Тест1', sub: '', cloudId: 'w2', deletedAt: 'x', deletedVia: 'category' }, { kw: 'w3', cat: 'Їжа', sub: 'Кафе', cloudId: 'w3' }, { kw: 'w4', cat: 'Авто', sub: 'Мийка' }],
  expenses: [{ id: 'e1', category: 'Авто', subcategory: 'Мийка', amount: 5 }, { id: 'e2', category: 'Авто', subcategory: '', amount: 7, deletedAt: 'x' }, { id: 'e3', category: 'Їжа', subcategory: 'Кафе', amount: 9 }],
});
test('taxonomyUsage: лише живі витрати за категорією / підкатегорією; tombstone не рахуються', () => {
  const st = fresh();
  assert.equal(ctx.taxonomyUsage({ kind: 'category', name: 'Авто' }, st.expenses), 1);
  assert.equal(ctx.taxonomyUsage({ kind: 'subcategory', name: 'Мийка' }, st.expenses), 1);
  assert.equal(ctx.taxonomyUsage({ kind: 'category', name: 'Тест1' }, st.expenses), 0);
  assert.equal(ctx.taxonomyUsage({ kind: 'category', name: 'Авто' }, null), 0);
});
test('purgeTaxonomyPlan: категорія без використання — усі підкатегорії й слова (з каскадними); з використанням — блок; активна — блок', () => {
  const st = fresh();
  const p = J(ctx.purgeTaxonomyPlan({ kind: 'category', name: 'Тест1' }, st));
  assert.equal(p.exists, true); assert.equal(p.blocked, false);
  assert.equal(p.subCount, 1); assert.equal(p.wordCount, 2);
  assert.deepEqual(p.subCloudIds, ['s1']); assert.deepEqual(p.wordCloudIds, ['w1', 'w2']); assert.equal(p.cloudId, 'c1');
  const used = J(ctx.purgeTaxonomyPlan({ kind: 'category', name: 'Авто' }, st));
  assert.equal(used.blocked, true); assert.equal(used.usedBy, 1);
  const act = J(ctx.purgeTaxonomyPlan({ kind: 'category', name: 'Їжа' }, st));
  assert.equal(act.blocked, true); assert.equal(act.active, true);
  const sub = J(ctx.purgeTaxonomyPlan({ kind: 'subcategory', name: 'Тест-під', category: 'Тест1' }, st));
  assert.equal(sub.blocked, false); assert.equal(sub.wordCount, 1); assert.equal(sub.category, 'Тест1');
  assert.equal(J(ctx.purgeTaxonomyPlan({ kind: 'subcategory', name: 'Мийка', category: 'Авто' }, st)).blocked, true);
  assert.equal(J(ctx.purgeTaxonomyPlan({ kind: 'category', name: 'Нема' }, st)).exists, false);
});
test('purgeTaxonomyConfirmText і blocked-текст: форми, нулі, відмінювання', () => {
  const T = p => ctx.purgeTaxonomyConfirmText(p);
  assert.equal(T({ kind: 'category', name: 'X', subCount: 2, wordCount: 5 }), 'Категорія «X» буде видалена назавжди разом з 2 підкатегоріями й 5 словами. Це неможливо скасувати.');
  assert.equal(T({ kind: 'category', name: 'X', subCount: 1, wordCount: 1 }), 'Категорія «X» буде видалена назавжди разом з 1 підкатегорією й 1 словом. Це неможливо скасувати.');
  assert.equal(T({ kind: 'subcategory', name: 'Y', subCount: 0, wordCount: 3 }), 'Підкатегорія «Y» буде видалена назавжди разом з 3 словами. Це неможливо скасувати.');
  assert.equal(T({ kind: 'category', name: 'X', subCount: 0, wordCount: 0 }), 'Категорія «X» буде видалена назавжди. Це неможливо скасувати.');
  assert.equal(ctx.purgeTaxonomyBlockedText({ kind: 'category', usedBy: 3, active: false }), 'Цю категорію використовують 3 витрати. Змініть їхню категорію або видаліть їх, потім повторіть.');
  assert.match(ctx.purgeTaxonomyBlockedText({ kind: 'subcategory', usedBy: 11, active: false }), /використовують 11 витрат\./);
  assert.match(ctx.purgeTaxonomyBlockedText({ kind: 'category', usedBy: 21, active: false }), /використовує 21 витрата\./);
});
test('removeTaxonomyFromState: категорія з підкатегоріями й словами зникає, решта цілі; підкатегорія — лише вона й її слова; витрати не чіпаємо', () => {
  const st = fresh();
  const r = J(ctx.removeTaxonomyFromState(st, J(ctx.purgeTaxonomyPlan({ kind: 'category', name: 'Тест1' }, st))));
  assert.deepEqual(r, { subcategories: 1, words: 2 });
  assert.deepEqual(st.categories.map(c => c.name), ['Їжа', 'Авто']);
  assert.deepEqual(st.subcategories.map(x => x.name), ['Кафе', 'Мийка']);
  assert.deepEqual(st.dictionary.map(d => d.kw), ['w3', 'w4']);
  assert.equal(st.expenses.length, 3);
  const st2 = fresh();
  const r2 = J(ctx.removeTaxonomyFromState(st2, J(ctx.purgeTaxonomyPlan({ kind: 'subcategory', name: 'Тест-під', category: 'Тест1' }, st2))));
  assert.deepEqual(r2, { subcategories: 1, words: 1 });
  assert.ok(st2.categories.some(c => c.name === 'Тест1'));
  assert.deepEqual(st2.dictionary.map(d => d.kw), ['w2', 'w3', 'w4']);
  // після видалення категорії plan.exists=false: у списках, формах і автовизначенні її немає
  assert.equal(J(ctx.purgeTaxonomyPlan({ kind: 'category', name: 'Тест1' }, st)).exists, false);
});
test('filterPurgedTaxonomy: бекап не повертає видалені категорії/підкатегорії/слова; без cloudId не блокується', () => {
  const purged = [{ categoryIds: ['c1'], subcategoryIds: ['s1'], wordIds: ['w1', 'w2'] }];
  assert.deepEqual(J(ctx.filterPurgedTaxonomy([{ cloudId: 'c1' }, { cloudId: 'c9' }, { name: 'x' }], purged, 'categoryIds')).length, 2);
  assert.deepEqual(J(ctx.filterPurgedTaxonomy([{ cloudId: 'w1' }, { cloudId: 'w3' }], purged, 'wordIds')).map(x => x.cloudId), ['w3']);
  assert.deepEqual(J(ctx.filterPurgedTaxonomy(null, null, 'wordIds')), []);
});
// ---------- підключення ----------
test('pull: tombstone-рядок категорії/підкатегорії обробляється ДО LWW/зв’язування за назвою й до перевірки батька; select має deleted_at; reconcile за назвою — лише живі', () => {
  assert.match(SRC, /select\('id,name,active,type,created_at,updated_at,deleted_at'\)/);
  assert.match(SRC, /select\('id,name,category_id,active,deactivated_via,created_at,updated_at,deleted_at'\)/);
  const cat = SRC.slice(SRC.indexOf('async function pullCategoriesCore'), SRC.indexOf('async function pushSubcategoriesPilot'));
  assert.ok(cat.indexOf("pullTaxonomyTombstone('category'") < cat.indexOf('CATEGORIES.find(function(c){ return c.cloudId === row.id; })'));
  const sub = SRC.slice(SRC.indexOf('async function pullSubcategoriesCore'), SRC.indexOf('async function pullSubcategoriesPilot'));
  assert.ok(sub.indexOf("pullTaxonomyTombstone('subcategory'") < sub.indexOf('const parentCat'));
  assert.match(SRC, /from\('categories'\)\.select\('id'\)\.eq\('family_id', cloudFamilyId\)\.eq\('name', cat\.name\)\.is\('deleted_at', null\)\.maybeSingle\(\)/);
  assert.match(SRC, /from\('subcategories'\)\.select\('id'\)\.eq\('family_id', cloudFamilyId\)\.eq\('name', sub\.name\)\.is\('deleted_at', null\)\.maybeSingle\(\)/);
});
test('видалення: порядок Cloud-кроків слова → підкатегорії → категорія; блок до будь-якого Cloud-запиту; клієнт не робить DELETE категорій', () => {
  const i = SRC.indexOf('async function runTaxonomyPurge'), code = SRC.slice(i, SRC.indexOf('async function applyTaxonomyRemovalLocally', i));
  assert.ok(code.indexOf("from('dictionary').update") < code.indexOf("from('subcategories').update"));
  assert.ok(code.indexOf("from('subcategories').update") < code.indexOf("'categories' : 'subcategories'"));
  assert.ok(code.indexOf('plan.blocked') < code.indexOf("from('dictionary')"));
  assert.match(code, /deleted_via: plan\.kind/);
  assert.match(code, /catch\(err\)\{[\s\S]*?return;\s*\}/);
  assert.ok(code.indexOf("catch(err)") < code.indexOf('applyTaxonomyRemovalLocally(plan)'));
  assert.ok(!/from\('(categories|subcategories|dictionary)'\)\.delete/.test(code));
});
test('діалог і блок: purgeTrashItem блокує до діалогу, «Показати витрати» відкриває Журнал із фільтром; бекап-фільтри; журнал поза BACKUP_LS_KEYS', () => {
  assert.match(SRC, /if\(tplan\.blocked\)\{ showTaxonomyBlocked\(tplan\); return; \}/);
  assert.match(SRC, /journalSearchCategory = plan\.kind === 'category' \? plan\.name : plan\.category;/);
  assert.match(SRC, /backupList = filterPurgedTaxonomy\(backupList, readPurgedTaxonomy\(\), 'categoryIds'\)/);
  assert.match(SRC, /backupList = filterPurgedTaxonomy\(backupList, readPurgedTaxonomy\(\), 'subcategoryIds'\)/);
  assert.match(SRC, /backupList = filterPurgedTaxonomy\(backupList, readPurgedTaxonomy\(\), 'wordIds'\)/);
  const keys = SRC.slice(SRC.indexOf('const BACKUP_LS_KEYS = ['), SRC.indexOf('];', SRC.indexOf('const BACKUP_LS_KEYS = [')));
  assert.ok(!/PURGED/.test(keys));
});
test('рекордер: taxonomy-purge (kind, subcategories, words, blocked, usedBy) без назв; account-purge має monthsRemoved', () => {
  ['subcategories', 'words', 'blocked', 'usedBy', 'monthsRemoved'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
  const events = SRC.match(/type: 'taxonomy-purge'[^}]*\}/g) || [];
  assert.ok(events.length >= 2);
  events.forEach(e => assert.ok(!/name|title/.test(e), e));
  assert.match(SRC, /type: 'account-purge', kind: plan\.kind === 'card' \? 'bank' : 'installment', debts: res\.debts, monthsRemoved: res\.monthsRemoved/);
});
