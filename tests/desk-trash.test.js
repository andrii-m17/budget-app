// Rev 2.32.143 (DESK-TRASH): кошик у журналі сповіщень стоїть на місці часу (без накладання і зсуву).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const rule = sel => { const m = SRC.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : ''; };
test('кошик абсолютний над зоною часу, без фону; час лише міняє opacity (розміри незмінні), плавно', function(){
  const t = rule('.notif-row-trash');
  assert.match(t, /position:absolute/); assert.match(t, /opacity:0/); assert.match(t, /transition:opacity/); assert.match(t, /background:transparent/);
  assert.match(SRC, /\.notif-row-time\{ transition:opacity \.15s ease; \}/);
  assert.match(SRC, /\.notif-row:hover \.notif-row-time\{ opacity:0; \}/);
  assert.ok(!/\.notif-row:hover \.notif-row-time\{[^}]*(display|width|margin|padding|visibility)/.test(SRC));
});
test('наведення лише для миші; фокус клавіатури дає той самий стан (кошик видимий, час сховано)', function(){
  assert.match(SRC, /@media \(hover:hover\) and \(pointer:fine\)\{ \.notif-row:hover \.notif-row-trash\{ opacity:1; pointer-events:auto; \}/);
  assert.match(rule('.notif-row-trash:focus-visible'), /opacity:1/);
  assert.match(SRC, /\.notif-row:has\(\.notif-row-trash:focus-visible\) \.notif-row-time\{ opacity:0; \}/);
  assert.match(SRC, /prefers-reduced-motion:reduce\)\{ \.notif-row-trash, \.notif-row-time\{ transition:none; \}/);
});
test('кнопка лишається <button> з aria-label і data-notif-delete', function(){
  assert.match(SRC, /<button type="button" class="notif-row-trash" data-notif-delete="' \+ id \+ '" aria-label="Видалити сповіщення">/);
});
