// Rev 2.32.243 (E2E-CLOUD) — режим «testcloud»: лише на http://127.0.0.1:8936 і лише з коректною адресою тестового проєкту з window.__TEST_CLOUD__; робочий проєкт ніколи. Синтетичні значення.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

const NAMES = ['WORK_ORIGINS', 'SS_KEY_PREVIEW_REALDB', 'SUPABASE_PROJECT_URL', 'TESTCLOUD_ORIGIN', 'readTestCloudConfig', 'isTestCloudConfigValid', 'detectCloudEnv'];
const PROD = 'https://andrii-m17.github.io';
const TC = { url: 'https://abcdefghij0123456789.supabase.co', key: 'k'.repeat(40) };
const c = buildSandbox({ window: {} }, NAMES);
const env = (origin, flag, cfg) => JSON.parse(JSON.stringify(c.detectCloudEnv(origin, flag, cfg)));

test('testcloud лише на 127.0.0.1:8936 з коректною конфігурацією', function(){
  assert.equal(env('http://127.0.0.1:8936', null, TC).env, 'testcloud');
  assert.equal(env('http://127.0.0.1:8935', null, TC).env, 'mock', 'порт звичайних E2E лишається на моку');
  assert.equal(env('http://localhost:8936', null, TC).env, 'mock');
  assert.equal(env('http://127.0.0.1:8936', null, null).env, 'mock', 'без конфігурації — мок');
});
test('адреса робочого проєкту або кривий формат не дають testcloud', function(){
  const prodUrl = c.SUPABASE_PROJECT_URL;
  assert.equal(env('http://127.0.0.1:8936', null, { url: prodUrl, key: TC.key }).env, 'mock', 'робочий проєкт заборонено');
  assert.equal(env('http://127.0.0.1:8936', null, { url: 'http://evil.example', key: TC.key }).env, 'mock');
  assert.equal(env('http://127.0.0.1:8936', null, { url: TC.url, key: 'x' }).env, 'mock');
});
test('робочий origin лишається робочим, навіть з конфігурацією', function(){
  assert.equal(env(PROD, null, TC).env, 'prod');
});
test('збірка (index.html, sw.js) не містить адреси чи ключів тестового проєкту', function(){
  const root = path.join(__dirname, '..');
  const SRC = fs.readFileSync(path.join(root, 'index.html'), 'utf8') + fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(!/tevelbrlyemgcrzgvcem/.test(SRC), 'ref тестового проєкту не має потрапляти в збірку');
  const envFile = path.join(root, '.env.test');
  if(fs.existsSync(envFile)){
    const m = /TEST_SUPABASE_ANON_KEY=(\S+)/.exec(fs.readFileSync(envFile, 'utf8'));
    if(m && m[1]) assert.ok(SRC.indexOf(m[1]) === -1, 'ключ тестового проєкту не має потрапляти в збірку');
  }
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\.env\.test$/m);
});
