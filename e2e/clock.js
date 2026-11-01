// Rev 2.32.229: детермінований «сьогодні» для всіх E2E: годинник сторінки фіксується на E2E_DAY-те число (за замовчуванням 15-те) поточного місяця, 12:00 за місцевим часом; далі час іде природно.
// Фікстури мока не містять записів новіших за «сьогодні» (див. generateFixture), тож результат не залежить від дня запуску. Перевірка: E2E_DAY=1 | 15 | 31 npm run e2e (31 обрізається до останнього дня місяця).
const day = Number(process.env.E2E_DAY || 15);
function fixedNow(){
  const n = new Date(), last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  return new Date(n.getFullYear(), n.getMonth(), Math.min(day, last), 12, 0, 0);
}
async function installClock(page){ await page.clock.install({ time: fixedNow() }); }
module.exports = { installClock, fixedNow };
