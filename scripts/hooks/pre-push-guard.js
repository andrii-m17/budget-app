#!/usr/bin/env node
// Гачок PreToolUse (Bash). Спрацьовує лише на `git push`:
//   1) node --test має проходити;
//   2) APP_VERSION (index.html) має входити в CACHE_NAME (sw.js);
//   3) у docs/ROADMAP.md має бути запис про поточну версію.
// Блокує через exit 2 (stderr бачить Claude). Ручний запуск: node scripts/hooks/pre-push-guard.js --manual
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MANUAL = process.argv.includes('--manual');

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch (_) { return ''; } }
function fail(msg) { process.stderr.write(String(msg).trim() + '\n'); process.exit(2); }
function grab(file, re) {
  try { const s = fs.readFileSync(path.join(ROOT, file), 'utf8'); const m = s.match(re); return m ? m[1] : null; }
  catch (_) { return null; }
}

function isPush() {
  if (MANUAL) return true;
  const raw = readStdin();
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    const cmd = (data && data.tool_input && data.tool_input.command) || '';
    return /(^|[;&|(\s])git\s+push\b/.test(cmd);
  } catch (_) { return false; }
}

if (!isPush()) process.exit(0);

// 1) Тести
const t = spawnSync(process.execPath, ['--test'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (t.status !== 0) {
  const lines = ((t.stdout || '') + '\n' + (t.stderr || '')).split('\n');
  const focus = lines.filter((l) => /not ok|✖|Error|fail/i.test(l)).slice(-25);
  fail('Push заблоковано: node --test не проходить.\n' + (focus.length ? focus : lines.slice(-25)).join('\n') +
       '\nВиправ тести (або поясни у звіті, чому падіння очікуване) і повтори push.');
}

// 2) Версії
const appVersion = grab('index.html', /APP_VERSION\s*=\s*['"`]([^'"`]+)['"`]/);
const cacheName = grab('sw.js', /CACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/);
if (!appVersion) {
  process.stderr.write('Попередження: APP_VERSION не знайдено в index.html; перевірку версій пропущено.\n');
} else {
  if (cacheName && !cacheName.includes(appVersion)) {
    fail('Push заблоковано: APP_VERSION (' + appVersion + ') не збігається з CACHE_NAME (' + cacheName + '). Онови обидва (навичка rev-release).');
  }
  // 3) ROADMAP
  let roadmap = '';
  try { roadmap = fs.readFileSync(path.join(ROOT, 'docs/ROADMAP.md'), 'utf8'); } catch (_) {}
  if (roadmap && !roadmap.includes(appVersion)) {
    fail('Push заблоковано: у docs/ROADMAP.md немає запису для ' + appVersion + '. Додай запис ревізії (навичка rev-release).');
  }
}

if (MANUAL) process.stdout.write('OK: тести зелені, версії узгоджені' + (appVersion ? ' (' + appVersion + ')' : '') + '.\n');
process.exit(0);
