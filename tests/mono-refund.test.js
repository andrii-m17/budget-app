// Rev 2.32.32 — облік повернень Monobank: чисті функції, охоронні перевірки розмітки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['MONO_MONTHS_GEN', 'MONO_CARD_TYPES', 'monoAccountLabel', 'monoAccountDetail', 'MONO_SKIP_LABELS', 'skipReasonLabel', 'monoFmtUah', 'inboxRowModel', 'refundWholeUah', 'refundConfirmText', 'refundConfirmLabel', 'refundRowActions', 'monoRefundOutcome']);

test('refundConfirmText: часткове повернення (40 − 25 → 15)', function(){
  assert.equal(c.refundConfirmText({ note: 'Bolt самокат', amount: 40 }, 25), 'Зменшити «Bolt самокат» з 40 ₴ до 15 ₴?');
  assert.equal(c.refundConfirmLabel({ amount: 40 }, 25), 'Врахувати');
});
test('refundConfirmText: повне повернення видаляє витрату; округлення до гривні', function(){
  assert.equal(c.refundConfirmText({ note: 'Bolt', amount: 25 }, 25.41), 'Повернення покриває всю суму. Видалити «Bolt»?');
  assert.equal(c.refundConfirmLabel({ amount: 25 }, 25), 'Видалити');
  assert.equal(c.refundWholeUah(25.41), 25);
  assert.equal(c.refundWholeUah(-25.6), 26);
});
test('refundRowActions: нові, повернення, решта', function(){
  assert.deepEqual(Array.from(c.refundRowActions({ status: 'new' })), ['add', 'ignore']);
  assert.deepEqual(Array.from(c.refundRowActions({ status: 'skipped', skip_reason: 'income_or_refund' })), ['refund', 'ignore']);
  assert.deepEqual(Array.from(c.refundRowActions({ status: 'skipped', skip_reason: 'cash' })), []);
  assert.deepEqual(Array.from(c.refundRowActions({ status: 'refunded' })), []);
  assert.deepEqual(Array.from(c.refundRowActions(null)), []);
});
test('refunded: позначка «Повернення враховано», потрапляє у «Пропущені»', function(){
  assert.equal(c.inboxRowModel({ id: 'a', status: 'refunded', amount_uah: 25, tx_time: new Date().toISOString() }, []).reason, 'Повернення враховано');
  assert.match(SRC, /q\.in\('status', \['skipped', 'ignored', 'refunded'\]\)/);
});
test('повернення показується зі знаком «+», витрати — «−»', function(){
  assert.match(c.inboxRowModel({ id: 'a', status: 'skipped', skip_reason: 'income_or_refund', amount_uah: 25, tx_time: new Date().toISOString() }, []).amount, /^\+25\s₴$/);
  assert.match(c.inboxRowModel({ id: 'a', status: 'new', amount_uah: 25, tx_time: new Date().toISOString() }, []).amount, /^−25\s₴$/);
});
test('monoRefundOutcome: коди помилок', function(){
  assert.equal(c.monoRefundOutcome(null).kind, 'ok');
  assert.equal(c.monoRefundOutcome({ code: '22023' }).kind, 'invalid');
  assert.equal(c.monoRefundOutcome({ code: 'P0002' }).kind, 'notfound');
  assert.equal(c.monoRefundOutcome({ message: 'x' }).kind, 'network');
});
test('охоронні: без мітки «в обробці», без p_amount, без нових полів вводу, тексти повернення не через innerHTML', function(){
  assert.ok(!/>в обробці</.test(SRC) && !/mono-pending/.test(SRC));
  const accept = SRC.match(/rpc\('mono_accept'[^\n]*/)[0];
  assert.ok(!/p_amount/.test(accept));
  assert.ok(!/id="fldmono5"/.test(SRC));
  const start = SRC.indexOf('async function monoRefundStart'), end = SRC.indexOf('async function monoDetailIgnore');
  assert.ok(!/innerHTML/.test(SRC.slice(start, end)));
  assert.match(SRC, /Не знайшли витрату цього торговця\. Додайте її вручну або проігноруйте\./);
  assert.match(SRC, /type: 'mono-refund'/);
});
