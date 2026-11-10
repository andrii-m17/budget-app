// PUSH-2б: охорона джерела Edge Function send-push-notification v12 (Deno, у node не виконується): вибір формату, журнал, секрети не в репозиторії.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'send-push-notification', 'index.ts'), 'utf8');
test('v12: декларативний формат лише для mono-inbox, користувача з секрету й пристрою з app_visible === true', () => {
  assert.match(SRC, /type === "mono-inbox" && DECLARATIVE_USERS\.has\(userId\) && appVisible === true \? "declarative" : "legacy"/);
  assert.match(SRC, /Deno\.env\.get\("DECLARATIVE_PUSH_USERS"\)/);
  assert.match(SRC, /\.select\("id, endpoint, p256dh, auth, app_visible"\)/);
});
test('v12: формат повідомлення за ТЗ (web_push 8030, notification з navigate на #mono/<id>, верхні title/body/data)', () => {
  assert.match(SRC, /web_push: 8030/);
  assert.match(SRC, /navigate: `\$\{APP_URL\}#mono\/\$\{inboxTarget\(notifData\)\}`/);
  assert.match(SRC, /const APP_URL = "https:\/\/andrii-m17\.github\.io\/budget-app\/index\.html";/);
  assert.match(SRC, /lang: "uk",\s*\n\s*tag: "mono-inbox"/);
  assert.match(SRC, /\/\^\[A-Za-z0-9_-\]\{1,64\}\$\/\.test\(id\) \? id : "latest"/);
});
test('v12: журнал — format у statuses кожної підписки; TTL, urgency, видалення 410/404 без змін', () => {
  assert.equal((SRC.match(/format: formats\[i\]/g) || []).length, 2);
  assert.match(SRC, /err\.statusCode === 410 \|\| err\.statusCode === 404/);
  assert.match(SRC, /"mono-inbox": \{ ttl: 12 \* 3600, urgency: "high" \}/);
});
test('v12: у репозиторії немає значень секретів, id користувачів і email', () => {
  assert.doesNotMatch(SRC, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(SRC, /@gmail\.com|@proton|mailto:(?!noreply@example\.invalid)/);
});
