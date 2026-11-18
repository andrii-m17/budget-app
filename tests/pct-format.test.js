// Rev 2.32.394: відсотки з дробовою частиною на «Аналітиці» — українська десяткова кома й нерозривний пробіл перед «%» («31,8 %»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const ctx = ex.buildSandbox({}, ['fmtPercent1']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));
test('fmtPercent1: кома, нерозривний пробіл, ціле без дробу, симетричне округлення, нечислове — «—»', () => {
  [[31.8, '31,8 %'], [31.84, '31,8 %'], [31.85, '31,9 %'], [31, '31 %'], [31.04, '31 %'], [0, '0 %'], [100, '100 %'], [0.05, '0,1 %'], [-2.25, '-2,3 %'], [-0.04, '0 %'], [12.5, '12,5 %']].forEach(([v, w]) => assert.equal(j('fmtPercent1(' + v + ')'), w, String(v)));
  [null, undefined, NaN, Infinity, '', 'x'].forEach(v => assert.equal(j('fmtPercent1(' + (typeof v === 'string' ? JSON.stringify(v) : String(v)) + ')'), '—', String(v)));
  assert.ok(!/\./.test(j('fmtPercent1(31.8)')), 'без крапки');
});
test('у «Аналітиці» дробових відсотків із крапкою немає: висновки ідуть через fmtPercent1 (KPI «Звичка місяця» прибрано в Rev 2.32.395)', () => {
  const m = SRC.slice(SRC.indexOf("const summaryEl = document.getElementById('summary-container')"), SRC.indexOf('dashAfterRender(month);'));
  assert.ok(/fmtPercent1\(savings\/totalIncome\*100\)/.test(m) && /fmtPercent1\(Math\.abs\(savings\)\/totalIncome\*100\)/.test(m));
  assert.ok(!/toFixed\(1\)\}?%/.test(m), 'у висновках немає toFixed(1) + «%»');
  assert.ok(!SRC.includes('kpi-habit'), 'KPI «Звичка місяця» прибрано');
});
