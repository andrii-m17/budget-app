// Rev 2.14.0 — допоміжний модуль для тестів фінансової логіки.
//
// index.html — не ES-модуль (весь код у звичайних <script> тегах, змінні й
// функції спільні через глобальну область), тому напряму зробити
// `require('../index.html')` не можна — та й не варто: файл виконує DOM-
// ініціалізацію (event listeners, localStorage, рендер) одразу при завантаженні,
// а ми хочемо перевіряти ЛИШЕ чисті розрахункові функції без браузера.
//
// Рішення: витягуємо джерело потрібної function-декларації прямо з index.html
// (пошук збалансованих фігурних дужок від "function ім'я(" до кінця тіла) і
// виконуємо цей рядок коду в ізольованому vm.context, куди самі підставляємо
// лише ті глобальні змінні/функції, від яких конкретна функція залежить
// (напр. масив `debts`, хелпер `isHiddenForMonth`). Це і є "викликати
// ізольовано" для функцій, що технічно лишаються частиною монолітного файлу —
// без рефакторингу самого застосунку.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE_PATH = path.join(__dirname, '..', 'index.html');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

// Повертає вихідний код однієї function-декларації (з тілом) за назвою.
function extractFunctionSource(fnName){
  const marker = `function ${fnName}(`;
  const start = SOURCE.indexOf(marker);
  if(start === -1){
    throw new Error(`extractFunctionSource: функцію "${fnName}" не знайдено в index.html — можливо, її перейменували/видалили. Онови tests/.`);
  }
  const braceOpen = SOURCE.indexOf('{', start);
  let depth = 0;
  let i = braceOpen;
  for(; i < SOURCE.length; i++){
    if(SOURCE[i] === '{') depth++;
    else if(SOURCE[i] === '}'){
      depth--;
      if(depth === 0){ i++; break; }
    }
  }
  if(depth !== 0){
    throw new Error(`extractFunctionSource: не вдалось знайти кінець тіла функції "${fnName}" (незбалансовані дужки).`);
  }
  return SOURCE.slice(start, i);
}

// Повертає вихідний код однієї top-level `const ІМ'Я = ...;` декларації
// (напр. UA_MONTHS) — на відміну від функцій, тут кінцем служить перший
// top-level ";", а не збалансована фігурна дужка, тому рахуємо глибину
// [](){} разом і ігноруємо ";" усередині рядкових літералів.
function extractConstSource(constName){
  const marker = `const ${constName} = `;
  const start = SOURCE.indexOf(marker);
  if(start === -1){
    throw new Error(`extractConstSource: константу "${constName}" не знайдено в index.html — можливо, її перейменували/видалили. Онови tests/.`);
  }
  let depth = 0;
  let i = start;
  let quote = null;
  for(; i < SOURCE.length; i++){
    const ch = SOURCE[i];
    if(quote){
      if(ch === '\\') { i++; continue; }
      if(ch === quote) quote = null;
      continue;
    }
    if(ch === '"' || ch === "'" || ch === '`'){ quote = ch; continue; }
    if(ch === '[' || ch === '(' || ch === '{') depth++;
    else if(ch === ']' || ch === ')' || ch === '}') depth--;
    else if(ch === ';' && depth === 0){ i++; break; }
  }
  return SOURCE.slice(start, i);
}

// Витягує кілька функцій/констант і виконує їх у одному vm.context разом із
// наданими глобальними змінними-заглушками (напр. { debts: [...] }).
// Повертає той самий context — виклик context.fnName(...) викликає РЕАЛЬНИЙ
// код з index.html. Ім'я з великої літери й ВСІМА ВЕЛИКИМИ (напр. UA_MONTHS)
// трактується як const-декларація, інакше — як function-декларація.
function buildSandbox(globals, names){
  const context = vm.createContext(Object.assign({}, globals));
  const source = names.map(name => {
    return /^[A-Z][A-Z0-9_]*$/.test(name) ? extractConstSource(name) : extractFunctionSource(name);
  }).join('\n\n');
  vm.runInContext(source, context, { filename: 'index.html (extracted)' });
  return context;
}

// Виконує довільний вираз усередині вже створеного sandbox-контексту —
// потрібно, коли тестові дані мають бути "рідними" для реалму vm.Context
// (напр. new Date(...) для функції, що робить `instanceof Date`, бо Date з
// головного реалму Node не пройде цю перевірку в іншому vm.Context).
function evalInSandbox(context, expr){
  return vm.runInContext(expr, context);
}

module.exports = { extractFunctionSource, extractConstSource, buildSandbox, evalInSandbox };
