// Rev 2.32.141 (DESK-BADGE): бейдж непрочитаних на пункті «Сповіщення» бокової панелі.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function el(){ return { textContent: '', hidden: true, attrs: {}, classList: { toggle(c, on){ this.h = on; } }, setAttribute(k, v){ this.attrs[k] = v; }, getAttribute(k){ return this.attrs[k]; } }; }
function run(unread){
  const els = { 'notif-bell-count': el(), 'notif-bell-btn': el(), 'notif-side-count': el(), 'notif-side-tab': el() };
  const c = buildSandbox({ notifArchive: { unread }, document: { getElementById: id => els[id] || null } }, ['unreadBadge', 'updateNotifBell']);
  c.updateNotifBell(); return els;
}
test('0 — бейдж сховано; N — показано, 10+ → 9+', function(){
  let e = run(0); assert.equal(e['notif-side-count'].textContent, ''); assert.equal(e['notif-side-count'].classList.h, true);
  e = run(3); assert.equal(e['notif-side-count'].textContent, '3'); assert.equal(e['notif-side-count'].classList.h, false);
  assert.equal(e['notif-side-count'].textContent, e['notif-bell-count'].textContent);
  e = run(25); assert.equal(e['notif-side-count'].textContent, '9+');
});
test('розмітка: бейдж усередині пункту бокової панелі, тим самим класом, aria-hidden; aria-label пункту несе кількість', function(){
  const tab = SRC.match(/<button class="side-tab" onclick="openNotifArchive\(\)" id="notif-side-tab"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(tab, /class="notif-bell-count hidden" id="notif-side-count" aria-hidden="true"/);
  assert.equal(run(2)['notif-side-tab'].attrs['aria-label'], 'Сповіщення, непрочитаних: 2');
});
