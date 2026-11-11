// KB-32 (Rev 2.32.287): стрілки iOS неактивні (tabindex=-1 на інших полях із відновленням) і Return «Далі».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function el(attrs){ const a = Object.assign({}, attrs); return { getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, removeAttribute: k => { delete a[k]; }, hasAttribute: k => k in a, _a: a }; }
test('відновлення tabindex: «немає» → атрибут прибрано; значення (0, -1) → повернуто; службовий атрибут знято', () => {
  const c = buildSandbox({}, ['kbNavRestore']);
  for(const [saved, want] of [['none', undefined], ['0', '0'], ['-1', '-1']]){
    const e = el({ tabindex: '-1', 'data-kb-ti': saved }); c.__e = e; evalInSandbox(c, 'kbNavRestore(__e)');
    assert.equal(e._a.tabindex, want); assert.equal('data-kb-ti' in e._a, false);
  }
  const plain = el({}); c.__e = plain; evalInSandbox(c, 'kbNavRestore(__e)'); assert.deepEqual(plain._a, {}, 'без службового атрибута нічого не змінюється');
});
test('охорона: lock при focusin, unlock при закритті клавіатури; Return: next/done; пароль, числові й розмітка з enterkeyhint не чіпаються; події enter-next/arrow-direct у білому списку; ретрансляторів немає', () => {
  assert.match(HTML, /kbHintsApply\(drawerEl\); kbNavLock\(drawerEl, target\); \} \/\/ Rev 2\.32\.287 \(KB-32\)/);
  assert.match(HTML, /kbNavUnlockAll\(\); \/\/ Rev 2\.32\.287 \(KB-32\): клавіатура закрита/);
  assert.match(HTML, /\(el\.type \|\| ''\)\.toLowerCase\(\) === 'password' \|\| \(el\.getAttribute\('inputmode'\) \|\| ''\)\.toLowerCase\(\) === 'numeric'/);
  assert.match(HTML, /if\(ek && !el\.hasAttribute\('data-kb-enter'\)\) return;/);
  assert.match(HTML, /focusWithoutScrollIfSupported\(next, host \? host\.id : null\)/);
  const i = HTML.indexOf('const REC_ALLOWED_TYPES = ['); const list = HTML.slice(i, HTML.indexOf('];', i));
  assert.ok(list.includes("'enter-next'") && list.includes("'arrow-direct'") && !list.includes("'relay-hop'") && !list.includes("'relay-state'"));
  assert.equal(/kb-relay-|kbRelay/.test(HTML), false, 'ретрансляторів у коді нема');
});
