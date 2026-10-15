#!/usr/bin/env node
// Гачок Stop: якщо є НЕзакомічені зміни коду, а node --test падає, не дає завершити роботу мовчки.
// Захист від зациклення: якщо Claude уже продовжує через цей гачок (stop_hook_active), пропускає.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) { data = {}; }
if (data.stop_hook_active) process.exit(0);

const st = spawnSync('git', ['status', '--porcelain', '--', 'index.html', 'sw.js', 'tests', 'scripts', '*.js'],
  { cwd: ROOT, encoding: 'utf8' });
if (st.status !== 0 || !String(st.stdout || '').trim()) process.exit(0);

const t = spawnSync(process.execPath, ['--test'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (t.status !== 0) {
  const lines = ((t.stdout || '') + '\n' + (t.stderr || '')).split('\n');
  const focus = lines.filter((l) => /not ok|✖|Error|fail/i.test(l)).slice(-20);
  process.stderr.write('Є незакомічені зміни коду, а node --test падає:\n' + (focus.length ? focus : lines.slice(-20)).join('\n') +
    '\nВиправ або явно опиши це у звіті (розділ «Не перевірено / ризики»).\n');
  process.exit(2);
}
process.exit(0);
