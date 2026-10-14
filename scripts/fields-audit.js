// Rev 2.32.31 (A) — статичний аудит текстових полів вводу (розмітка, JS-шаблони, createElement): атрибути, підпис, заголовок контейнера, класифікація.
// Запуск: node scripts/fields-audit.js [--md]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SKIP_TYPES = ['checkbox', 'radio', 'hidden', 'date', 'file', 'range', 'submit', 'button', 'color', 'time', 'month'];
// «сильні» слова, на які iOS реагує в id/name/placeholder/aria-label/підписі (укр. і англ.), «середні» і «слабкі»
const STRONG = ['name', 'phone', 'tel', 'mail', 'addr', 'address', 'user', 'login', 'first', 'last', 'fio', 'contact', "ім'я", 'імʼя', 'прізвище', 'телефон', 'пошта', 'адреса', 'контакт', 'користувач', 'логін', 'email'];
const MEDIUM = ['card', 'картка', 'картку', 'номер', 'number', 'pass', 'пароль', 'token', 'токен'];
const WEAK = ['назва', 'title', 'search', 'пошук', 'note', 'примітка', 'comment', 'коментар'];
function classify(f){
  const hay = [f.id, f.name, f.placeholder, f.aria, f.label].filter(Boolean).join(' | ').toLowerCase();
  const hit = list => list.filter(w => hay.indexOf(w) !== -1);
  const s = hit(STRONG), m = hit(MEDIUM), w = hit(WEAK);
  return { level: s.length ? 'сильне' : m.length ? 'середнє' : w.length ? 'слабке' : 'немає', words: s.concat(m, w) };
}
function fields(){
  const out = [];
  for(const m of SRC.matchAll(/<(input|textarea)\b([^>]*)>/g)){
    const attrs = m[2];
    const get = a => { const r = new RegExp('\\b' + a + '\\s*=\\s*"([^"]*)"').exec(attrs); return r ? r[1] : null; };
    const type = (get('type') || 'text').toLowerCase();
    if(m[1] === 'input' && SKIP_TYPES.includes(type)) continue;
    const lineStart = SRC.lastIndexOf('\n', m.index) + 1;
    if(/^\s*(\/\/|\*|<!--)/.test(SRC.slice(lineStart, m.index))) continue;
    const back = SRC.slice(Math.max(0, m.index - 600), m.index);
    const lm = [...back.matchAll(/<label[^>]*>([^<]*)</g)].pop();
    const sm = [...back.matchAll(/fld-label-like">([^<]*)</g)].pop();
    const id = get('id');
    const forLabel = id ? ((new RegExp('<label[^>]*\\bfor="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>([^<]*)<').exec(SRC)) || [])[1] : null;
    const heading = [...back.matchAll(/(?:class="(?:section-label|entry-title|mono-group-label|drawer-head-text)"[^>]*>|<h2[^>]*>)([^<]*)</g)].pop();
    const f = { tag: m[1], type, id: id, name: get('name'), autocomplete: get('autocomplete'), placeholder: get('placeholder'), aria: get('aria-label'), inputmode: get('inputmode'), enterkeyhint: get('enterkeyhint'),
      label: (forLabel || (sm && sm[1]) || (lm && lm[1]) || '').trim() || null, heading: heading ? heading[1].trim() : null, line: SRC.slice(0, m.index).split('\n').length, kind: 'розмітка' };
    f.class = classify(f);
    out.push(f);
  }
  // динамічно створені (createElement) — атрибути в наступних ~12 рядках
  for(const m of SRC.matchAll(/(?:const|let)\s+(\w+)\s*=\s*document\.createElement\('(input|textarea)'\);([\s\S]{0,700}?)(?=\n\s*\n|\n\s*(?:const|let|function)\b)/g)){
    const v = m[1], body = m[3];
    const set = k => { const r = new RegExp('\\b' + v + '\\.' + k + '\\s*=\\s*([^;]+);').exec(body); return r ? r[1].trim().replace(/^['"`]|['"`]$/g, '') : null; };
    const type = set('type') || 'text';
    if(SKIP_TYPES.includes(type)) continue;
    const aria = (new RegExp(v + "\\.setAttribute\\('aria-label',\\s*([^)]+)\\)").exec(body) || [])[1] || null;
    const f = { tag: m[2], type, id: set('id'), name: set('name'), autocomplete: set('autocomplete'), placeholder: set('placeholder'), aria: aria, inputmode: null, enterkeyhint: null, label: null, heading: null, line: SRC.slice(0, m.index).split('\n').length, kind: 'createElement' };
    f.class = classify(f);
    out.push(f);
  }
  return out;
}
module.exports = { fields, classify, STRONG, MEDIUM, WEAK };
if(require.main === module){
  const list = fields();
  if(process.argv.includes('--md')){
    console.log('| № | рядок | вид | id | name | type | autocomplete | placeholder | aria-label | підпис | заголовок | inputmode | рівень | слова |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    list.forEach((f, i) => console.log('| ' + [i + 1, f.line, f.kind, f.id, f.name, f.type, f.autocomplete, f.placeholder, f.aria, f.label, f.heading, f.inputmode, f.class.level, f.class.words.join(', ')].map(v => (v == null ? '' : String(v).replace(/\|/g, '/').replace(/\$\{[^}]*\}/g, '${…}'))).join(' | ') + ' |'));
  }else console.log(JSON.stringify(list, null, 1));
}
