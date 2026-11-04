// E2E-CLOUD (Rev 2.32.243): конфігурація тестового проєкту Supabase з .env.test (файл у .gitignore, паролі заповнює власник) і REST-помічники від імені тестових користувачів.
// Запобіжники: адреса мусить бути ТЕСТОВИМ проєктом (ref нижче) і ніколи не робочим; без цього прогін падає до першого запиту.
const fs = require('node:fs');
const path = require('node:path');

const TEST_REF = 'tevelbrlyemgcrzgvcem';
const PROD_REF = 'nbykagbcvjryxiaxqwbk';
const PORT = Number(process.env.E2E_CLOUD_PORT || 8936); // порт, який index.html визнає тестовим сервером (TESTCLOUD_ORIGIN)
const ORIGIN = 'http://127.0.0.1:' + PORT;

function parseEnvFile(file){
  const out = {};
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(function(line){
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if(m && !/^\s*#/.test(line)) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  });
  return out;
}
function loadConfig(){
  const file = path.join(__dirname, '..', '..', '.env.test');
  if(!fs.existsSync(file)) throw new Error('Немає .env.test (див. .env.test.example): заповніть його самі.');
  const e = parseEnvFile(file);
  const need = ['TEST_SUPABASE_URL', 'TEST_SUPABASE_ANON_KEY', 'TEST_A_EMAIL', 'TEST_A_PASSWORD', 'TEST_B_EMAIL', 'TEST_B_PASSWORD'];
  const miss = need.filter(function(k){ return !e[k]; });
  if(miss.length) throw new Error('У .env.test не заповнено: ' + miss.join(', '));
  if(e.TEST_SUPABASE_URL.indexOf(PROD_REF) !== -1) throw new Error('ЗУПИНКА: .env.test вказує на РОБОЧИЙ проєкт. Прогін скасовано.');
  if(e.TEST_SUPABASE_URL !== 'https://' + TEST_REF + '.supabase.co') throw new Error('.env.test: адреса не збігається з тестовим проєктом ' + TEST_REF);
  return { url: e.TEST_SUPABASE_URL, key: e.TEST_SUPABASE_ANON_KEY, users: { A: { email: e.TEST_A_EMAIL, password: e.TEST_A_PASSWORD }, B: { email: e.TEST_B_EMAIL, password: e.TEST_B_PASSWORD } } };
}

async function signIn(cfg, who){
  const u = cfg.users[who];
  const r = await fetch(cfg.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: cfg.key, 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: u.password }) });
  if(!r.ok) throw new Error('Вхід тестового користувача ' + who + ' не вдався (' + r.status + '): перевірте .env.test');
  const j = await r.json();
  return { token: j.access_token, userId: j.user.id };
}
async function rest(cfg, session, method, table, query, body){
  const r = await fetch(cfg.url + '/rest/v1/' + table + (query ? '?' + query : ''), { method: method, headers: { apikey: cfg.key, authorization: 'Bearer ' + session.token, 'content-type': 'application/json', prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null; try{ data = text ? JSON.parse(text) : null; }catch(e){}
  return { ok: r.ok, status: r.status, data: data, text: text };
}
async function familyIdOf(cfg, session){
  const r = await rest(cfg, session, 'GET', 'family_members', 'select=family_id&user_id=eq.' + session.userId);
  if(!r.ok || !r.data || !r.data[0]) throw new Error('Тестовий користувач не належить до сім’ї');
  return r.data[0].family_id;
}
// Прибирання: усі дані синхронізованих таблиць тестової сім'ї, у порядку залежностей (від дітей до батьків). Лише звичайні запити від тестового користувача.
const CLEAN_ORDER = ['debts', 'expenses', 'incomes', 'hidden_entities', 'dictionary', 'subcategories', 'installment_accounts', 'bank_accounts', 'categories'];
async function cleanFamily(cfg, session, familyId){
  const failed = [];
  for(const t of CLEAN_ORDER){
    const r = await rest(cfg, session, 'DELETE', t, 'family_id=eq.' + familyId);
    if(!r.ok) failed.push(t + ' ' + r.status);
  }
  if(failed.length) throw new Error('Не вдалося прибрати дані тестової сім’ї: ' + failed.join(', '));
}
module.exports = { TEST_REF, PROD_REF, PORT, ORIGIN, loadConfig, signIn, rest, familyIdOf, cleanFamily };
