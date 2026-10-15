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

// Економія (доповнення до K1): якщо в сесії вже понад ~40 викликів інструментів, нагадати про /clear.
// Рахуємо блоки tool_use у транскрипті (data.transcript_path); без транскрипту мовчимо.
const TOOL_CALLS_WARN = 40;
function sizeNotice() {
  try {
    if (!data.transcript_path) return '';
    const txt = fs.readFileSync(data.transcript_path, 'utf8');
    const n = (txt.match(/"type":\s*"tool_use"/g) || []).length;
    return n > TOOL_CALLS_WARN ? 'Сесія велика (' + n + ' викликів інструментів): після звіту зроби /clear.' : '';
  } catch (_) { return ''; }
}
function finish() {
  const msg = sizeNotice();
  if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg }));
  process.exit(0);
}

const st = spawnSync('git', ['status', '--porcelain', '--', 'index.html', 'sw.js', 'tests', 'scripts', '*.js'],
  { cwd: ROOT, encoding: 'utf8' });
if (st.status !== 0 || !String(st.stdout || '').trim()) finish();

const t = spawnSync(process.execPath, ['--test'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (t.status !== 0) {
  const lines = ((t.stdout || '') + '\n' + (t.stderr || '')).split('\n');
  const focus = lines.filter((l) => /not ok|✖|Error|fail/i.test(l)).slice(-20);
  process.stderr.write('Є незакомічені зміни коду, а node --test падає:\n' + (focus.length ? focus : lines.slice(-20)).join('\n') +
    '\nВиправ або явно опиши це у звіті (розділ «Не перевірено / ризики»).\n');
  process.exit(2);
}
finish();
