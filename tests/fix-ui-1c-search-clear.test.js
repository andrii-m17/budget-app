// Rev 2.32.88 (FIX-UI-1c): «✕» у пошуку журналу лишається absolute (правило html:root :where(..){position:relative} має специфічність 0,1,1 і перебивало базове absolute).
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('є перебивання специфічності для .journal-search-clear (position:absolute)', function(){
  assert.match(SRC, /html:root \.journal-search-clear\{ position:absolute; \}/);
  const relIdx = SRC.indexOf('html:root :where(.struct-tab-btn');
  const absIdx = SRC.indexOf('html:root .journal-search-clear{ position:absolute; }');
  assert.ok(relIdx > 0 && absIdx > relIdx, 'absolute-правило має йти після position:relative');
});
test('база .journal-search-clear лишається absolute з right/top', function(){
  assert.match(SRC, /\.journal-search-clear\{ position:absolute; right:7px; top:50%;/);
});
