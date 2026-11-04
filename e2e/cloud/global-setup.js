// E2E-CLOUD: перед набором — перевірка конфігурації (тестовий, не робочий проєкт), вхід обох користувачів, одна сім'я, прибирання даних сім'ї.
const { loadConfig, signIn, familyIdOf, cleanFamily } = require('./env');
module.exports = async function(){
  const cfg = loadConfig();
  const a = await signIn(cfg, 'A'), b = await signIn(cfg, 'B');
  const fa = await familyIdOf(cfg, a), fb = await familyIdOf(cfg, b);
  if(fa !== fb) throw new Error('«Тест А» і «Тест Б» мусять бути в одній сім’ї');
  await cleanFamily(cfg, a, fa);
};
