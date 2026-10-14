// Rev 2.32.35 (K) — підбір категорії за ключовим словом у примітці шторки «Вхідних».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DICT = [{ kw: 'обід', cat: 'Харчування', sub: 'Обіди' }, { kw: 'таксі', cat: 'Транспорт', sub: 'Таксі' }, { kw: 'старе', cat: 'Інше', sub: '', deletedAt: 'x' }];
const pure = buildSandbox({}, ['keywordSuggestion', 'shouldApplyKeywordSuggestion']);
const j = function(v){ return JSON.parse(JSON.stringify(v)); };

test('keywordSuggestion: слово зі словника, регістр, видалене слово й неактивна категорія пропускаються', function(){
  assert.deepEqual(j(pure.keywordSuggestion('Велмарт ОБІД', DICT)), { cat: 'Харчування', sub: 'Обіди', kw: 'обід' });
  assert.equal(pure.keywordSuggestion('Велмарт', DICT), null);
  assert.equal(pure.keywordSuggestion('', DICT), null);
  assert.equal(pure.keywordSuggestion('старе', DICT), null);
  assert.equal(pure.keywordSuggestion('обід', DICT, function(){ return false; }), null);
});
test('shouldApplyKeywordSuggestion: ручний вибір і скасування блокують; однакове значення не застосовується', function(){
  const m = { cat: 'Харчування', sub: 'Обіди', kw: 'обід' };
  assert.equal(pure.shouldApplyKeywordSuggestion({ match: m, current: { cat: '', sub: '' } }), true);
  assert.equal(pure.shouldApplyKeywordSuggestion({ match: m, manualCat: true, current: {} }), false);
  assert.equal(pure.shouldApplyKeywordSuggestion({ match: m, manualSub: true, current: {} }), false);
  assert.equal(pure.shouldApplyKeywordSuggestion({ match: m, dismissed: true, current: {} }), false);
  assert.equal(pure.shouldApplyKeywordSuggestion({ match: m, current: { cat: 'Харчування', sub: 'Обіди' } }), false);
  assert.equal(pure.shouldApplyKeywordSuggestion({ match: null, current: {} }), false);
});

function env(){
  const els = { fldmono2: { value: 'Інше' }, fldmono3: { value: '' }, fldmono4: { value: '' }, 'mono-kw-hint': { classList: { off: true, toggle: function(c, on){ this.off = !!on; } } }, 'mono-kw-text': { textContent: '' } };
  const events = [];
  const g = {
    monoPickRefresh: function(){},
    document: { getElementById: function(id){ return els[id]; } }, DICTIONARY: DICT, getCategoryType: function(){ return 'expense'; },
    categoryOptionsHtml: function(){ return ''; }, subcategoryOptionsHtml: function(){ return ''; },
    debugRecordingActive: true, debugRecordingStartedAt: 0, performance: { now: function(){ return 1; } }, pushDebugEvent: function(e){ events.push(e); },
    monoKw: { manualCat: false, manualSub: false, dismissed: false, applied: null, prev: null, timer: null }, clearTimeout: clearTimeout,
  };
  const c = buildSandbox(g, ['keywordSuggestion', 'shouldApplyKeywordSuggestion', 'monoKwReset', 'monoKwShowHint', 'monoKwSetSelects', 'monoKeywordApply', 'monoKeywordUndo', 'onMonoDetailSubChange']);
  return { c, els, events };
}
test('нова примітка зі словом міняє категорію й підкатегорію, показує підказку; «Скасувати підбір» повертає попереднє', function(){
  const e = env();
  e.els.fldmono4.value = 'Велмарт обід'; e.c.monoKeywordApply();
  assert.equal(e.els.fldmono2.value, 'Харчування'); assert.equal(e.els.fldmono3.value, 'Обіди');
  assert.equal(e.els['mono-kw-text'].textContent, 'Підібрано за словом «обід»'); assert.equal(e.els['mono-kw-hint'].classList.off, false);
  e.c.monoKeywordUndo();
  assert.equal(e.els.fldmono2.value, 'Інше'); assert.equal(e.els.fldmono3.value, '');
  assert.equal(e.els['mono-kw-hint'].classList.off, true);
  e.els.fldmono4.value = 'знову обід'; e.c.monoKeywordApply(); // після скасування підбір вимкнений
  assert.equal(e.els.fldmono2.value, 'Інше');
});
test('ручний вибір не перезаписується; без слова підбору немає; подія без значень', function(){
  const e = env();
  e.c.onMonoDetailSubChange();
  e.els.fldmono4.value = 'обід'; e.c.monoKeywordApply();
  assert.equal(e.els.fldmono2.value, 'Інше');
  const e2 = env(); e2.els.fldmono4.value = 'Велмарт'; e2.c.monoKeywordApply();
  assert.equal(e2.els.fldmono2.value, 'Інше');
  assert.deepEqual(j(e2.events[0]), { t: 1, type: 'mono-keyword', matched: false });
});
test('слово зникло з примітки — значення до підбору повертаються', function(){
  const e = env();
  e.els.fldmono4.value = 'обід'; e.c.monoKeywordApply();
  e.els.fldmono4.value = 'щось інше'; e.c.monoKeywordApply();
  assert.equal(e.els.fldmono2.value, 'Інше'); assert.equal(e.els['mono-kw-hint'].classList.off, true);
});
test('охоронні: підказка екранується через textContent, затримка 250 мс, місце під підказку зарезервоване', function(){
  const a = SRC.indexOf('function monoKwShowHint'), b = SRC.indexOf('function monoKwSetSelects');
  assert.ok(!/innerHTML/.test(SRC.slice(a, b)));
  assert.match(SRC, /setTimeout\(monoKeywordApply, 250\)/);
  assert.match(SRC, /\.mono-kw-hint\{[^}]*min-height:28px/);
  assert.match(SRC, /\.mono-kw-hint\.off\{ visibility:hidden; \}/);
});
