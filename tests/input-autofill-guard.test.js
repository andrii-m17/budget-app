// Rev 2.32.216 (INPUT-AUDIT): охоронний тест реєстру полів вводу — кожне текстове поле має autocomplete, name без тире й слів-тригерів, id без слів-тригерів.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const TRIGGERS = ['name', 'phone', 'tel', 'mail', 'addr', 'user', 'login', 'first', 'last', 'fio', 'contact', 'card'];
const SKIP_TYPES = ['checkbox', 'radio', 'hidden', 'file', 'range', 'color', 'submit', 'button'];
const LOGIN_IDS = ['cldfielda1', 'cloud-password'];
function fields(){
  const out = [];
  const re = /<(input|textarea)\b([^>]*)>/g; let m;
  while((m = re.exec(SRC))){
    const a = m[2]; const get = k => { const r = new RegExp('\\b' + k + '="([^"]*)"').exec(a); return r ? r[1] : null; };
    const type = get('type');
    if(m[1] === 'input' && (!type || SKIP_TYPES.indexOf(type) !== -1)) continue; // у JS-шаблонах без type (напр. коментарі) — не поле
    out.push({ id: get('id') || '', name: get('name'), type, ac: get('autocomplete'), line: SRC.slice(0, m.index).split('\n').length });
  }
  return out;
}
test('реєстр статичних полів: autocomplete заданий; поля входу лише з username/current-password', function(){
  const list = fields();
  assert.ok(list.length >= 20, 'знайдено полів: ' + list.length);
  list.forEach(function(f){
    if(LOGIN_IDS.indexOf(f.id) !== -1){ assert.ok(f.ac === 'username' || f.ac === 'current-password', f.id); return; }
    assert.ok(f.ac === 'off', 'поле ' + f.id + ' (рядок ' + f.line + ') без autocomplete="off"');
  });
});
test('реєстр: id (статична частина) без слів-тригерів, name відсутній або без тире й слів-тригерів', function(){
  fields().forEach(function(f){
    const id = f.id.replace(/\$\{[^}]*\}/g, '').toLowerCase();
    TRIGGERS.forEach(function(t){ assert.ok(id.indexOf(t) === -1, 'id ' + f.id + ' містить «' + t + '»'); });
    if(f.name !== null){
      assert.ok(f.name.indexOf('-') === -1, 'name з тире: ' + f.name);
      TRIGGERS.forEach(function(t){ assert.ok(f.name.toLowerCase().indexOf(t) === -1, 'name ' + f.name + ' містить «' + t + '»'); });
    }
  });
});
test('жодного <form> довкола звичайних полів і contenteditable у розмітці', function(){
  assert.ok(!/^(?!\s*\/\/).*<form[\s>]/m.test(SRC), '<form> у розмітці');
  assert.ok(!/<[a-z]+[^>]*\scontenteditable=/.test(SRC), 'contenteditable у розмітці');
});
test('JS-фабрики input: кожна текстова проходить через applyFieldGuardAttrs; службові (перемикач, час, проміжне поле, зонд) — перелічені свідомо', function(){
  const sites = []; const re = /createElement\('input'\)/g; let m;
  while((m = re.exec(SRC))) sites.push(SRC.slice(m.index, m.index + 700));
  assert.equal(sites.length, 6);
  const guarded = sites.filter(s => /applyFieldGuardAttrs\(/.test(s.slice(0, 400)));
  assert.equal(guarded.length, 3, 'форма «Структури», поле «Інше» у «Перевірках» і поле часу — через фабрику');
  const service = sites.filter(s => /type = 'checkbox'|kb-focus-proxy|probe/.test(s.slice(0, 250)));
  assert.equal(service.length, 3);
});
test('applyFieldGuardAttrs: name не містить тире', function(){
  assert.match(SRC, /id\.indexOf\('-'\) === -1 && forbiddenInputAttr\(id\) === null\) input\.setAttribute\('name', id\)/);
  assert.ok(!/setAttribute\('name', 'x-'/.test(SRC));
});

test('Rev 2.32.222: підказки (placeholder/aria-label) без слів-тригерів, крім явних назв запису і справжнього входу; поля пошуку — type=search, enterkeyhint=search, name відсутній або q', function(){
  const WORDS = ['назв', 'name', 'phone', 'тел', 'mail', 'пошт', 'addr', 'адрес', 'user', 'login', 'contact', 'card'];
  const ALLOWED = ['Назва витрати', 'Назва'];
  const re = /<(input|textarea)\b([^>]*)>/g; let m; let searches = 0;
  while((m = re.exec(SRC))){
    const a = m[2]; const get = k => { const r = new RegExp('\\b' + k + '="([^"]*)"').exec(a); return r ? r[1] : null; };
    const id = get('id') || '';
    if(LOGIN_IDS.indexOf(id) !== -1) continue;
    ['placeholder', 'aria-label'].forEach(function(k){
      const v = get(k); if(!v || ALLOWED.indexOf(v) !== -1 || v.indexOf('${') !== -1) return;
      WORDS.forEach(function(w){ assert.ok(v.toLowerCase().indexOf(w) === -1, id + ' ' + k + '="' + v + '" містить «' + w + '»'); });
    });
    if(/пошук/i.test((get('placeholder') || '') + (get('aria-label') || ''))){
      searches++;
      assert.equal(get('type'), 'search', id); assert.equal(get('enterkeyhint'), 'search', id); assert.ok(get('name') === null || get('name') === 'q', id);
    }
  }
  assert.equal(searches, 2, 'пошук журналу й пошук слова');
});
