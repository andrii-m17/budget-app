// STRUCT-3: захисна перевірка порядку завантаження скриптів і цілісності підключення. Падає (код 2), якщо:
//  1) оператор або ініціалізатор const/let у js/X.js під час завантаження звертається до імені з файлу, підключеного ПІЗНІШЕ (або з основного inline-скрипта), чи до const/let того ж файлу нижче за себе;
//  2) глобальне ім'я (функція, const, let, var, class) оголошене більше одного разу в index.html і js/*.js;
//  3) js/*.js (і css/*.css), підключений в index.html, відсутній в APP_SHELL у sw.js;
//  4) мітка ?v= у посиланні на скрипт/стиль не дорівнює APP_VERSION.
// Використання: node scripts/struct3-check-load.js  (також з scripts/hooks/pre-push-guard.js і tests/struct3-check-load.test.js)
'use strict';
const fs = require('fs'), path = require('path');
const { parseTop, loadNeeds, isTrivialInit } = require('./lib/jsscan.js');

// files = { index: текст index.html, sw: текст sw.js, js: { 'util-date.js': текст, … } }
function checkFiles(files){
  const out = [];
  const index = files.index, sw = files.sw || '';
  const version = (index.match(/const APP_VERSION = '([^']+)'/) || [])[1];
  const tags = Array.from(index.matchAll(/<script src="\.\/(js\/[A-Za-z0-9._-]+\.js)(\?v=([^"]*))?"><\/script>/g)).map(m => ({ rel: m[1], name: path.basename(m[1]), v: m[3], tag: m[0] }));
  const links = Array.from(index.matchAll(/<link rel="stylesheet" href="\.\/(css\/[A-Za-z0-9._-]+\.css)(\?v=([^"]*))?">/g)).map(m => ({ rel: m[1], v: m[3], tag: m[0] }));
  // 4) мітки версії
  tags.concat(links).forEach(t => { if(t.v !== version) out.push('4) мітка ?v= у «' + t.rel + '» (' + (t.v === undefined ? 'немає' : t.v) + ') не дорівнює APP_VERSION (' + version + ')'); });
  // 3) APP_SHELL
  const shell = (sw.match(/const APP_SHELL = \[([^\]]*)\]/) || [, ''])[1];
  tags.concat(links).forEach(t => { if(shell.indexOf("'./" + t.rel + "'") === -1) out.push('3) «' + t.rel + '» підключено в index.html, але його немає в APP_SHELL (sw.js)'); });
  // розбір: js-файли за порядком підключення, потім inline-скрипти
  const units = []; // { file, order, items }
  tags.forEach((t, i) => { const text = (files.js || {})[t.name]; if(text === undefined){ out.push('1) файл «' + t.rel + '» підключено в index.html, але не знайдено на диску'); units.push({ file: t.rel, order: i, items: [], src: '' }); } else units.push({ file: t.rel, order: i, items: parseTop(text), src: text }); });
  const inlineRe = /<script>([^]*?)<\/script>/g; let m; let k = 0; while((m = inlineRe.exec(index))){ units.push({ file: 'index.html (inline #' + (++k) + ')', order: tags.length, items: parseTop(m[1]), src: m[1] }); }
  // 2) дублікати + глобальна таблиця
  const table = new Map(); const decl = new Map();
  units.forEach(u => u.items.forEach(it => it.names.forEach(n => { (decl.get(n) || decl.set(n, []).get(n)).push(u.file + ':' + it.line); if(!table.has(n)) table.set(n, { kind: it.kind === 'fn' ? 'fn' : (it.kind === 'class' ? 'val' : 'val'), text: it.text, order: u.order, file: u.file, pos: it.line }); })));
  decl.forEach((where, n) => { if(where.length > 1) out.push('2) глобальне ім\'я «' + n + '» оголошене ' + where.length + ' рази: ' + where.join(', ')); });
  // 1) порядок завантаження (лише для js-файлів: їхні оператори й ініціалізатори виконуються до основного скрипта)
  units.filter(u => u.order < tags.length).forEach(u => {
    u.items.filter(it => it.kind === 'stmt' || ((it.kind === 'const' || it.kind === 'let' || it.kind === 'var') && !isTrivialInit(it))).forEach(it => {
      const needs = loadNeeds(it, table);
      needs.forEach((kind, n) => {
        const t = table.get(n); if(!t) return;
        if(t.order > u.order) out.push('1) ' + u.file + ':' + it.line + ' під час завантаження звертається до «' + n + '» з ' + t.file + ' (підключений пізніше)');
        else if(t.order === u.order && kind === 'val' && t.pos > it.line) out.push('1) ' + u.file + ':' + it.line + ' звертається до const/let «' + n + '» нижче за себе в тому ж файлі (рядок ' + t.pos + ')');
        else if(t.order === u.order && kind !== 'val' && t.kind === 'fn' && false) out.push('');
      });
    });
  });
  return out;
}
function checkRepo(root){
  root = root || path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const js = {}; const dir = path.join(root, 'js');
  if(fs.existsSync(dir)) fs.readdirSync(dir).filter(f => /\.js$/.test(f)).forEach(f => { js[f] = fs.readFileSync(path.join(dir, f), 'utf8'); });
  return checkFiles({ index, sw: fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), js });
}
module.exports = { checkFiles, checkRepo };
if(require.main === module){
  const r = checkRepo();
  if(r.length){ process.stderr.write('struct3-check-load: порушень ' + r.length + '\n' + r.map(x => '  ' + x).join('\n') + '\n'); process.exit(2); }
  console.log('struct3-check-load: OK (порядок завантаження, унікальність імен, APP_SHELL, мітки ?v=)');
}
