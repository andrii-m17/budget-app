// Аналітика: SVG-графіки, дашборди, анімація появи, картки Row 4, поява «Обліку»
// Перенесено з index.html дослівно, без змін (Rev 2.32.348, STRUCT-3). Звичайний скрипт: функції й const/let лишаються глобальними; підключається в index.html перед основним <script>; оператори верхнього рівня цієї області лишились в основному скрипті.

/* ============ SVG-графіки (без зовнішніх бібліотек) ============ */
/* Кольори узгоджені з Design System v1.1 §2 / §12: дохід = info (синій),
   витрати = expense (нейтральний графіт, НЕ червоний — червоний лише для проблем). */
// Родовий відмінок назви місяця (той самий довідник, що й у setKpiTrend) - винесено
// в окрему функцію, щоб використовувати і в блоці "Ключові показники місяця" (Rev 1.5.8).
// Підпис тренду для верхніх KPI-карток.
function setKpiTrend(id, type, curr, prevVal, month, hasCurrentData){
  const el = document.getElementById(id);
  el.classList.remove('is-positive','is-negative');
  // Rev 2.1.1 — Debt Data Integrity, застосовано і тут: 0 ₴ через ВІДСУТНІСТЬ
  // записів за місяць — це не те саме, що фактичний нуль. Порівнювати таке з
  // минулим місяцем і показувати "-100%" оманливо, тому замінюємо на чесний
  // напис (той самий принцип, що для боргу, тільки без carry-forward).
  if(hasCurrentData === false){
    el.textContent = 'Немає даних за ' + UA_MONTHS[parseInt(month.slice(5),10)-1];
    return;
  }
  if(!prevVal || curr===prevVal){ el.textContent = '—'; return; }
  const increased = curr > prevVal;
  const pct = Math.abs((curr-prevVal)/prevVal*100).toFixed(1);
  // Rev #30 (6D.65) — "Баланс" (як і "Борг") — іменник в однині, тому
  // "Збільшився"/"Зменшився", не "Збільшились"/"Зменшились" (правильно
  // лише для множинних "Доходи"/"Витрати").
  const labels = (type==='debt' || type==='savings')
    ? (increased ? '▲ Збільшився' : '▼ Зменшився')
    : (increased ? '▲ Збільшились' : '▼ Зменшились');
  const positive = (type==='income' || type==='savings') ? increased : !increased;
  const prevMonthForms = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
  const prevMonth = prevMonthForms[parseInt(shiftMonth(month,-1).slice(5),10)-1];
  el.classList.add(positive ? 'is-positive' : 'is-negative');
  el.innerHTML = `<span class="trend-main">${labels} на ${pct}%</span><span class="trend-context">відносно ${prevMonth}</span>`;
}

// Міні-спарклайн (без сітки й підписів) для верхніх KPI-карток
function svgSparkline(values, colorVar){
  const W=100, H=26, pad=2;
  const max = Math.max(1, ...values), min = Math.min(0, ...values);
  const range = (max-min) || 1;
  const stepX = (W-2*pad) / ((values.length-1) || 1);
  const pts = values.map((v,i)=>{
    const x = pad + i*stepX;
    const y = H - pad - ((v-min)/range) * (H-2*pad);
    return [x, y];
  });
  const path = pts.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const points = pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.25" data-late fill="var(${colorVar})" stroke="var(--color-surface)" stroke-width=".75"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:100%; display:block;"><path data-draw pathLength="1" d="${path}" fill="none" stroke="var(${colorVar})" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>${points}</svg>`;
}

// Бейдж банку (Rev 1.6.3) — офіційні SVG-іконки, надані користувачем напряму
// (name_*__style_square.svg + Privat_BR_RGB_white.svg), вбудовані як є, без
// переробки контурів. id-и градієнтів/clipPath отримують унікальний суфікс на
// виклик, щоб уникнути колізій, якщо той самий банк зустрічається кілька разів.
let __bankIconSeq = 0;
// Rev 2.32.157 (ICON-NEUTRAL, рішення чату): логотип лише для відомих банків (Приват, Моно, ПУМБ, Sense, Райффайзен); інакше (невідома чи порожня назва) нейтральне коло з приглушеною іконкою: картка для боргів, календар з гривнею для ОЧ (ті самі форми, що в порожніх станах, EMPTY_STATE_ICONS). kind: 'card' (за замовчуванням) | 'installment'. Було: сірий квадрат з двома літерами назви. Ризик: назва «Моно…» чи «Приват…» і далі дає логотип за збігом підрядка (правило не змінювалось).
function bankIcon(name, size, block, kind){
  const s = size || 22;
  const lower = (name||'').toLowerCase();
  const uid = 'bi' + (__bankIconSeq++);
  // BugFix Rev 1.6.3: display:block на <svg> усередині інлайнового .t-name
  // розривав рядок і зносив назву банку на новий рядок — тепер inline-block +
  // vertical-align:middle тримають іконку й текст в одному рядку, а
  // margin-right:6px дає видимий відступ тексту після іконки.
  // Rev 2.30.0 (M4b) — block=true (аватар картки/шапка шторки): без margin-right й display:block прямо в style → CSS-правила .cdr-avatar/.drawer-head-icon більше не потребують !important.
  const wrapOpen = block
    ? `<svg width="${s}" height="${s}" viewBox="0 0 40 40" style="flex-shrink:0; display:block;">`
    : `<svg width="${s}" height="${s}" viewBox="0 0 40 40" style="flex-shrink:0; margin-right:6px; display:inline-block; vertical-align:middle;">`;
  const wrapClose = `</svg>`;

  if(lower.includes('приват')){
    return `${wrapOpen}
      <g clip-path="url(#${uid}-clip)">
        <path d="M32.7058 32H20.6827C20.6827 31.029 20.6922 30.0756 20.6803 29.1211C20.6636 27.7979 20.4866 26.4969 20.054 25.2395C19.0749 22.3911 17.0156 20.7497 14.1114 20.0511C12.5999 19.6871 11.061 19.6636 9.51861 19.6707C9.02784 19.673 8.53707 19.6707 8.03442 19.6707V8H32.7058V32ZM27.5985 27.0406V12.9771H13.1524V14.8521C20.3808 15.8595 24.6135 19.8421 25.6557 27.0417H27.5997L27.5985 27.0406Z" fill="#76AE42"/>
        <path d="M8 31.9909V22.625H17.649V31.9909H8Z" fill="black"/>
      </g>
      <defs><clipPath id="${uid}-clip"><rect width="24.7059" height="24" fill="white" transform="translate(8 8)"/></clipPath></defs>
    ${wrapClose}`;
  }
  if(lower.includes('моно')){
    return `${wrapOpen}
      <g clip-path="url(#${uid}-clip)">
        <path d="M33.219 0.0605469H6.75236C3.07046 0.0605469 0.0856934 3.04532 0.0856934 6.72721V33.2172C0.0856934 36.8991 3.07046 39.8839 6.75236 39.8839H33.219C36.9009 39.8839 39.8857 36.8991 39.8857 33.2172V6.72721C39.8857 3.04532 36.9009 0.0605469 33.219 0.0605469Z" fill="url(#${uid}-grad)"/>
        <path d="M13.3677 23.1069V18.6166C13.3677 17.3429 12.6857 16.7383 11.541 16.7383C10.5887 16.7383 9.76537 17.3043 9.40504 17.8703C9.17337 17.1626 8.59437 16.7383 7.68104 16.7383C6.7287 16.7383 5.90537 17.3299 5.64804 17.7033V16.8926H4.01404V23.1066H5.64804V18.9256C5.89237 18.5783 6.36871 18.1923 6.93471 18.1923C7.60371 18.1923 7.86104 18.604 7.86104 19.183V23.1066H9.5077V18.9126C9.73937 18.5779 10.2154 18.1919 10.7944 18.1919C11.4634 18.1919 11.721 18.6036 11.721 19.1826V23.1066L13.3677 23.1069ZM17.858 23.2613C15.8124 23.2613 14.5774 21.769 14.5774 19.9933C14.5774 18.2306 15.8124 16.7383 17.858 16.7383C19.9167 16.7383 21.1517 18.2306 21.1517 19.9933C21.1517 21.769 19.9167 23.2613 17.858 23.2613ZM17.858 21.8076C18.8747 21.8076 19.4534 20.971 19.4534 19.9933C19.4534 19.0283 18.8744 18.1923 17.858 18.1923C16.8414 18.1923 16.2754 19.0283 16.2754 19.9933C16.2754 20.9713 16.8417 21.8076 17.858 21.8076ZM28.1894 23.1069V18.7196C28.1894 17.5103 27.5334 16.7383 26.1694 16.7383C25.1527 16.7383 24.394 17.2273 23.995 17.7033V16.8926H22.361V23.1069H23.995V18.9256C24.265 18.5523 24.767 18.1923 25.4104 18.1923C26.105 18.1923 26.5554 18.4883 26.5554 19.3503V23.1069H28.1894ZM32.6924 23.2613C30.6467 23.2613 29.4117 21.769 29.4117 19.9933C29.4117 18.2306 30.6467 16.7383 32.6924 16.7383C34.751 16.7383 35.986 18.2306 35.986 19.9933C35.986 21.769 34.751 23.2613 32.6924 23.2613ZM32.6924 21.8076C33.709 21.8076 34.2877 20.971 34.2877 19.9933C34.2877 19.0283 33.7087 18.1923 32.6924 18.1923C31.6757 18.1923 31.1097 19.0283 31.1097 19.9933C31.1097 20.9713 31.676 21.8076 32.6924 21.8076Z" fill="white"/>
      </g>
      <defs>
        <linearGradient id="${uid}-grad" x1="20.4474" y1="0.533547" x2="20.4474" y2="39.3295" gradientUnits="userSpaceOnUse">
          <stop stop-color="#373B45"/><stop offset="1" stop-color="#181A1D"/>
        </linearGradient>
        <clipPath id="${uid}-clip"><rect width="40" height="40" fill="white"/></clipPath>
      </defs>
    ${wrapClose}`;
  }
  if(lower.includes('пумб')){
    return `${wrapOpen}
      <rect width="40" height="40" rx="10" fill="#E60C2A"/>
      <path d="M30.6658 20.8654C30.6658 21.8328 31.4553 22.4366 32.2913 22.4366C33.1582 22.4366 33.9167 21.8328 33.8933 20.9428C33.9167 20.0217 33.1348 19.418 32.2371 19.418C31.4011 19.4257 30.6968 19.9753 30.6658 20.8654ZM22.0899 24.0155H20.093V16.856H22.1131L23.9242 19.6347L25.7122 16.856H27.7323V24.0233H25.7354V20.1688L23.9242 22.8158L22.0899 20.1688V24.0155ZM15.2632 23.1254L12.144 16.856H14.3499L16.2694 20.6641L16.3468 20.4784L17.4769 16.856H19.706L17.4459 23.048C16.7338 25.1224 15.5573 26.1982 13.4598 26.2214V24.1471C14.5124 24.1471 15.0852 23.8607 15.271 23.1486V23.1254H15.2632ZM7.07432 24.0155H5V16.856H11.7415V24.0233H9.64398V18.7756H7.07432V24.0155ZM32.3996 24.387C30.271 24.387 28.4908 22.7075 28.4908 20.401C28.4908 18.0944 29.4893 16.4613 31.8268 15.4164C32.1906 15.2307 32.7711 15.0217 33.2432 14.6037C33.4289 14.4489 33.638 14.1858 33.7384 14L35.4723 15.0759C35.0775 16.1285 34.079 16.5155 33.1117 16.9102C32.1906 17.2508 31.3237 17.6223 30.9831 18.4582L31.0373 18.4814C31.5327 18.0325 32.2216 17.8236 32.9026 17.8236C34.528 17.8236 36.0528 19.1084 35.9986 20.9737C35.9444 23.3112 34.1024 24.387 32.3996 24.387Z" fill="white"/>
    ${wrapClose}`;
  }
  if(lower.includes('sense')){
    return `${wrapOpen}
      <defs><clipPath id="${uid}-clip"><rect width="40" height="40" rx="10"/></clipPath></defs>
      <g clip-path="url(#${uid}-clip)">
        <rect width="40" height="40" fill="#2923FF"/>
        <path d="M13.7432 22.2483C12.6724 22.2483 11.8765 21.5075 11.7738 20.4586H15.9877C16.4535 18.6029 15.4193 17.2129 13.5599 17.2129C11.9865 17.2129 10.6992 18.5699 10.6992 20.2312C10.6992 21.9513 12.0085 23.2496 13.7396 23.2496C15.0489 23.2496 16.0537 22.5784 16.5085 21.5515L15.6357 21.0051C15.3606 21.7459 14.7004 22.2483 13.7432 22.2483ZM13.5599 18.1811C14.5281 18.1811 15.0965 18.7496 15.0745 19.5931H11.8288C12.0232 18.7056 12.6613 18.1811 13.5599 18.1811Z" fill="white"/>
        <path d="M20.2016 17.2129C19.4388 17.2129 18.8006 17.565 18.3459 18.0564V17.3816H17.319V23.0772H18.3459V20.0809C18.3459 19.0796 19.028 18.2141 20.1466 18.2141C21.0818 18.2141 21.6392 18.8082 21.6392 19.6628V23.0809H22.6661V19.5711C22.6625 18.0527 21.7163 17.2129 20.2016 17.2129Z" fill="white"/>
        <path d="M32.231 23.2496C33.5403 23.2496 34.5452 22.5784 35 21.5515L34.1234 21.0051C33.8484 21.7459 33.1882 22.2483 32.231 22.2483C31.1601 22.2483 30.3642 21.5075 30.2616 20.4586H34.4755C34.9413 18.6029 33.9071 17.2129 32.0476 17.2129C30.4743 17.2129 29.187 18.5699 29.187 20.2312C29.1907 21.9513 30.4999 23.2496 32.231 23.2496ZM32.0476 18.1811C33.0158 18.1811 33.5843 18.7496 33.5623 19.5931H30.3166C30.511 18.7056 31.1491 18.1811 32.0476 18.1811Z" fill="white"/>
        <path d="M25.9815 18.1885C26.6417 18.1885 27.2101 18.3609 27.8629 18.8707L27.8923 18.7716L28.4387 17.279L27.5952 17.0039L27.4412 17.6127C27.0267 17.3963 26.5316 17.2203 25.9925 17.2203C24.6136 17.2203 23.8507 17.8584 23.8507 18.8156C23.8507 19.7618 24.6832 20.2276 25.9705 20.6384C27.0194 20.9574 27.3165 21.2655 27.3165 21.5626C27.3165 22.0393 26.8507 22.3144 26.1869 22.3144C25.3324 22.3144 24.6026 21.8817 24.2175 21.2215L23.4326 21.8706C23.9094 22.6445 24.8666 23.2606 26.1429 23.2606C27.6465 23.2606 28.3764 22.4648 28.3764 21.4599C28.3764 20.7998 27.9326 20.2533 26.2346 19.6922C25.4717 19.4318 24.9143 19.2814 24.9143 18.7936C24.9106 18.4416 25.149 18.1885 25.9815 18.1885Z" fill="white"/>
        <path d="M7.55256 18.1846C8.21271 18.1846 8.78115 18.357 9.43399 18.8667L9.46334 18.7677L10.0098 17.2751L9.16626 17L9.01221 17.6088C8.59779 17.3924 8.10269 17.2164 7.56357 17.2164C6.18459 17.2164 5.42176 17.8545 5.42176 18.8117C5.42176 19.758 6.25428 20.2237 7.54156 20.6345C8.59047 20.9535 8.88754 21.2616 8.88754 21.5587C8.88754 22.0355 8.42176 22.3105 7.75794 22.3105C6.90342 22.3105 6.17359 21.8777 5.78851 21.2176L5 21.8667C5.47677 22.6406 6.43398 23.2567 7.71027 23.2567C9.21392 23.2567 9.94377 22.4609 9.94377 21.456C9.94377 20.7958 9.50001 20.2494 7.80195 19.6883C7.03912 19.4279 6.48166 19.2775 6.48166 18.7897C6.48166 18.4377 6.72005 18.1846 7.55256 18.1846Z" fill="white"/>
      </g>
    ${wrapClose}`;
  }
  if(lower.includes('райф') || lower.includes('raif')){
    return `${wrapOpen}
      <defs><clipPath id="${uid}-clip"><rect width="40" height="40" rx="10"/></clipPath></defs>
      <g clip-path="url(#${uid}-clip)">
        <rect width="40" height="40" fill="#FFF200"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M12.9773 18.2667L8.99103 14.2787L7.91858 15.3461C7.96005 13.5074 8.7097 11.7556 10.0112 10.456C12.1342 8.39034 14.2505 9.59938 14.9806 10.3228L18.8202 14.1691L17.8675 15.1202L19.9584 17.2094L22.0477 15.1202L21.0967 14.1691L24.9379 10.3228C25.6697 9.59432 27.7894 8.38528 29.9074 10.4509C31.2096 11.75 31.9593 13.5021 32 15.3411L30.9326 14.2737L26.9395 18.2667L25.8401 17.169V14.5384L24.7119 15.6682V18.8485L23.1539 20.4049L31.2276 28.4787L28.0323 31.6826L19.9584 23.6003L11.8846 31.6742L8.6892 28.4703L16.763 20.4049L15.2066 18.8485V15.6716L14.0768 14.5384V17.169L12.9773 18.2667Z" fill="#2B2D33"/>
      </g>
    ${wrapClose}`;
  }

  return `<span class="bank-badge bank-badge-generic" aria-hidden="true" style="width:${s}px; height:${s}px;">${EMPTY_STATE_ICONS[kind === 'installment' ? 'calendar' : 'card']}</span>`;
}

// Заокруглений зверху прямокутник-колонка (Rev 1.5.10: GM використовує заокруглення лише
// зверху, а не з усіх боків - stroke/rect так не вміє, тому будуємо шлях вручну).
function roundedTopBarPath(x, y, w, h, r){
  if(h<=0) return '';
  r = Math.min(r, w/2, h);
  return `M${x.toFixed(1)},${(y+h).toFixed(1)} L${x.toFixed(1)},${(y+r).toFixed(1)} Q${x.toFixed(1)},${y.toFixed(1)} ${(x+r).toFixed(1)},${y.toFixed(1)} L${(x+w-r).toFixed(1)},${y.toFixed(1)} Q${(x+w).toFixed(1)},${y.toFixed(1)} ${(x+w).toFixed(1)},${(y+r).toFixed(1)} L${(x+w).toFixed(1)},${(y+h).toFixed(1)} Z`;
}
function svgBarChart(trendData, totalSlots){
  totalSlots = totalSlots || trendData.length || 1;
  const W=480, H=172, padL=38, padR=10, padT=16, padB=22;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const rawMax = Math.max(1, ...trendData.map(t=>Math.max(t.totalIncome,t.totalExpense)));
  const STEP=20000;
  const numSteps = Math.max(1, Math.ceil(rawMax/STEP));
  const axisMax = numSteps*STEP;
  const groupW = plotW/totalSlots;
  const barW = Math.min(17, groupW*0.28);
  let grid='', bars='';
  for(let i=0;i<=numSteps;i++){
    const val = STEP*i;
    const y = padT+plotH-(val/axisMax*plotH);
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--color-chart-grid)" stroke-width="1"/>`;
    grid += `<text x="${padL-8}" y="${(y+4).toFixed(1)}" font-size="12" font-weight="500" text-anchor="end" fill="var(--color-text-tertiary)">${val>=1000?Math.round(val/1000)+'k':Math.round(val)}</text>`;
  }
  trendData.forEach((t,i)=>{
    const gx = padL + i*groupW + groupW/2;
    const incH = t.totalIncome/axisMax*plotH, expH = t.totalExpense/axisMax*plotH;
    const incX = gx - barW - 3, expX = gx + 3;
    const incY = padT+plotH-incH, expY = padT+plotH-expH;
    bars += `<path class="dash-bar" d="${roundedTopBarPath(incX, incY, barW, incH, 6)}" fill="var(--color-success)"/>`;
    bars += `<path class="dash-bar" d="${roundedTopBarPath(expX, expY, barW, expH, 6)}" fill="var(--color-error)"/>`;
    if(t.totalIncome>0) bars += `<text data-late x="${(incX+barW/2).toFixed(1)}" y="${(incY-6).toFixed(1)}" font-size="12" text-anchor="middle" fill="var(--color-text-primary)" font-weight="600">${Math.round(t.totalIncome/1000)}k</text>`;
    if(t.totalExpense>0) bars += `<text data-late x="${(expX+barW/2).toFixed(1)}" y="${(expY-6).toFixed(1)}" font-size="12" text-anchor="middle" fill="var(--color-text-primary)" font-weight="600">${Math.round(t.totalExpense/1000)}k</text>`;
    bars += `<text x="${gx.toFixed(1)}" y="${H-8}" font-size="12" font-weight="500" text-anchor="middle" fill="var(--color-text-secondary)">${monthLabelShort(t.m)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block;">${grid}${bars}</svg>`;
}

function svgLineChart(debtTrend, totalSlots){
  // Rev 2.1.0 — Debt Data Integrity: debtTrend тепер несе прапорець .actual
  // (true = фактичний запис саме за цей місяць). Для місяців без факту НЕ
  // малюємо ані точку, ані підпис суми, ані з'єднувальний відрізок лінії —
  // справжній розрив замість carry-forward-фейку. Підпис місяця на осі X
  // лишається завжди, щоб розрив був видимий саме на своєму місці.
  totalSlots = totalSlots || debtTrend.length || 1;
  const W=480, H=172, padL=42, padR=12, padT=18, padB=22;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const vals = debtTrend.filter(t=>t.actual).map(t=>t.total);
  const rawMax = Math.max(1, ...vals, 0);
  const STEP=40000;
  const numSteps = Math.max(1, Math.ceil(rawMax/STEP));
  const axisMax = numSteps*STEP;
  const inset = 18;
  const usablePlotW = Math.max(0, plotW - inset*2);
  const stepX = usablePlotW/((totalSlots-1) || 1);
  let grid='', labels='';
  for(let i=0;i<=numSteps;i++){
    const val = STEP*i;
    const y = padT+plotH-(val/axisMax*plotH);
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--color-chart-grid)" stroke-width="1"/>`;
    grid += `<text x="${padL-8}" y="${(y+4).toFixed(1)}" font-size="12" font-weight="500" text-anchor="end" fill="var(--color-text-tertiary)">${val>=1000?Math.round(val/1000)+'k':Math.round(val)}</text>`;
  }
  const points = debtTrend.map((t,i)=>{
    const x = padL + inset + i*stepX;
    labels += `<text x="${x.toFixed(1)}" y="${H-8}" font-size="12" font-weight="500" text-anchor="middle" fill="var(--color-text-secondary)">${monthLabelShort(t.m)}</text>`;
    if(!t.actual) return { x, y:null, actual:false, total:t.total };
    const y = padT+plotH-(t.total/axisMax*plotH);
    return { x, y, actual:true, total:t.total };
  });
  // Будуємо шлях лише окремими сегментами між сусідніми ФАКТИЧНИМИ точками —
  // кожен розрив (не-факт) перериває поточний сегмент, новий сегмент
  // починається з наступної фактичної точки.
  // Rev 2.25.0 (M2) — кожен сегмент між фактичними точками тепер окремий <path data-draw> (раніше — один path з кількома "M"):
  // візуально те саме, але анімація "малювання" ніколи не з'єднує розриви (кожен сегмент малюється окремо).
  let segPaths = '', run = [];
  const flushRun = function(){ if(run.length>1) segPaths += `<path data-draw pathLength="1" d="${run.map((r,j)=>(j===0?'M':'L')+r.x.toFixed(1)+' '+r.y.toFixed(1)).join(' ')}" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`; run = []; };
  points.forEach(p=>{
    if(p.actual){ run.push(p); }
    else flushRun();
  });
  flushRun();
  let circles = '';
  points.forEach(p=>{
    if(!p.actual) return;
    circles += `<circle data-late cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#F59E0B" stroke="var(--color-surface)" stroke-width="2"/>`;
    if(p.total>0) labels += `<text data-late x="${p.x.toFixed(1)}" y="${(p.y-12).toFixed(1)}" font-size="12" text-anchor="middle" fill="var(--color-text-primary)" font-weight="600">${p.total>=1000?Math.round(p.total/1000)+'k':Math.round(p.total)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block;">${grid}
    ${segPaths}${circles}${labels}</svg>`;
}

// ===== Rev 2.25.0 (M2) / Rev 2.27.0 (M2.1) — дашборди «оживають» (docs/DESIGN_SYSTEM.md, ROADMAP 32.43, 32.45) =====
// Принцип: renderDashboard() малює КІНЦЕВИЙ стан (числа, SVG) синхронно; анімація — окремий шар поверх готового DOM, що не змінює дані й не відкладає їх.
// M2.1: (1) анімація при КОЖНОМУ візиті (режим dashboard-replay), (2) повільніше (токени --motion-chart/-bars/-count/-card), (3) початковий стан виставляється синхронно
// (ніякого "кадру готового дашборду"), (4) лінії/кільце/стовпчики малює rAF-цикл (inline-стилі), а не WAAPI по SVG-властивостях, (5) вузли SVG не замінюються, якщо data-sig не змінився.
const DASH_MAX_QUEUE = 8;          // найбільше карток у черзі появи
const DASH_STAGGER_MS = 40;        // типова розсинхронізація карток (× --motion-k)
const DASH_MAX_COUNTERS = 6;
const DASH_MAX_TOTAL_MS = 2200;    // стеля хореографії 
const DASH_REPLAY_SCALE = 0.7;     // повтор: лічильники/графіки коротші, ніж у першому показі
const DASH_UPDATE_SCALE = 0.4;     // оновлення змінених даних
// Rev 2.32.385 (DS-5a): числа балансу (kpi-savings) рухає одометр (odoRender), а доходи/витрати/обов'язкові/вільні тепер плитки картки «Сімейний баланс» без лічильників; лишається лише «Борг» (до DS-5b).
const DASH_COUNTER_IDS = []; // Rev 2.32.386 (DS-5b): «Борг» і «ОЧ» теж одометр (renderDebtOchTiles), лічильників M2 не лишилось
const DASH_CHART_HOSTS = []; // Rev 2.32.392 (DS-5d-1): графіки ряду 2 замінено карткою «Динаміка» (renderDynCard), хостів M2 не лишилось
// Rev 2.32.0 (F): тест card-reveal завершено — обрано «Стандартно»: тривалість появи однієї картки (d) і розсинхронізація між картками (s), мс при ×1.
const CARD_REVEAL = { d: 420, s: 40 };
function staggerDelay(i, k, max, step){
  const n = Math.max(1, Math.floor(max) || 1);
  const idx = Math.min(Math.max(0, Math.floor(i) || 0), n - 1);
  const kk = (typeof k === 'number' && isFinite(k) && k > 0) ? k : 1;
  const st = (typeof step === 'number' && isFinite(step) && step >= 0) ? step : DASH_STAGGER_MS;
  return Math.round(idx * st * kk);
}
// Ціле значення лічильника в момент t∈[0,1]: ease-out (cubic), завжди ціле, монотонне від from до to; t>=1 → точно to.
function countStep(from, to, t){
  if(!(t < 1)) return to;
  if(!(t > 0)) return from;
  const eased = 1 - Math.pow(1 - t, 3);
  return Math.round(from + (to - from) * eased);
}
// Стабільний підпис даних графіка (числа округлено до цілих; рядки — як є, напр. місяці) — повторний рендер із тими самими даними не замінює вузол.
function chartSignature(data){
  return JSON.stringify(data, function(key, v){ return typeof v === 'number' ? (isFinite(v) ? Math.round(v) : null) : v; });
}
// Тривалість і розсинхронізація появи картки (× k).
function cardRevealTiming(k){
  const kk = (typeof k === 'number' && isFinite(k) && k > 0) ? k : 1;
  return { duration: Math.round(CARD_REVEAL.d * kk), stagger: Math.round(CARD_REVEAL.s * kk) };
}
// Тривалість малювання: 'lines'/'ring' → --motion-chart, 'bars' → --motion-bars (× k); reduced ≤ 80 мс.
function chartDuration(kind, k, reduced){
  return motionDuration(kind === 'bars' ? 'bars' : 'chart', k, reduced);
}
// cubic-bezier(.22, 1, .36, 1) (крива графіків) — ease(t) для rAF-циклу; ease(0)=0, ease(1)=1, монотонна.
function bezierEase(t){
  if(!(t > 0)) return 0;
  if(!(t < 1)) return 1;
  const x1 = 0.22, y1 = 1, x2 = 0.36, y2 = 1;
  const bx = s => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
  const by = s => 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
  let lo = 0, hi = 1;
  for(let i = 0; i < 28; i++){ const mid = (lo + hi) / 2; if(bx(mid) < t) lo = mid; else hi = mid; }
  return by((lo + hi) / 2);
}
// Чи треба замінювати вузол графіка: немає попереднього підпису або він змінився. Той самий підпис → вузол лишається (інакше фоновий рендер обриває анімацію).
function shouldReplaceChart(prevSig, nextSig){
  return prevSig === undefined || prevSig === null || prevSig !== nextSig;
}
// Скільки карток лишити в черзі, щоб остання встигла завершитись у maxTotalMs; timing = cardRevealTiming().
function dashboardQueueSize(count, timing, maxItems, maxTotalMs){
  let n = Math.max(0, Math.min(count, maxItems));
  while(n > 1 && (n - 1) * timing.stagger + timing.duration > maxTotalMs) n--;
  return n;
}
// Рішення про режим: state = { trigger:'first'|'visit'|'month'|'update'|'render', hidden, reduced, active, played, sameMonth, changed }.
// → { mode:'full'|'replay'|'update'|'none', skipped: null|'reduced'|'hidden'|'no-change' }.
function dashboardReplayMode(state){
  const s = state || {};
  const none = reason => ({ mode: 'none', skipped: reason });
  if(s.trigger === 'render') return none('no-change'); // фоновий рендер (синхронізація/Realtime): статика
  if(s.reduced) return none('reduced');
  if(s.hidden || !s.active) return none('hidden');
  switch(s.trigger){
    case 'first': return s.played ? none('no-change') : { mode: 'full', skipped: null };
    case 'month': return { mode: 'full', skipped: null };
    case 'update': return s.changed ? { mode: 'update', skipped: null } : none('no-change');
    case 'visit':
      // Rev 2.31.0 (M4c): тест dashboard-replay завершено — «Щоразу» єдина поведінка: кожен візит перемальовується (replay); перший показ/інший місяць — full.
      if(!s.played || !s.sameMonth) return { mode: 'full', skipped: null };
      return { mode: 'replay', skipped: null };
  }
  return none('no-change');
}
// ===== Rev 2.28.0 (M2.2) — картки/графіки нижче першого екрана малюються, коли до них доскролили (IntersectionObserver), раз на візит =====
const CHART_REVEAL_DWELL_MS = 120; // скільки картка має ЗАЛИШАТИСЬ у видимій області (≥25%), перш ніж малюватись: швидке проскакування повз не запускає анімацію
const CHART_REVEAL_RATIO = 0.25;
// layout = { viewportH, cards:[{ id, top, bottom }] } → id карток, що цілком нижче першого екрана (top >= viewportH). Видимі (хоч частково) — перший екран, вище — вже проскролені.
function chartsBelowFold(layout){
  const l = layout || {};
  const vh = Number(l.viewportH);
  if(!(vh > 0) || !Array.isArray(l.cards)) return [];
  return l.cards.filter(c => c && Number(c.top) >= vh).map(c => c.id);
}
// 'draw' — малювати зараз; 'wait' — ще ні (не в області / замало часу в області); 'skip' — не малювати (вже намальовано, reduced, прихована сторінка).
// entry = { isIntersecting, intersectionRatio }, state = { revealed, reduced, hidden, dwellMs }.
function revealDecision(entry, state){
  const e = entry || {}, s = state || {};
  if(s.revealed || s.reduced || s.hidden) return 'skip';
  const inView = !!e.isIntersecting && Number(e.intersectionRatio || 0) >= CHART_REVEAL_RATIO;
  if(!inView) return 'wait';
  return Number(s.dwellMs || 0) >= CHART_REVEAL_DWELL_MS ? 'draw' : 'wait';
}
// Чи відкладати малювання нижче першого екрана: лише повна/повторна поява, не reduced, і лише якщо є IntersectionObserver (інакше — кінцевий стан одразу).
function shouldDeferChart(mode, reduced, hasObserver){
  return !!hasObserver && !reduced && (mode === 'full' || mode === 'replay');
}
const dashState = { played: false, seenMonth: null, seenNums: {}, seenSigs: {}, running: null, updatePending: false, enterAt: 0,
  deferred: { io: null, cards: new Map(), runners: new Set(), mode: 'full', scale: 1, trigger: 'first' } };
function setDashFinal(id, n){
  const el = document.getElementById(id);
  if(!el) return;
  if(typeof n === 'number' && isFinite(n)) el.dataset.final = String(Math.round(n)); else delete el.dataset.final;
}
// Замінює вміст графіка ЛИШЕ коли змінився підпис даних (або вузла ще нема). Зміна під час анімації: спершу finish() поточної → оновлення DOM → коротка анімація оновлення.
function setDashChart(id, data, build){
  const el = document.getElementById(id);
  if(!el) return;
  const sig = chartSignature(data);
  if(!shouldReplaceChart(el.dataset.sig, sig) && el.firstElementChild) return;
  if(dashState.running){ dashState.updatePending = true; finishDashboard(); }
  el.innerHTML = build();
  el.dataset.sig = sig;
}
function clearDashChart(id, html){
  const el = document.getElementById(id);
  if(!el) return;
  if(dashState.running){ dashState.updatePending = true; finishDashboard(); }
  el.innerHTML = html;
  delete el.dataset.sig;
}
function dashSnapshotFromDom(){
  const nums = {}, sigs = {};
  DASH_COUNTER_IDS.forEach(function(id){ const el = document.getElementById(id); if(el && el.dataset.final !== undefined) nums[id] = Number(el.dataset.final); });
  DASH_CHART_HOSTS.forEach(function(id){ const el = document.getElementById(id); if(el && el.dataset.sig !== undefined) sigs[id] = el.dataset.sig; });
  return { nums: nums, sigs: sigs };
}
function dashMarkSeen(month){
  const snap = dashSnapshotFromDom();
  dashState.seenNums = snap.nums; dashState.seenSigs = snap.sigs; dashState.seenMonth = month;
}
function dashChanged(){
  const snap = dashSnapshotFromDom();
  return JSON.stringify(snap.nums) !== JSON.stringify(dashState.seenNums) || JSON.stringify(snap.sigs) !== JSON.stringify(dashState.seenSigs);
}
function dashIsActive(){
  const v = document.getElementById('view-analytics');
  const body = document.getElementById('analytics-body');
  return lastActiveTab === 'analytics' && !!v && !v.classList.contains('hidden') && !!body && !body.classList.contains('hidden');
}
function dashStartupReady(){ return document.visibilityState === 'visible' && document.readyState === 'complete'; }
function recordDashSkip(reason, trigger){
  recordMotionPerf({ kind: 'dashboard-enter', tab: 'analytics', mode: 'none', skipped: reason, elements: 0, counters: 0, charts: 0, chartsAnimated: 0, chartsSkipped: 0, frames: 0, maxGapMs: 0, durationMs: 0,
    reduced: motionReduced(), repeat: dashState.played });
}
// Єдина точка рішення: рахує режим і (синхронно, ДО малювання кадру) стартує анімацію або фіксує причину пропуску. "Перший показ" витрачається ЛИШЕ коли анімація реально стартувала.
function dashRun(trigger, month, active){
  const d = dashboardReplayMode({ trigger: trigger, active: active, hidden: !dashStartupReady(), reduced: motionReduced(), played: dashState.played,
    sameMonth: dashState.seenMonth === month, changed: dashChanged() });
  if(d.mode === 'none'){
    if(trigger !== 'render') recordDashSkip(d.skipped, trigger);
    if(active && !dashState.running && d.skipped !== 'hidden') dashMarkSeen(month); // користувач бачить цей стан → наступне порівняння від нього
    return;
  }
  playDashboard(d.mode, trigger, month);
}
// Наприкінці кожного renderDashboard(): перший показ / зміна місяця / оновлення змінених даних — анімуємо; решта фонових рендерів — статика.
function dashAfterRender(month){
  const active = dashIsActive();
  let trigger = 'render';
  if(dashState.updatePending){ trigger = 'update'; dashState.updatePending = false; }
  else if(active && !dashState.running){
    if(!dashState.played) trigger = 'first';
    else if(dashState.seenMonth !== null && dashState.seenMonth !== month) trigger = 'month';
  }
  dashRun(trigger, month, active);
}
// Перехід на вкладку «Аналітика» (performSwitchTab, синхронно після показу вкладки): повна/коротка анімація залежно від варіанта dashboard-replay.
function onDashboardVisit(){
  dashRun('visit', selectedMonth, dashIsActive());
  recordStatusDots();
}
// Rev 2.31.5 (B2-lite) — подія status-dots при відкритті «Аналітики»: скільки крапок-статусів видно (KPI «Борг», кільце, «Борги по картках») і яка причина (той самий debtUiStatus), без назв і сум.
function recordStatusDots(){
  if(!debugRecordingActive || !selectedMonth) return;
  const dots = ['bal-debt-asof', 'bal-inst-asof'].filter(function(id){ const el = document.getElementById(id); return el && !el.classList.contains('hidden'); }).length;
  const st = debtUiStatus(debtAsOfInfo(selectedMonth, 'card'), selectedMonth, 'card');
  pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'status-dots', tab: 'analytics', dots: dots, reasons: { status: st.status, missingCards: missingCardDebtsForMonth(selectedMonth).length } });
}
// Перший показ при старті не втрачається: якщо сторінка була невидима/ще вантажилась — стартуємо, коли стала видимою й завантаженою.
function dashKick(){
  if(!selectedMonth || dashState.played || dashState.running || !dashIsActive()) return;
  requestAnimationFrame(function(){ if(!dashState.played && !dashState.running && dashIsActive()) dashRun('first', selectedMonth, true); });
}

function finishDashboard(){
  const r = dashState.running;
  if(r){ dashState.running = null; r.stop(false); }
}
function pathLengthSupported(){
  return typeof SVGGeometryElement !== 'undefined' && 'pathLength' in SVGGeometryElement.prototype;
}
// Прибирає очікування відкладених карток (новий візит/місяць): скасовує спостерігач і таймери, повертає картки в кінцевий стан, дозавершує незавершені малювання.
function dashClearDeferred(){
  const d = dashState.deferred;
  if(d.io){ try{ d.io.disconnect(); }catch(e){} d.io = null; }
  d.cards.forEach(function(st, card){
    if(st.timer) clearTimeout(st.timer);
    card.style.removeProperty('opacity'); card.style.removeProperty('transform');
  });
  d.cards.clear();
  d.runners.forEach(function(r){ r.stop(false); });
  d.runners.clear();
}
// Бігунок анімації: картки (WAAPI) + лічильники + елементи графіків (rAF, inline-стилі). Початковий стан — paint(0) синхронно ДО першого кадру. Без читань розмітки в циклі.
function makeDashRunner(onFinish, tabName){
  const runnerTab = tabName || 'analytics';
  const r = { cardAnims: [], counters: [], items: [], endAt: 0, charts: [], cards: 0, ended: false, frames: 0, maxGap: 0, startedAt: 0 };
  r.track = function(delay, dur){ if(delay + dur > r.endAt) r.endAt = delay + dur; };
  r.empty = function(){ return !r.cardAnims.length && !r.counters.length && !r.items.length; };
  function paint(ms){
    for(let i = 0; i < r.items.length; i++){
      const it = r.items[i];
      const p = Math.min(1, Math.max(0, (ms - it.delay) / it.dur));
      const st = it.el.style;
      if(it.kind === 'line' || it.kind === 'ring'){
        const e = bezierEase(p);
        if(it.kind === 'line') st.strokeDasharray = it.pl ? '1' : String(it.len);
        st.strokeDashoffset = String(it.len * (1 - e));
        st.opacity = String(it.op * Math.min(1, p * 10));
      }else if(it.kind === 'bar'){
        st.transform = 'scaleY(' + bezierEase(p) + ')';
      }else{
        st.opacity = String(p);
      }
    }
    for(let i = 0; i < r.counters.length; i++){
      const c = r.counters[i];
      if(!c.el.isConnected || c.el.dataset.final === undefined) continue;
      const t = (ms - c.delay) / c.dur;
      if(t >= 0) c.el.textContent = fmt(countStep(c.from, Number(c.el.dataset.final), t));
    }
  }
  r.stop = function(completed){
    if(r.ended) return;
    r.ended = true;
    r.cardAnims.forEach(function(a){ try{ a.cancel(); }catch(e){} });
    r.items.forEach(function(it){
      const st = it.el.style;
      st.removeProperty('stroke-dasharray'); st.removeProperty('stroke-dashoffset'); st.removeProperty('opacity'); st.removeProperty('transform');
    });
    r.counters.forEach(function(c){ if(c.el.isConnected && c.el.dataset.final !== undefined) c.el.textContent = fmt(Number(c.el.dataset.final)); });
    onFinish(completed, r, performance.now() - r.startedAt);
  };
  r.start = function(){
    paint(0);
    r.startedAt = performance.now();
    let lastT = r.startedAt;
    function tick(now){
      if(r.ended) return;
      if(lastActiveTab !== runnerTab){ r.stop(false); return; }
      r.frames++;
      const gap = now - lastT; if(gap > r.maxGap) r.maxGap = gap;
      lastT = now;
      const el = now - r.startedAt;
      paint(el);
      if(el >= r.endAt + 20){ r.stop(true); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };
  return r;
}
function playDashboard(mode, trigger, month){
  finishDashboard();
  if(!dashStartupReady() || !dashIsActive()) return;
  if(mode !== 'update') balReplay(); // Rev 2.32.385 (DS-5a): повторна поява картки «Сімейний баланс» (одометр від нуля, смуга днів)
  const body = document.getElementById('analytics-body');
  const k = motionK;
  const scale = mode === 'full' ? 1 : (mode === 'replay' ? DASH_REPLAY_SCALE : DASH_UPDATE_SCALE);
  const timing = cardRevealTiming(k);
  const seenNums = dashState.seenNums, seenSigs = dashState.seenSigs;
  const diag = debugRecordingActive;
  const plSupported = pathLengthSupported();
  const stats = { pathLenZero: 0, chartsSkipped: 0 };
  if(mode !== 'update'){ dashClearDeferred(); dashState.enterAt = performance.now(); }

  // Лічильник усередині кадру/одиниці: full — від 0 (або від баченого при зміні місяця), replay — від 0, update — лише змінені від баченого.
  function addCounter(r, el, delay){
    if(r.counters.length >= DASH_MAX_COUNTERS || el.dataset.final === undefined) return;
    const to = Number(el.dataset.final);
    let from = 0;
    if(mode === 'update' || (mode === 'full' && trigger === 'month')) from = typeof seenNums[el.id] === 'number' ? seenNums[el.id] : (mode === 'update' ? to : 0);
    if(from === to) return;
    const dur = Math.max(120, Math.min(Math.round(motionDuration('count', k, false) * scale), DASH_MAX_TOTAL_MS - delay));
    r.counters.push({ el: el, from: from, delay: delay, dur: dur });
    r.track(delay, dur);
    el.textContent = fmt(from);
  }
  // Графік-господар: лінії/кільце — dashoffset, стовпчики — scaleY, точки й підписи — opacity наприкінці.
  function addHost(r, host, base){
    const lineDur0 = Math.round(chartDuration('lines', k, false) * scale), barDur0 = Math.round(chartDuration('bars', k, false) * scale);
    const lineDur = Math.max(160, Math.min(lineDur0, Math.round((DASH_MAX_TOTAL_MS - base) / 1.3)));
    const barDur = Math.max(160, Math.min(barDur0, DASH_MAX_TOTAL_MS - base - 330));
    const lateDelay = base + Math.round(lineDur * 0.85), lateDur = Math.max(120, Math.round(lineDur * 0.3));
    let any = false;
    host.querySelectorAll('[data-draw]').forEach(function(path){
      const L = (path.getTotalLength ? path.getTotalLength() : 0);
      if(diag && !(L > 0)) stats.pathLenZero++;
      const dash = plSupported ? 1 : L;
      if(!(dash > 0)) return;
      const op = parseFloat(path.getAttribute('opacity'));
      r.items.push({ kind: 'line', el: path, delay: base, dur: lineDur, len: dash, pl: plSupported, op: isNaN(op) ? 1 : op });
      r.track(base, lineDur); any = true;
    });
    host.querySelectorAll('.dash-bar').forEach(function(bar, i){
      const d = base + staggerDelay(i, k, 12, 30) * (mode === 'update' ? 0 : 1);
      r.items.push({ kind: 'bar', el: bar, delay: d, dur: barDur });
      r.track(d, barDur); any = true;
    });
    host.querySelectorAll('[data-ring]').forEach(function(ring){
      const arc = parseFloat((ring.getAttribute('stroke-dasharray') || '').split(/[ ,]+/)[0]) || 0;
      if(!(arc > 0)) return;
      r.items.push({ kind: 'ring', el: ring, delay: base, dur: lineDur, len: arc, op: 1 });
      r.track(base, lineDur); any = true;
    });
    if(any){
      host.querySelectorAll('[data-late]').forEach(function(late){
        r.items.push({ kind: 'late', el: late, delay: lateDelay, dur: lateDur });
        r.track(lateDelay, lateDur);
      });
      r.charts.push(host.id);
    }
    return any;
  }
  // Одиниця = картка: її поява + лічильники й графіки всередині (однаково для першого екрана й для відкладеної появи).
  function addUnit(r, card, base){
    r.cardAnims.push(card.animate([
      { opacity: 0, transform: 'translateY(' + (12 * k) + 'px) scale(.985)' },
      { opacity: 1, transform: 'translateY(0px) scale(1)' }
    ], { duration: timing.duration, delay: base, easing: MOTION_EASE_OUT, fill: 'backwards' }));
    r.track(base, timing.duration);
    r.cards++;
    DASH_COUNTER_IDS.forEach(function(id){ const el = document.getElementById(id); if(el && card.contains(el)) addCounter(r, el, base); });
    DASH_CHART_HOSTS.forEach(function(id){
      const host = document.getElementById(id);
      if(!host || !card.contains(host) || host.dataset.sig === undefined) return;
      if(!addHost(r, host, base)) stats.chartsSkipped++;
    });
  }

  // ---- перший екран ----
  const mainRunner = makeDashRunner(function(completed, r, durationMs){
    if(dashState.running && dashState.running.stop === r.stop) dashState.running = null;
    dashState.played = true;
    dashMarkSeen(month);
    if(completed){
      recordMotionPerf({ kind: 'dashboard-enter', tab: 'analytics', mode: mode, skipped: null, elements: r.cards, counters: r.counters.length, charts: r.charts.length, chartsAnimated: r.charts.length, chartsSkipped: stats.chartsSkipped,
        deferredCharts: deferredCharts, pathLenZero: stats.pathLenZero, pathLengthAttr: plSupported,
        frames: r.frames, maxGapMs: Math.round(r.maxGap), durationMs: Math.round(durationMs), reduced: false, repeat: mode !== 'full' });
    }
  });
  let deferredCharts = 0;
  if(mode === 'update'){
    // оновлення змінених даних: лише змінені лічильники й графіки, без карток і без відкладення
    DASH_COUNTER_IDS.forEach(function(id){ const el = document.getElementById(id); if(el) addCounter(mainRunner, el, 0); });
    DASH_CHART_HOSTS.forEach(function(id){
      const host = document.getElementById(id);
      if(!host || host.dataset.sig === undefined) return;
      if(seenSigs[id] === host.dataset.sig){ stats.chartsSkipped++; return; }
      if(!addHost(mainRunner, host, 0)) stats.chartsSkipped++;
    });
  }else{
    const vh = window.innerHeight;
    const all = Array.from(body.querySelectorAll('.kpi-card, .card')).filter(function(el){ return !el.parentElement.closest('.kpi-card, .card'); });
    const rects = all.map(function(el, i){ const rc = el.getBoundingClientRect(); return { id: i, top: rc.top, bottom: rc.bottom }; }); // одне читання розмітки до старту
    let queue = all.filter(function(el, i){ return rects[i].bottom > 0 && rects[i].top < vh; });
    queue = queue.slice(0, dashboardQueueSize(queue.length, timing, DASH_MAX_QUEUE, DASH_MAX_TOTAL_MS));
    queue.forEach(function(el, i){ addUnit(mainRunner, el, Math.min(i, queue.length - 1) * timing.stagger); });
    // нижче першого екрана: початковий стан (opacity/transform — висота не змінюється) + IntersectionObserver; без нього — кінцевий стан одразу
    const below = chartsBelowFold({ viewportH: vh, cards: rects });
    if(below.length && shouldDeferChart(mode, false, typeof IntersectionObserver === 'function')){
      const d = dashState.deferred;
      d.mode = mode; d.scale = scale; d.trigger = trigger;
      d.io = new IntersectionObserver(onDashCardIntersect, { root: document.getElementById('main-col'), rootMargin: '0px 0px -10% 0px', threshold: [0, CHART_REVEAL_RATIO] });
      below.forEach(function(idx){
        const card = all[idx];
        card.style.opacity = '0'; card.style.transform = 'translateY(' + (12 * k) + 'px) scale(.985)';
        d.cards.set(card, { timer: null, ok: false });
        DASH_CHART_HOSTS.forEach(function(id){ const h = document.getElementById(id); if(h && card.contains(h) && h.dataset.sig !== undefined) deferredCharts++; });
        d.io.observe(card);
      });
    }
  }

  if(mainRunner.empty()){
    dashState.played = true; dashMarkSeen(month);
    if(!dashState.deferred.cards.size) recordDashSkip('no-change', trigger);
    return;
  }
  dashState.running = { stop: mainRunner.stop };
  mainRunner.start();
}
// IntersectionObserver: картка стала видимою ≥25% (rootMargin -10% знизу) → чекаємо CHART_REVEAL_DWELL_MS і, якщо вона досі в області, малюємо (раз на візит).
function onDashCardIntersect(entries){
  const d = dashState.deferred;
  entries.forEach(function(entry){
    const st = d.cards.get(entry.target);
    if(!st) return;
    st.ok = revealDecision(entry, { revealed: false, reduced: false, hidden: false, dwellMs: CHART_REVEAL_DWELL_MS }) === 'draw';
    if(st.ok && !st.timer){
      st.timer = setTimeout(function(){ st.timer = null; dashRevealCard(entry.target, 0); }, CHART_REVEAL_DWELL_MS);
    }else if(!st.ok && st.timer){
      clearTimeout(st.timer); st.timer = null; // проскочила повз — чекаємо, поки справді зупиниться в області
    }
  });
}
function dashRevealCard(card, attempt){
  const d = dashState.deferred;
  const st = d.cards.get(card);
  if(!st || !st.ok) return;
  if(!dashStartupReady() || !dashIsActive()){
    if(attempt < 20) st.timer = setTimeout(function(){ st.timer = null; dashRevealCard(card, attempt + 1); }, 250);
    return;
  }
  // Перевірка перед малюванням (одне читання розмітки, не в циклі анімації): IO-повідомлення можуть запізнюватись, тож переконуємось, що картка ДОСІ в області ≥25%.
  const root = document.getElementById('main-col');
  if(root){
    const rc = card.getBoundingClientRect(), rr = root.getBoundingClientRect();
    const visH = Math.min(rc.bottom, rr.bottom - rr.height * 0.1) - Math.max(rc.top, rr.top);
    if(!(rc.height > 0) || visH / rc.height < CHART_REVEAL_RATIO){ st.ok = false; return; }
  }
  d.cards.delete(card);
  if(d.io) d.io.unobserve(card);
  card.style.removeProperty('opacity'); card.style.removeProperty('transform');
  const k = motionK, scale = d.scale, mode = d.mode;
  const timing = cardRevealTiming(k);
  const plSupported = pathLengthSupported();
  const enterMs = Math.round(performance.now() - dashState.enterAt);
  const diag = debugRecordingActive;
  let pathLenZero = 0;
  const runner = makeDashRunner(function(completed, r, durationMs){
    d.runners.delete(r);
    if(completed){
      r.charts.forEach(function(id){
        recordMotionPerf({ kind: 'chart-reveal', chart: id, fromEnterMs: enterMs, frames: r.frames, maxGapMs: Math.round(r.maxGap), durationMs: Math.round(durationMs), pathLenZero: pathLenZero, pathLengthAttr: plSupported });
      });
    }
  });
  // та сама побудова, що й на першому екрані (тривалості, крива, лічильники, підписи)
  runner.cardAnims.push(card.animate([
    { opacity: 0, transform: 'translateY(' + (12 * k) + 'px) scale(.985)' },
    { opacity: 1, transform: 'translateY(0px) scale(1)' }
  ], { duration: timing.duration, delay: 0, easing: MOTION_EASE_OUT, fill: 'backwards' }));
  runner.track(0, timing.duration); runner.cards++;
  DASH_COUNTER_IDS.forEach(function(id){
    const el = document.getElementById(id);
    if(!el || !card.contains(el) || el.dataset.final === undefined || runner.counters.length >= DASH_MAX_COUNTERS) return;
    const to = Number(el.dataset.final);
    if(to === 0) return;
    const dur = Math.max(120, Math.round(motionDuration('count', k, false) * scale));
    runner.counters.push({ el: el, from: 0, delay: 0, dur: dur }); runner.track(0, dur); el.textContent = fmt(0);
  });
  DASH_CHART_HOSTS.forEach(function(id){
    const host = document.getElementById(id);
    if(!host || !card.contains(host) || host.dataset.sig === undefined) return;
    const lineDur = Math.max(160, Math.round(chartDuration('lines', k, false) * scale)), barDur = Math.max(160, Math.round(chartDuration('bars', k, false) * scale));
    const lateDelay = Math.round(lineDur * 0.85), lateDur = Math.max(120, Math.round(lineDur * 0.3));
    let any = false;
    host.querySelectorAll('[data-draw]').forEach(function(path){
      const L = path.getTotalLength ? path.getTotalLength() : 0;
      if(diag && !(L > 0)) pathLenZero++;
      const dash = plSupported ? 1 : L; if(!(dash > 0)) return;
      const op = parseFloat(path.getAttribute('opacity'));
      runner.items.push({ kind: 'line', el: path, delay: 0, dur: lineDur, len: dash, pl: plSupported, op: isNaN(op) ? 1 : op }); runner.track(0, lineDur); any = true;
    });
    host.querySelectorAll('.dash-bar').forEach(function(bar, i){
      const d2 = staggerDelay(i, k, 12, 30);
      runner.items.push({ kind: 'bar', el: bar, delay: d2, dur: barDur }); runner.track(d2, barDur); any = true;
    });
    host.querySelectorAll('[data-ring]').forEach(function(ring){
      const arc = parseFloat((ring.getAttribute('stroke-dasharray') || '').split(/[ ,]+/)[0]) || 0; if(!(arc > 0)) return;
      runner.items.push({ kind: 'ring', el: ring, delay: 0, dur: lineDur, len: arc, op: 1 }); runner.track(0, lineDur); any = true;
    });
    if(any){
      host.querySelectorAll('[data-late]').forEach(function(late){ runner.items.push({ kind: 'late', el: late, delay: lateDelay, dur: lateDur }); runner.track(lateDelay, lateDur); });
      runner.charts.push(id);
    }
  });
  d.runners.add(runner);
  runner.start();
}
// ===== Rev 2.29.0 (A) — поява «Обліку» (підсумки, рядки списків, сегменти); спільні makeDashRunner/IntersectionObserver із «Аналітикою» (M2.x) =====
const ACCT_COUNTER_IDS = ['income-summary-total', 'card-debt-summary-balance', 'card-debt-summary-minpay', 'installment-balance-total-value', 'installment-total-value'];
const ACCT_TABLE_IDS = ['income-table', 'bank-debt-table', 'installment-table'];
const ACCT_MAX_ROWS = 10;          // перші видимі рядки з'являються по черзі
const ACCT_ROW_STAGGER_MS = 25;    // × --motion-k
// visible = індекси видимих рядків у порядку DOM → перші max (решта видимих — без анімації, нижче екрана — відкладені IO).
function rowsToAnimate(visible, max){
  const v = Array.isArray(visible) ? visible : [];
  return v.slice(0, Math.max(0, Math.floor(max) || 0));
}
// Той самий вибір режиму, що й для «Аналітики»: full/replay/update/none + причина пропуску.
function accountRevealPlan(state){ return dashboardReplayMode(state); }
// Rev 2.31.0 (M4c) — перемикання сегментів «Обліку» (Доходи/Борги/ОЧ) запускає ту саму хореографію replay: підсумок і рядки по черзі, суми від 0; старий сегмент коротко гасне.
const ACCT_SEGMENTS = ['data', 'debts', 'installments'];
const ACCT_SEGMENT_NAMES = { data: 'income', debts: 'debts', installments: 'installments' };
function shouldAnimateSegment(prev, next, reduced){
  return !reduced && prev !== next && ACCT_SEGMENTS.indexOf(prev) !== -1 && ACCT_SEGMENTS.indexOf(next) !== -1;
}
// → { run, mode, skipped, elements } ; повторний клік на активний сегмент ('same') нічого не анімує і не пишеться в рекордер.
function accountSegmentPlan(prev, next, state){
  const s = state || {};
  const no = reason => ({ run: false, mode: 'none', skipped: reason, elements: [] });
  if(prev === next) return no('same');
  if(ACCT_SEGMENTS.indexOf(prev) === -1 || ACCT_SEGMENTS.indexOf(next) === -1) return no('no-change');
  if(s.reduced) return no('reduced');
  if(s.hidden || !s.active) return no('hidden');
  return { run: true, mode: 'replay', skipped: null, elements: ['summary', 'label', 'rows', 'counters-from-zero'] };
}
// Підмітальник натискань: .is-pressed лишився на елементі, що НЕ відстежується активним натисканням, і минуло ≥300 мс від відпускання → зняти.
// info = { pressed, tracked, sinceMs }.
function shouldSweepPress(info, nowMs){
  const i = info || {};
  return !!i.pressed && !i.tracked && (nowMs - Number(i.sinceMs || 0)) >= 300;
}
const acctState = { played: false, seenMonth: null, seenNums: {}, seenSigs: {}, running: null, enterAt: 0,
  deferred: { io: null, rows: new Map(), runners: new Set() } };
function acctHash(str){ let h = 5381; for(let i = 0; i < str.length; i++){ h = ((h << 5) + h + str.charCodeAt(i)) | 0; } return String(h >>> 0); }
// Таблиці «Обліку» перемальовуються тільки при зміні вмісту (інакше фоновий рендер замінював би рядки й обривав анімацію); зміна під час анімації → спершу finish().
const ACCT_NATIVE_INNER_HTML = (typeof Element !== 'undefined') ? Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML') : null;
function acctGuardedSetHtml(el, value){
  if(el.__acctHtml === value && el.firstChild) return;
  if(acctState.running) finishAccount();
  acctState.deferred.rows.forEach(function(st, row){ if(el.contains(row)){ if(st.timer) clearTimeout(st.timer); if(acctState.deferred.io) acctState.deferred.io.unobserve(row); acctState.deferred.rows.delete(row); } });
  ACCT_NATIVE_INNER_HTML.set.call(el, value);
  el.__acctHtml = value;
}
function acctInstallGuards(){
  if(!ACCT_NATIVE_INNER_HTML || !ACCT_NATIVE_INNER_HTML.set) return;
  ACCT_TABLE_IDS.forEach(function(id){
    const el = document.getElementById(id);
    if(!el || el.__acctGuarded) return;
    el.__acctGuarded = true;
    Object.defineProperty(el, 'innerHTML', { configurable: true, get: function(){ return ACCT_NATIVE_INNER_HTML.get.call(el); }, set: function(v){ acctGuardedSetHtml(el, v); } });
  });
}
function acctSnapshot(){
  const nums = {}, sigs = {};
  ACCT_COUNTER_IDS.forEach(function(id){ const el = document.getElementById(id); if(el && el.dataset.final !== undefined) nums[id] = Number(el.dataset.final); });
  ACCT_TABLE_IDS.forEach(function(id){ const el = document.getElementById(id); if(el) sigs[id] = acctHash(el.__acctHtml || ''); });
  return { nums: nums, sigs: sigs };
}
function acctMarkSeen(month){ const sn = acctSnapshot(); acctState.seenNums = sn.nums; acctState.seenSigs = sn.sigs; acctState.seenMonth = month; }
function acctChanged(){ const sn = acctSnapshot(); return JSON.stringify(sn.nums) !== JSON.stringify(acctState.seenNums) || JSON.stringify(sn.sigs) !== JSON.stringify(acctState.seenSigs); }
function acctIsActive(){
  const v = document.getElementById('view-accounting');
  return lastActiveTab === 'accounting' && !!v && !v.classList.contains('hidden');
}
function acctPanel(){ return document.querySelector('#view-accounting .struct-tab-panel:not(.hidden):not([data-seg-leaving])'); } // Rev 2.31.0: панель, що гасне (fade-out), не вважається активною
function acctSelector(el){ return el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList && el.classList[0] ? '.' + el.classList[0] : '')) : ''; }
function recordAcctSkip(reason, trigger, segment){
  recordMotionPerf({ kind: 'account-enter', tab: 'accounting', mode: 'none', skipped: reason, elements: 0, counters: 0, rows: 0, frames: 0, maxGapMs: 0, durationMs: 0, reduced: motionReduced(), trigger: trigger || 'tab', segment: segment || acctSegmentName(acctPanel()) });
}
function acctRun(trigger, month, active){
  const d = accountRevealPlan({ trigger: trigger, active: active, hidden: !dashStartupReady(), reduced: motionReduced(), played: acctState.played,
    sameMonth: acctState.seenMonth === month, changed: acctChanged() });
  if(d.mode === 'none'){
    if(trigger !== 'render') recordAcctSkip(d.skipped, 'tab');
    if(active && !acctState.running && d.skipped !== 'hidden') acctMarkSeen(month);
    return;
  }
  playAccount(d.mode, trigger, month);
}
// Наприкінці кожного renderAll(): перший показ (активна вкладка, ще не грали) / зміна місяця — анімуємо; решта фонових рендерів — лише оновлюємо «бачене».
function acctAfterRender(){
  acctInstallGuards();
  const active = acctIsActive();
  let trigger = 'render';
  if(active && !acctState.running){
    if(!acctState.played) trigger = 'first';
    else if(acctState.seenMonth !== null && acctState.seenMonth !== selectedMonth) trigger = 'month';
  }
  acctRun(trigger, selectedMonth, active);
}
function onAccountVisit(){ acctFinishSegFade(); acctInstallGuards(); acctRun('visit', selectedMonth, acctIsActive()); recordIncompleteDots(); }
function finishAccount(){ const r = acctState.running; if(r){ acctState.running = null; r.stop(false); } }
function acctClearDeferred(){
  const d = acctState.deferred;
  if(d.io){ try{ d.io.disconnect(); }catch(e){} d.io = null; }
  d.rows.forEach(function(st, row){ if(st.timer) clearTimeout(st.timer); row.style.removeProperty('opacity'); row.style.removeProperty('transform'); });
  d.rows.clear();
  d.runners.forEach(function(r){ r.stop(false); });
  d.runners.clear();
}
function acctSegmentName(panel){ const id = panel && panel.id ? panel.id.replace('acct-tab-panel-', '') : ''; return ACCT_SEGMENT_NAMES[id] || null; }
// Старий сегмент гасне коротко (--motion-s): його панель на час fade лишається видимою, знята з потоку (position:absolute у тому самому місці), тож нова панель стає на місце без додаткового стрибка висоти.
let acctSegFade = null;
function acctFinishSegFade(){ if(acctSegFade){ const f = acctSegFade; acctSegFade = null; f.done(); } }
function acctSegmentFadeOut(oldPanel, oldRect){
  acctFinishSegFade();
  const view = document.getElementById('view-accounting');
  if(!oldPanel || !oldRect || !view || typeof oldPanel.animate !== 'function' || motionReduced()) return;
  const vr = view.getBoundingClientRect();
  const dur = motionDuration('s', motionK, false);
  view.classList.add('acct-seg-transition');
  oldPanel.classList.remove('hidden'); oldPanel.setAttribute('data-seg-leaving', '');
  oldPanel.style.position = 'absolute'; oldPanel.style.left = (oldRect.left - vr.left) + 'px'; oldPanel.style.top = (oldRect.top - vr.top) + 'px';
  oldPanel.style.width = oldRect.width + 'px'; oldPanel.style.pointerEvents = 'none';
  const anim = oldPanel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
  let timer = null;
  const done = function(){
    if(timer){ clearTimeout(timer); timer = null; }
    try{ anim.cancel(); }catch(e){}
    oldPanel.classList.add('hidden'); oldPanel.removeAttribute('data-seg-leaving');
    oldPanel.style.position = ''; oldPanel.style.left = ''; oldPanel.style.top = ''; oldPanel.style.width = ''; oldPanel.style.pointerEvents = '';
    view.classList.remove('acct-seg-transition');
  };
  acctSegFade = { done: done };
  const finish = function(){ if(acctSegFade && acctSegFade.done === done){ acctSegFade = null; done(); } };
  anim.finished.then(finish, function(){});
  timer = setTimeout(finish, dur + 200); // запасний кінець, якщо сторінка прихована й анімація не рахується
}
function onAccountSegment(prev, next, oldPanel, oldRect){
  const plan = accountSegmentPlan(prev, next, { reduced: motionReduced(), hidden: !dashStartupReady(), active: acctIsActive() });
  if(!plan.run){
    if(plan.skipped !== 'same') recordAcctSkip(plan.skipped, 'segment', ACCT_SEGMENT_NAMES[next] || null);
    if(plan.skipped !== 'same' && acctIsActive() && !acctState.running) acctMarkSeen(selectedMonth);
    return;
  }
  acctSegmentFadeOut(oldPanel, oldRect);
  playAccount(plan.mode, 'segment', selectedMonth, { trigger: 'segment' });
}
function playAccount(mode, trigger, month, meta){
  meta = meta || {};
  finishAccount();
  if(!dashStartupReady() || !acctIsActive()) return;
  const panel = acctPanel();
  if(!panel) return;
  const k = motionK;
  const scale = mode === 'full' ? 1 : (mode === 'replay' ? DASH_REPLAY_SCALE : DASH_UPDATE_SCALE);
  const timing = cardRevealTiming(k);
  const seenNums = acctState.seenNums;
  let rowsN = 0, deferredRows = 0, unitsN = 0;
  const runner = makeDashRunner(function(completed, r, durationMs){
    if(acctState.running && acctState.running.stop === r.stop) acctState.running = null;
    acctState.played = true;
    acctMarkSeen(month);
    if(completed){
      recordMotionPerf({ kind: 'account-enter', tab: 'accounting', mode: mode, skipped: null, elements: unitsN + rowsN, counters: r.counters.length, rows: rowsN, deferredRows: deferredRows,
        frames: r.frames, maxGapMs: Math.round(r.maxGap), durationMs: Math.round(durationMs), reduced: false, trigger: meta.trigger || 'tab', segment: acctSegmentName(panel) });
    }
  }, 'accounting');
  function addCounter(el, delay){
    if(runner.counters.length >= DASH_MAX_COUNTERS || el.dataset.final === undefined) return;
    const to = Number(el.dataset.final);
    let from = 0;
    if(mode === 'update' || (mode === 'full' && trigger === 'month')) from = typeof seenNums[el.id] === 'number' ? seenNums[el.id] : (mode === 'update' ? to : 0);
    if(from === to) return;
    // суми «Обліку» рахуються коротше за KPI «Аналітики» (щоб увесь візит вкладався в ~600–1000 мс): full ×0.7, replay ×0.5, update ×0.3 від --motion-count
    const cScale = mode === 'full' ? 0.7 : (mode === 'replay' ? 0.5 : 0.3);
    const dur = Math.max(120, Math.min(Math.round(motionDuration('count', k, false) * cScale), DASH_MAX_TOTAL_MS - delay));
    runner.counters.push({ el: el, from: from, delay: delay, dur: dur });
    runner.track(delay, dur);
    el.textContent = fmt(from);
  }
  function addAppear(el, delay, dur, shift){
    runner.cardAnims.push(el.animate([
      { opacity: 0, transform: 'translateY(' + (shift * k) + 'px)' + (shift >= 12 ? ' scale(.985)' : '') },
      { opacity: 1, transform: 'translateY(0px)' + (shift >= 12 ? ' scale(1)' : '') }
    ], { duration: dur, delay: delay, easing: MOTION_EASE_OUT, fill: 'backwards' }));
    runner.track(delay, dur);
  }
  if(mode === 'update'){
    ACCT_COUNTER_IDS.forEach(function(id){ const el = document.getElementById(id); if(el && panel.contains(el)) addCounter(el, 0); });
  }else{
    acctClearDeferred();
    acctState.enterAt = performance.now();
    const summary = panel.querySelector('.card-summary'), label = panel.querySelector('.section-label');
    const units = [summary, label].filter(Boolean);
    units.forEach(function(u, i){
      const delay = i * timing.stagger;
      addAppear(u, delay, timing.duration, 12); unitsN++;
      ACCT_COUNTER_IDS.forEach(function(id){ const el = document.getElementById(id); if(el && u.contains(el)) addCounter(el, delay); });
    });
    // рядки списку: перші до 10 видимих — по черзі (25·k мс) після підсумків; нижче екрана — IntersectionObserver (раз на візит)
    const rows = Array.from(panel.querySelectorAll('.card-debt-compact-row'));
    const vh = window.innerHeight;
    const rects = rows.map(function(el, i){ const rc = el.getBoundingClientRect(); return { id: i, top: rc.top, bottom: rc.bottom }; }); // одне читання розмітки до старту
    const visibleIdx = rects.filter(function(rc){ return rc.bottom > 0 && rc.top < vh; }).map(function(rc){ return rc.id; });
    const baseRows = units.length * timing.stagger;
    rowsToAnimate(visibleIdx, ACCT_MAX_ROWS).forEach(function(idx, n){
      addAppear(rows[idx], baseRows + n * Math.round(ACCT_ROW_STAGGER_MS * k), motionDuration('m', k, false), 8); rowsN++;
    });
    const below = chartsBelowFold({ viewportH: vh, cards: rects });
    if(below.length && shouldDeferChart(mode, false, typeof IntersectionObserver === 'function')){
      const d = acctState.deferred;
      d.io = new IntersectionObserver(onAcctRowIntersect, { root: document.getElementById('main-col'), rootMargin: '0px 0px -10% 0px', threshold: [0, CHART_REVEAL_RATIO] });
      below.forEach(function(idx){
        const row = rows[idx];
        row.style.opacity = '0'; row.style.transform = 'translateY(' + (8 * k) + 'px)';
        d.rows.set(row, { timer: null, ok: false });
        d.io.observe(row); deferredRows++;
      });
    }
  }
  if(runner.empty()){ acctState.played = true; acctMarkSeen(month); if(!acctState.deferred.rows.size) recordAcctSkip('no-change'); return; }
  acctState.running = { stop: runner.stop };
  runner.start();
}
function onAcctRowIntersect(entries){
  const d = acctState.deferred;
  entries.forEach(function(entry){
    const st = d.rows.get(entry.target);
    if(!st) return;
    st.ok = revealDecision(entry, { revealed: false, reduced: false, hidden: false, dwellMs: CHART_REVEAL_DWELL_MS }) === 'draw';
    if(st.ok && !st.timer){ st.timer = setTimeout(function(){ st.timer = null; acctRevealRow(entry.target, 0); }, CHART_REVEAL_DWELL_MS); }
    else if(!st.ok && st.timer){ clearTimeout(st.timer); st.timer = null; }
  });
}
function acctRevealRow(row, attempt){
  const d = acctState.deferred;
  const st = d.rows.get(row);
  if(!st || !st.ok) return;
  if(!dashStartupReady() || !acctIsActive()){
    if(attempt < 20) st.timer = setTimeout(function(){ st.timer = null; acctRevealRow(row, attempt + 1); }, 250);
    return;
  }
  const root = document.getElementById('main-col');
  if(root){
    const rc = row.getBoundingClientRect(), rr = root.getBoundingClientRect();
    const visH = Math.min(rc.bottom, rr.bottom - rr.height * 0.1) - Math.max(rc.top, rr.top);
    if(!(rc.height > 0) || visH / rc.height < CHART_REVEAL_RATIO){ st.ok = false; return; }
  }
  d.rows.delete(row);
  if(d.io) d.io.unobserve(row);
  row.style.removeProperty('opacity'); row.style.removeProperty('transform');
  const k = motionK;
  const runner = makeDashRunner(function(completed, r){ d.runners.delete(r); }, 'accounting');
  runner.cardAnims.push(row.animate([{ opacity: 0, transform: 'translateY(' + (8 * k) + 'px)' }, { opacity: 1, transform: 'translateY(0px)' }],
    { duration: motionDuration('m', k, false), easing: MOTION_EASE_OUT, fill: 'backwards' }));
  runner.track(0, motionDuration('m', k, false));
  d.runners.add(runner);
  runner.start();
}
function renderDashboard(){
  const month = selectedMonth;
  if(!month) return;
  const { monthExp, monthInc, totalIncome, totalExpense, savings } = monthAggregates(month);
  lastDashSavings = savings; miniHeadPaint(); // Rev 2.32.365 (DS-3f): те саме значення «Баланс», що й #kpi-savings, для капсули при прокрутці
  const debtNow = debtTotalsForMonth(month);
  const debtPrev = debtTotalsForMonth(shiftMonth(month,-1));
  // Rev #30 (6D.44) — activeDebts(): якщо всі борги tombstoned, це логічно "немає даних", не "є дані".
  const hasDebtData = activeDebts().length > 0;
  const debtChange = debtPrev.total - debtNow.total; // позитивне = борг зменшився (за місяць)
  const startMonth = earliestDebtMonth();
  const debtStart = startMonth ? debtTotalsForMonth(startMonth) : { total: 0 };
  const paidSinceStart = debtStart.total - debtNow.total; // позитивне = борг зменшився з початку обліку
  const prevMonth = shiftMonth(month, -1);
  const prev = monthAggregates(prevMonth);

  /* --- Порожній стан Аналітики (немає жодного запису в системі взагалі) --- */
  // Rev #30 (6D.44) — activeExpenses()/activeIncomes()/activeDebts(): якщо все видалено, це порожній стан.
  const analyticsIsEmpty = activeExpenses().length===0 && activeIncomes().length===0 && activeDebts().length===0;
  document.getElementById('analytics-empty').classList.toggle('hidden', !analyticsIsEmpty);
  document.getElementById('analytics-body').classList.toggle('hidden', analyticsIsEmpty);
  const balWrap = document.getElementById('analytics-bal-wrap'); if(balWrap) balWrap.classList.toggle('hidden', analyticsIsEmpty); // Rev 2.32.385 (DS-5a): картка балансу ховається разом з тілом при порожніх даних
  if(analyticsIsEmpty){ return; } // немає сенсу рахувати картки/графіки по порожніх даних

  /* --- 6-місячний тренд (потрібен і для спарклайнів у Ряду 1, і для великого графіка в Ряду 2) --- */
  const months6 = [];
  for(let i=5;i>=0;i--) months6.push(shiftMonth(month, -i));
  const trendData = months6.map(m => ({ m, ...monthAggregates(m) }));

  /* --- Ряд 1: KPI зі спарклайном і трендом (за еталонним макетом) --- */
  // Rev 2.32.385 (DS-5a): KPI «Доходи», «Витрати», «Баланс» замінено карткою «Сімейний баланс» (renderBalanceCard нижче); велике число — #kpi-savings (одометр), те саме значення savings, що й у капсулі (lastDashSavings).
  // Rev 2.25.0 (M2) — data-final: розрахункове число для лічильників (текст формує та сама fmt(), анімація лише добігає до нього).

  // Rev 2.27.0 (M2.1) — вузол графіка замінюється лише коли змінився підпис даних (фоновий рендер не обриває анімацію й не мерехтить).
  // Rev 2.1.0 — Debt Data Integrity: замість мовчазного carry-forward, честно
  // показуємо, чи це фактичні дані поточного місяця, чи "останнє відоме" —
  // тоді в тренд-рядку зʼявляється жовтий бейдж "Станом на [місяць]" замість
  // проценту зміни (сам проценти залишаємо тільки коли дані дійсно свіжі).
  const cardAsOf = debtAsOfInfo(month, 'card');
  // Rev 2.32.386 (DS-5b): плитка «Борг» і висновки беруть дельту лише за фактом обох місяців (FINANCIAL_RULES §3.1)
  const cardDeltaKnown = kindHasActualForMonth('card', month) && kindHasActualForMonth('card', prevMonth);
  const cardDelta = debtPrev.total - debtNow.total; // позитивне = борг скоротився
  // Rev #21 + #23 — Unified Data Status: єдиний debtAsOfInfo(month,'card') для плитки «Борг».
  const debtUiStatusNow = debtUiStatus(cardAsOf, month, 'card');
  renderDebtOchTiles({ month: month, prevMonth: prevMonth, hasDebtData: hasDebtData, debtNow: debtNow, debtStart: debtStart, cardAsOf: cardAsOf, cardDeltaKnown: cardDeltaKnown, cardDelta: cardDelta, status: debtUiStatusNow });

  /* --- Ряд 2: графіки --- */
  // Дані завжди починаються зліва: беремо тільки ту частину 6-місячного вікна,
  // яка йде від найпершого місяця з реальними записами (а не завжди останні 6).
  const earliestActivity = earliestActivityMonth();
  const availableTrendData = earliestActivity ? trendData.filter(t => t.m >= earliestActivity) : trendData;
  // Rev 2.32.385 (DS-5a): картка «Сімейний баланс»; «Обов'язкові»/«Вільні» — та сама mandatoryPaymentsSummary, формула без змін.
  const balSummary = mandatoryPaymentsSummary(monthExp, totalIncome);
  renderBalanceCard({ month: month, pos: balancePosition(month, localDateISO()), totalIncome: totalIncome, totalExpense: totalExpense, savings: savings, mandatory: balSummary.mandatory, freeMoney: balSummary.freeMoney,
    curInc: monthInc, curExp: monthExp, prevInc: prev.monthInc, prevExp: prev.monthExp, prevMonth: prevMonth, series: availableTrendData });
  // Rev 2.32.392 (DS-5d-1): графіки «Доходи vs Витрати» і «Динаміка боргу» замінено однією карткою «Динаміка за 6 місяців» (renderDynCard); борг — лише точки з фактом (kindHasActualForMonth), carry-forward не малюється.
  renderDynCard({ month: month, todayKey: monthKey(localDateISO()), months: months6, incomes: trendData.map(t=>t.totalIncome), expenses: trendData.map(t=>t.totalExpense), earliest: earliestActivity, hasDebtData: hasDebtData, startMonth: startMonth,
    debts: months6.map(m => hasDebtData ? { total: debtTotalsForMonth(m).total, actual: kindHasActualForMonth('card', m) } : { total: 0, actual: false }) });

  /* --- Найбільша категорія для висновків (top5/byCat); рядки категорій малює renderCatCard --- */
  const byCat = {};
  monthExp.forEach(e=>{ const key = e.category || '🧾 Без категорії'; byCat[key] = (byCat[key]||0)+e.amount; });
  const allCatSorted = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const top5 = allCatSorted.slice(0,5);

  // Rev 2.32.388 (DS-5c-1): таблиці «Витрати за категоріями» і «Деталізація витрат» замінено карткою «Деталізація витрат» з кільцями (renderCatCard); byCat/bySub лишаються для висновків і «Потенціалу».
  renderCatCard(monthExp, month);

  // Rev 2.32.390 (DS-5c-2): таблицю «Потенціал економії» замінено карткою (renderPotentialCard); формула та сама (savingsPotential), «≈ на рік» — typicalMonth за 6 місяців перед вибраним.
  const potWindow = [];
  potentialWindowMonths(month, monthKey(localDateISO())).forEach(function(m){ const me = monthAggregates(m).monthExp; if(me.length) potWindow.push(savingsPotential(me, SUBCATEGORY_PRIORITY).total); }); // місяці без жодного запису витрат виключаються; поточний неповний місяць у вікно не входить
  renderPotentialCard({ month: month, pot: savingsPotential(monthExp, SUBCATEGORY_PRIORITY), totalExpense: totalExpense, typ: typicalMonth(potWindow) });

  /* --- Звичка місяця --- */
  // Rev 2.1.21 — BugFix: раніше ключем був "підкатегорія АБО категорія"
  // (фолбек), тому категорії без жодних підкатегорій (напр. "🛒 Продукти" —
  // для неї в SUBCATEGORIES взагалі нема записів) завжди перемагали за
  // кількістю записів і "Звичка місяця" незмінно показувала "Продукти" —
  // найчастіша, але нічого не каже про РЕАЛЬНУ звичку. Тепер рахуємо лише за
  // підкатегоріями (без фолбеку): записи без підкатегорії просто не
  // враховуються в цій метриці — так видно, куди саме йдуть гроші в деталях
  // (кава/таксі/перекуси тощо), а не найбільшу за обсягом категорію загалом.
  const countBySub = {};
  monthExp.forEach(e=>{
    const key = e.subcategory;
    if(!key) return;
    countBySub[key] = countBySub[key] || {count:0, sum:0};
    countBySub[key].count++; countBySub[key].sum += e.amount;
  });
  const habitEntries = Object.entries(countBySub).sort((a,b)=>b[1].count-a[1].count);
  const habitText = habitEntries.length===0 ? null : `${habitEntries[0][0]} · ${habitEntries[0][1].count} ${habitCountWord(habitEntries[0][1].count)}`;
  // 6. Звичка місяця
  // Rev 2.1.23 — за проханням: один рядок з роздільником "·", за аналогією з
  // підписом картки "Платежі по ОЧ" ("N активних · залишок X ₴").
  document.getElementById('kpi-habit').textContent = habitEntries.length===0 ? '—' : habitEntries[0][0];
  document.getElementById('kpi-habit-sub').textContent = (habitEntries.length && totalExpense>0)
    ? `${habitEntries[0][1].count} ${habitCountWord(habitEntries[0][1].count)} · ${fmtPercent1(habitEntries[0][1].sum/totalExpense*100)} усіх витрат`
    : '—';

  /* --- Висновки місяця: картки-інсайти (іконка + заголовок + опис) ---
     Rev 1.7.3: використовую лише ВЖЕ наявні в цій функції обчислені значення
     (savings, top5, habitEntries, debtNow.totalInstallment, debtChange) —
     нової бізнес-логіки/метрик не додаю, лише новий формат подачі того самого. */
  const INSIGHT_ICONS = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    dot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };
  const summaryEl = document.getElementById('summary-container');
  let insights = [];
  if(totalIncome===0 && totalExpense===0){
    insights.push({icon:'dot', color:'muted', title:'Ще немає даних',
      desc:'Додай перші записи в «Обліку», щоб побачити висновки місяця.'});
  }else{
    // 1. Фінансовий результат
    if(savings>=0){
      insights.push({icon:'check', color:'success', title:'Фінансовий результат',
        desc: totalIncome>0
          ? `Цього місяця у вас профіцит ${fmtSigned(savings)} або ${fmtPercent1(savings/totalIncome*100)} від доходу.`
          : `Цього місяця у вас профіцит ${fmtSigned(savings)}.`});
    }else{
      insights.push({icon:'alert', color:'error', title:'Фінансовий результат',
        desc: totalIncome>0
          ? `Витрати перевищили дохід на ${fmt(Math.abs(savings))} (${fmtPercent1(Math.abs(savings)/totalIncome*100)} від доходу).`
          : `Витрати перевищили дохід на ${fmt(Math.abs(savings))}.`});
    }
    // 2. Найбільша витрата
    if(top5.length>0){
      const pct = totalExpense>0 ? (top5[0][1]/totalExpense*100).toFixed(0) : null;
      insights.push({icon:'flag', color:'warning', title:'Найбільша витрата',
        desc:`Категорія «${escapeHtml(top5[0][0])}» займає найбільшу частку ваших витрат${pct?` — ${pct}%`:''}.`});
    }
    // 3. Звичка місяця
    if(habitEntries.length){
      const h = habitEntries[0];
      insights.push({icon:'dot', color:'info', title:'Звичка місяця',
        desc:`«${escapeHtml(h[0])}» — ${h[1].count} ${habitCountWord(h[1].count)} цього місяця.`});
    }
    // 4. Оплати частинами (лише якщо є активні платежі)
    const activeOchCount = hasDebtData ? debtNow.list.filter(d=>d.kind==='installment').length : 0;
    if(activeOchCount>0){
      insights.push({icon:'dot', color:'purple', title:'Оплати частинами',
        desc:`У вас ${activeOchCount} ${activeOchCount===1?'активний платіж':'активних платежів'} на загальну суму ${fmt(debtNow.totalInstallment)}.`});
    }
    // 5. Борг
    // Rev 2.10.1 BugFix (P1, аудит) — раніше цей інсайт брав debtChange
    // БЕЗ перевірки, чи є ФАКТИЧНІ записи карток за поточний і попередній
    // місяць (та сама перевірка cardDeltaKnown, що вже захищає KPI "Динаміка
    // боргу" в Row 2 — вона обчислюється вище, у цій самій функції). Без цієї
    // перевірки carry-forward значення (борг просто не оновлювався кілька
    // місяців, тому дельта виходить 0 чи випадкова) видавалось за реальний
    // факт "Ви зменшили борг" — пряме порушення FINANCIAL_RULES §3.1: carry-
    // forward ніколи не подається як підтверджена дельта місяця.
    if(!hasDebtData){
      insights.push({icon:'dot', color:'muted', title:'Борги',
        desc:'Додай борги на вкладці «Облік», щоб бачити повну картину.'});
    }else if(!cardDeltaKnown){
      insights.push({icon:'dot', color:'muted', title:'Борг',
        desc:'Потрібен факт за поточний і попередній місяць, щоб порахувати динаміку боргу.'});
    }else{
      insights.push(cardDelta>=0
        ? {icon:'check', color:'success', title:'Чудова робота!', desc:`Ви зменшили борг на ${fmt(cardDelta)} у порівнянні з минулим місяцем.`}
        : {icon:'alert', color:'error', title:'Борг зростає', desc:`Борг зріс на ${fmt(Math.abs(cardDelta))} у порівнянні з минулим місяцем.`});
    }
  }
  // Rev 2.32.393 (DS-5d-2): висновки — той самий набір і та сама логіка (insights вище без змін), новий вигляд за макетом: картка, контурна піктограма без кольорового кружка (нейтральний колір), заголовок і опис; порожньо — пояснення.
  summaryEl.innerHTML = insights.length ? insights.map(function(i){
    return `<div class="bal-ili"><span class="bal-ii">${INSIGHT_ICONS[i.icon]}</span><span class="bal-itx"><b>${i.title}</b><span>${i.desc}</span></span></div>`;
  }).join('') : '<div class="empty-hint">Ще немає висновків за цей місяць.</div>';
  dashAfterRender(month); // Rev 2.25.0 (M2): хореографія появи (лише якщо вкладка активна; фонові ре-рендери статичні)
}

function habitCountWord(n){
  const mod10=n%10, mod100=n%100;
  if(mod10===1 && mod100!==11) return 'раз';
  if([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'рази';
  return 'разів';
}
// BugFix — ця функція існувала з самого початку (задовго до Rev 2.22.20), і
// той Rev явно стверджував у commit-повідомленні "expenseCountWord()
// лишено — генерична плюралізація, використовується іншими місцями" — але
// насправді видалив саме ЦЮ функцію разом із рештою видаленої фічі "Спільні
// витрати" (Family Bridge), бо вона фізично лежала в тому самому видаленому
// блоці коду. Обидва залишкові виклики (populateInstallmentTable, вище, і
// buildDiagnosticsReport(), Rev 2.16.0) з того часу кидали ReferenceError —
// саме тому не працювала кнопка "Діагностика даних". Відновлено 1:1 з
// історії (Rev 2.22.19, останній коміт, де вона ще існувала).
function expenseCountWord(n){
  const mod10=n%10, mod100=n%100;
  if(mod10===1 && mod100!==11) return 'витрата';
  if([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'витрати';
  return 'витрат';
}

// Rev 2.1.16 — escapeHtml() не екранує лапки (не потрібно було для текстового
// вмісту), а тепер назву витрати вставляємо і в value="..." інпута для
// редагування — там лапка в назві ("Пательня 32\"") зламала б розмітку.
// Rev 2.32.19 (X, A1-5) — safeId(): id запису, що підставляється всередину JS-рядка в inline-обробнику (onclick="f('${id}')"). Справжні id — UUID/ключі з [0-9A-Za-z_-]; все інше (лапки, дужки, пробіли) відсікається, тож зовнішній текст не може вийти з рядка обробника. Альтернатива (data-* + делегований обробник) змінила б сотню місць розмітки — свідомо відкладено.
// Rev 2.32.19 (X) — кількість місць розмітки, де значення з даних екрануються (для події xss-audit рекордера; значення не пишуться).
const XSS_AUDITED_SITES = 25;

/* ===== Rev 2.32.385 (DS-5a): картка «Сімейний баланс» (макет analytics-ds v18; docs/reports/DS-5-step0.md, «Рішення 18.11») =====
   Чисті функції (без DOM) — F1 смуга днів, F2 порівняння «на той самий день», F3 «≈ на день». Формули «Обов'язкові»/«Вільні» не змінено (mandatoryPaymentsSummary).
   Ризики/альтернативи: «сьогодні» береться з localDateISO() (локальна дата пристрою); майбутній місяць (перемикач дозволяє наступний) = T 0; одометр — лише transform; висота розгортання — grid-template-rows (виняток ДС-плану, як у «Словнику»). */
function daysInMonthKey(month){
  const y = parseInt(String(month).slice(0, 4), 10), m = parseInt(String(month).slice(5, 7), 10);
  return (y > 0 && m >= 1 && m <= 12) ? new Date(y, m, 0).getDate() : 30;
}
// Положення місяця відносно сьогодні: current (T = день сьогодні, 1..N), past (T = N), future (T = 0).
function balancePosition(month, todayISO){
  const N = daysInMonthKey(month), todayKey = String(todayISO).slice(0, 7);
  if(month === todayKey){ const t = parseInt(String(todayISO).slice(8, 10), 10); return { N: N, T: Math.min(N, Math.max(1, isNaN(t) ? 1 : t)), phase: 'current' }; }
  if(month < todayKey) return { N: N, T: N, phase: 'past' };
  return { N: N, T: 0, phase: 'future' };
}
// Симетричне округлення до кроку (−1,5 і 1,5 — дзеркально; Math.round зсуває від'ємні до +∞); без «−0».
function roundSym(x, step){
  const r = Math.round(Math.abs(Number(x) || 0) / step) * step;
  return r === 0 ? 0 : (x < 0 ? -r : r);
}
// F1: S = витрачено / дохід × N; заповнення сегмента d = clamp(S − (d−1), 0, 1); різниця з темпом = round100(витрачено − дохід × T / N) (алгебраїчно те саме, що (витрачено/дохід − T/N) × дохід, але без ділення на дохід).
// tone: future | noincome | over | done | ahead | behind | even.
function dayBarModel(spent, income, pos){
  const N = pos.N, T = pos.T, phase = pos.phase;
  const sp = Number(spent) || 0, inc = Number(income) || 0;
  const hasIncome = inc > 0;
  const fills = [];
  for(let d = 0; d < N; d++) fills.push(0);
  let S = 0, diff = null, spentPct = null;
  if(hasIncome){
    S = sp / inc * N;
    if(phase !== 'future') for(let d = 1; d <= N; d++) fills[d - 1] = Math.max(0, Math.min(1, S - (d - 1)));
    spentPct = Math.round(sp / inc * 100);
    if(phase === 'current') diff = roundSym(sp - inc * T / N, 100);
  }
  let tone;
  if(phase === 'future') tone = 'future';
  else if(!hasIncome) tone = 'noincome';
  else if(sp > inc) tone = 'over';
  else if(phase === 'past') tone = 'done';
  else tone = diff > 0 ? 'ahead' : (diff < 0 ? 'behind' : 'even');
  return { N: N, T: T, phase: phase, hasIncome: hasIncome, S: S, fills: fills, diff: diff, spentPct: spentPct, tone: tone, over: (hasIncome && sp > inc) ? Math.round(sp - inc) : 0, lineFrac: phase === 'current' ? T / N : null };
}
// F2: сума записів місяця до дня включно (records: [{date:'YYYY-MM-DD', amount}], уже без надгробків).
function sumUpToDay(records, month, day){
  let s = 0;
  for(let i = 0; i < records.length; i++){
    const e = records[i], d = e && e.date;
    if(!d || String(d).slice(0, 7) !== month) continue;
    if(parseInt(String(d).slice(8, 10), 10) <= day) s += Number(e.amount) || 0;
  }
  return s;
}
// F2: до якого дня порівнювати: поточний — T і min(T, днів минулого); минулий обраний — повний з повним; майбутній — без порівняння (null).
function sameDayLimits(pos, prevMonth){
  if(pos.phase === 'future') return null;
  const nPrev = daysInMonthKey(prevMonth);
  if(pos.phase === 'past') return { curDay: pos.N, prevDay: nPrev, full: true };
  return { curDay: pos.T, prevDay: Math.min(pos.T, nPrev), full: false };
}
// F2: зміна в % до минулого (ціле); минулий 0 або немає — null (без «нескінченного» відсотка).
function percentChange(cur, prev){
  const p = Number(prev) || 0;
  return p > 0 ? Math.round(((Number(cur) || 0) - p) / p * 100) : null;
}
// F3 (виправлено 18.11): «решта» = вільні (дохід − обов'язкові) − уже витрачене на необов'язкове (витрати − обов'язкові). Обов'язкові вже входять у витрати й віднімаються один раз, тому решта = дохід − витрати.
// «≈ на день» = решта / (N − T + 1) до 10 ₴: поточний місяць — з сьогодні; наступний — решта / N; минулий — без «на день»; решта ≤ 0 — без «на день» (картка пише «Перевищено на …»).
// fill — частка вільних грошей, що вже витрачена (смуга), 0..1; при вільних ≤ 0 або перевитраті смуга повна.
function balanceRest(income, spent, mandatory){
  const inc = Number(income) || 0, sp = Number(spent) || 0, man = Number(mandatory) || 0;
  const free = inc - man, nonMand = sp - man, rest = free - nonMand;
  const fill = free > 0 ? Math.max(0, Math.min(1, nonMand / free)) : 1;
  return { free: free, nonMand: nonMand, rest: rest, over: rest < 0 ? -rest : 0, fill: fill };
}
function daysLeftCount(pos){ return pos.phase === 'current' ? pos.N - pos.T + 1 : (pos.phase === 'future' ? pos.N : null); }
function freePerDay(rest, pos){
  if(pos.phase === 'past' || !(Number(rest) > 0)) return null;
  return roundSym(Number(rest) / daysLeftCount(pos), 10);
}
function dayWord(n){
  const m10 = n % 10, m100 = n % 100;
  if(m10 === 1 && m100 !== 11) return 'день';
  if(m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дні';
  return 'днів';
}
function monthsWord(n){ return n === 1 ? 'місяць' : ((n >= 2 && n <= 4) ? 'місяці' : 'місяців'); }

// Одометр: стовпчик цифр 0..9 на кожну цифру, зсув translateY (transform); решта символів — звичайні. replay — від нуля; те саме число без replay — нічого не робимо; змінене число тієї ж форми — стовпчики докочуються.
function odoRender(el, text, replay){
  if(!el) return;
  text = String(text);
  const reduced = motionReduced();
  const chars = Array.from(text);
  const shape = chars.map(function(c){ return /\d/.test(c) ? 'd' : c; }).join('');
  const sameShape = el.dataset.odoShape === shape && !!el.querySelector('.odc');
  el.setAttribute('aria-label', text);
  if(el.dataset.odoText === text && !replay && sameShape) return;
  const digits = chars.filter(function(c){ return /\d/.test(c); });
  if(sameShape && !replay){
    Array.prototype.forEach.call(el.querySelectorAll('.odc'), function(col, i){
      if(!reduced){ col.classList.remove('z'); col.style.transitionDelay = (80 + i * 45) + 'ms'; }
      col.style.setProperty('--d', digits[i]);
    });
  }else{
    let di = 0;
    const start = (replay && !reduced);
    el.innerHTML = chars.map(function(c){
      if(/\d/.test(c)){ const d = digits[di++]; return '<span class="od"><span class="odc z" style="--d:' + (start ? 0 : d) + '">0\n1\n2\n3\n4\n5\n6\n7\n8\n9</span></span>'; }
      return '<span class="odx">' + escapeHtml(c) + '</span>';
    }).join('');
    el.dataset.odoShape = shape;
    if(start){
      void el.offsetWidth; // зафіксувати «нулі» перед кочінням
      Array.prototype.forEach.call(el.querySelectorAll('.odc'), function(col, i){ col.classList.remove('z'); col.style.transitionDelay = (120 + i * 45) + 'ms'; col.style.setProperty('--d', digits[i]); });
    }
  }
  el.dataset.odoText = text;
}

// Дотик або проведення пальцем вибирає точку; touch-action: pan-y у CSS лишає вертикальну прокрутку сторінці.
function chartScrub(el, pick, get, set){
  let down = false, moved = false;
  el.onpointerdown = function(e){ down = true; moved = false; const i = pick(e.clientX - el.getBoundingClientRect().left); if(i !== get()){ set(i); moved = true; } };
  el.onpointermove = function(e){ if(!down) return; const i = pick(e.clientX - el.getBoundingClientRect().left); if(i !== get()){ set(i); moved = true; } };
  el.onpointerup = el.onpointercancel = function(){ if(down && !moved) set(-1); down = false; };
  el.onpointerleave = function(){ down = false; };
}
// Ламана за місяці для плитки «Доходи»/«Витрати» (макет: висота 38); ro(i) — підпис вибраного місяця, ro(-1) — стан за замовчуванням.
function balLineChart(host, vals, color, label, ro){
  const W = host.clientWidth || 128, H = 38, pl = 4, pr = 4, pt = 10, pb = 8, pad = 6, n = vals.length;
  if(n === 0){ host.innerHTML = ''; ro(-1); return; }
  const hi = Math.max.apply(null, vals), lo = Math.min.apply(null, vals), span = hi - lo, mn = lo - span * 0.15;
  const X = function(i){ return n === 1 ? pl + (W - pl - pr) / 2 : pl + pad + i * (W - pl - pr - pad * 2) / (n - 1); };
  const Y = function(v){ return span > 0 ? pt + (H - pt - pb) * (1 - (v - mn) / (hi - mn)) : (pt + H - pb) / 2; };
  const path = vals.map(function(v, i){ return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
  host.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeAttr(label) + '">' +
    '<line class="vl" y1="' + (pt - 6) + '" y2="' + (H - pb + 2) + '"/>' +
    '<path class="ln" pathLength="1" stroke="' + color + '" stroke-width="2" d="' + path + '"/>' +
    vals.map(function(v, i){ return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3.5" fill="' + color + '" stroke="var(--surface-2)" stroke-width="1.5" style="--n:' + i + '"/>'; }).join('') + '</svg>';
  let sel = -1;
  const vl = host.querySelector('.vl'), cs = host.querySelectorAll('circle');
  const set = function(i){
    sel = i;
    Array.prototype.forEach.call(cs, function(c, j){ c.classList.toggle('on', j === i); });
    vl.classList.toggle('on', i >= 0);
    if(i >= 0){ vl.setAttribute('x1', X(i)); vl.setAttribute('x2', X(i)); }
    ro(i);
  };
  chartScrub(host, function(x){ let b = 0; for(let i = 1; i < n; i++) if(Math.abs(X(i) - x) < Math.abs(X(b) - x)) b = i; return b; }, function(){ return sel; }, set);
  ro(-1);
}

let balLast = null; // останній вхід картки: для повторної появи (replay) і перемальовування графіків при розгортанні
let balOpen = false;
function balCompareHtml(pct, goodWhenUp){
  if(pct === null) return { text: '', cls: '' };
  const good = goodWhenUp ? pct > 0 : pct < 0, bad = goodWhenUp ? pct < 0 : pct > 0;
  return { text: (pct > 0 ? '+' : (pct < 0 ? '−' : '')) + Math.abs(pct) + '%', cls: good ? ' good' : (bad ? ' bad' : '') };
}
// ctx: { month, pos, totalIncome, totalExpense, savings, mandatory, freeMoney, curInc[], curExp[], prevInc[], prevExp[], prevMonth, series:[{m,totalIncome,totalExpense}] }
function renderBalanceCard(ctx, replay){
  const card = document.getElementById('bal-card');
  if(!card || !ctx) return;
  balLast = ctx;
  const pos = ctx.pos, income = ctx.totalIncome, spent = ctx.totalExpense;
  const setText = function(id, t){ const el = document.getElementById(id); if(el) el.textContent = t; };
  const fmtPlain = function(n){ return fmt(n).replace(/\s*₴$/, ''); };
  // шапка й велике число
  const g = monthGenitive(ctx.month) + (ctx.month.slice(0, 4) !== localDateISO().slice(0, 4) ? ' ' + ctx.month.slice(0, 4) : '');
  setText('bal-sub', 'залишок ' + g + (pos.phase === 'current' ? ' · день ' + pos.T + ' з ' + pos.N : (pos.phase === 'past' ? ' · місяць завершено' : ' · місяць ще не почався')));
  const big = document.getElementById('kpi-savings');
  if(big){ big.dataset.final = String(Math.round(ctx.savings)); big.classList.toggle('neg', ctx.savings < 0); odoRender(big, ctx.savings === 0 ? fmt(0) : fmtSigned(ctx.savings), replay); }
  // смуга днів
  const m = dayBarModel(spent, income, pos);
  const abbr = monthGenitive(ctx.month).slice(0, 3);
  const left = daysLeftCount(pos);
  let stateHtml;
  if(m.tone === 'future') stateHtml = '<span>Місяць ще не почався</span>';
  else if(m.tone === 'noincome') stateHtml = '<span>Немає доходів за місяць: смуга з’явиться, коли вони будуть</span>';
  else if(m.tone === 'over') stateHtml = '<span class="bal-bad">Витрати перевищили дохід на <b>' + fmt(m.over) + '</b></span>';
  else if(m.tone === 'done') stateHtml = '<span>Місяць завершено: витрачено ' + m.spentPct + '% доходу</span>';
  else if(m.tone === 'ahead') stateHtml = '<span class="bal-amber">Витрати на <b>' + fmt(m.diff) + '</b> випереджають дні</span>';
  else if(m.tone === 'behind') stateHtml = '<span class="bal-good">Витрати на <b>' + fmt(-m.diff) + '</b> менші, ніж минуло днів</span>';
  else stateHtml = '<span>Витрати йдуть у ногу з днями</span>';
  const rightSum = pos.phase === 'current' ? (left + ' ' + dayWord(left) + ' лишилось') : (pos.phase === 'past' ? ('усі ' + pos.N + ' ' + dayWord(pos.N)) : (pos.N + ' ' + dayWord(pos.N)));
  let segs = '';
  for(let d = 1; d <= m.N; d++){
    const f = m.fills[d - 1];
    segs += '<span class="bal-seg' + (d <= m.T ? ' past' : '') + '" style="--n:' + d + '">' + (f > 0 ? '<i class="' + (d <= m.T ? 'in' : 'out') + '" style="width:' + (f * 100).toFixed(0) + '%"></i>' : '') + '</span>';
  }
  const x = m.lineFrac === null ? null : (m.lineFrac * 100);
  const tagCls = x === null ? '' : (x > 88 ? ' r' : (x < 12 ? ' l' : ''));
  const aria = m.hasIncome ? ('Минуло ' + m.T + ' з ' + m.N + ' днів, витрачено ' + m.spentPct + '% доходу') : ('Днів у місяці: ' + m.N + '; доходів немає');
  const barHtml = '<span class="bal-dwrap">' + (x === null ? '' : '<span class="bal-dtag' + tagCls + '" style="left:' + x.toFixed(2) + '%">сьогодні</span><span class="bal-dline" style="left:' + x.toFixed(2) + '%"></span>') +
    '<span class="bal-dsegs" role="img" aria-label="' + escapeAttr(aria) + '">' + segs + '</span></span>' +
    '<span class="bal-dax"><span>1 ' + abbr + '</span><span>' + m.N + ' ' + abbr + '</span></span>' +
    '<span class="bal-dsum"><span>Витрачено <b>' + fmtPlain(spent) + '</b> з ' + fmt(income) + '</span><span>' + rightSum + '</span></span>' +
    '<span class="bal-dstate">' + stateHtml + '</span>';
  const dbar = document.getElementById('bal-dbar');
  const sig = chartSignature([m.N, m.T, m.phase, m.tone, m.diff, m.spentPct, spent, income, m.over, abbr, m.fills.map(function(f){ return Math.round(f * 100); })]);
  if(dbar && (replay || dbar.dataset.sig !== sig)){ dbar.innerHTML = barHtml; dbar.dataset.sig = sig; }
  // порівняння «на той самий день» (F2)
  const lim = sameDayLimits(pos, ctx.prevMonth);
  let incCmp = null, expCmp = null, incPrev = null, expPrev = null;
  if(lim){
    const curI = sumUpToDay(ctx.curInc, ctx.month, lim.curDay), curE = sumUpToDay(ctx.curExp, ctx.month, lim.curDay);
    incPrev = sumUpToDay(ctx.prevInc, ctx.prevMonth, lim.prevDay); expPrev = sumUpToDay(ctx.prevExp, ctx.prevMonth, lim.prevDay);
    incCmp = percentChange(curI, incPrev); expCmp = percentChange(curE, expPrev);
  }
  const prevLabel = !lim ? '' : (lim.full ? ('за ' + UA_MONTHS[parseInt(ctx.prevMonth.slice(5, 7), 10) - 1]) : ('на ' + lim.prevDay + ' ' + monthGenitive(ctx.prevMonth).slice(0, 3)));
  const capOf = function(prevSum, hasRecs){ return !lim ? '' : (prevLabel + ': ' + ((prevSum > 0 || hasRecs) ? fmtPlain(prevSum) : '—')); };
  setText('bal-c-inc-v', fmt(income)); setText('bal-c-exp-v', fmt(spent));
  setText('bal-c-inc-cap', capOf(incPrev, ctx.prevInc.length > 0)); setText('bal-c-exp-cap', capOf(expPrev, ctx.prevExp.length > 0));
  const dExp = balCompareHtml(expCmp, false), dInc = balCompareHtml(incCmp, true);
  const setPill = function(id, d){ const el = document.getElementById(id); if(!el) return; el.textContent = d.text; el.className = 'bal-pill' + d.cls; el.classList.toggle('hidden', !d.text); };
  setPill('bal-c-exp-pill', dExp); setPill('bal-tr-exp', dExp); setPill('bal-tr-inc', dInc);
  // плитки 2×2
  setText('bal-v-inc', fmt(income)); setText('bal-v-exp', fmt(spent));
  setText('bal-v-man', fmt(ctx.mandatory)); setText('bal-v-free', fmt(ctx.freeMoney));
  const hasInc = income > 0;
  setText('bal-m-pct', hasInc ? Math.round(ctx.mandatory / income * 100) + '% доходу' : 'немає доходу');
  const setFill = function(id, v){ const el = document.getElementById(id); if(el) el.style.setProperty('--v', String(Math.max(0, Math.min(1, v)))); };
  setFill('bal-m-fill', hasInc ? ctx.mandatory / income : 0);
  setText('bal-m-hint', '');
  // «Після обов'язкових»: смуга = витрачене з вільних грошей, сірий залишок = решта (balanceRest)
  const rb = balanceRest(income, spent, ctx.mandatory);
  setFill('bal-f-fill', rb.fill);
  const ff = document.getElementById('bal-f-fill'); if(ff) ff.classList.toggle('over', rb.rest < 0);
  setText('bal-f-pct', rb.rest < 0 ? 'Перевищено на ' + fmt(rb.over) : 'решта ' + fmt(rb.rest));
  const pd = freePerDay(rb.rest, pos);
  setText('bal-f-hint', pd === null ? '' : (pd > 0 ? '≈ ' + fmt(pd) + ' на день' : 'менше 10 ₴ на день'));
  if(balOpen) drawBalCharts();
}
function drawBalCharts(){
  const ctx = balLast; if(!ctx) return;
  const series = ctx.series || [];
  [['inc', 'totalIncome', 'var(--income)', 'Доходи за останні місяці'], ['exp', 'totalExpense', 'var(--expense)', 'Витрати за останні місяці']].forEach(function(cfg){
    const host = document.getElementById('bal-ch-' + cfg[0]), sel = document.getElementById('bal-sel-' + cfg[0]);
    if(!host || !sel) return;
    const vals = series.map(function(t){ return t[cfg[1]]; });
    const def = vals.length ? 'за ' + vals.length + ' ' + monthsWord(vals.length) : 'немає даних';
    const sig = chartSignature([vals, host.clientWidth]);
    if(host.dataset.sig === sig && host.firstElementChild) return;
    host.dataset.sig = sig;
    balLineChart(host, vals, cfg[2], cfg[3], function(i){
      sel.innerHTML = i < 0 ? def : (UA_MONTHS[parseInt(series[i].m.slice(5, 7), 10) - 1] + ': <b>' + fmt(vals[i]) + '</b>');
    });
  });
}
function toggleBalanceCard(){
  const card = document.getElementById('bal-card'), btn = document.getElementById('bal-toggle');
  if(!card) return;
  balOpen = !balOpen;
  card.classList.toggle('open', balOpen);
  if(btn) btn.setAttribute('aria-expanded', balOpen ? 'true' : 'false');
  if(balOpen) requestAnimationFrame(drawBalCharts);
}
// Повторна поява (візит/зміна місяця): число котиться від нуля, смуга днів з'являється знову.
function balReplay(){ if(balLast) renderBalanceCard(balLast, true); if(balTilesLast) renderDebtOchTiles(balTilesLast, true); if(balPotLast) renderPotentialCard(balPotLast, true); dynReplay(); }
(function(){
  let t = null;
  window.addEventListener('resize', function(){ if(!balOpen) return; clearTimeout(t); t = setTimeout(function(){ const a = document.getElementById('bal-ch-inc'), b = document.getElementById('bal-ch-exp'); if(a) delete a.dataset.sig; if(b) delete b.dataset.sig; drawBalCharts(); }, 150); });
})();
/* ===== Rev 2.32.386 (DS-5b): плитки «Борг» і «ОЧ» та їхні шторки (макет analytics-ds v18, картка 3; docs/reports/DS-5-step0.md, «Рішення 18.11») =====
   Формули (підтверджено): F5 частка ОЧ, F6 «% використано», «погашено %» — чинна формула кільця «Скорочення боргу» ((старт − зараз) / старт); дельта боргу лише з cardDeltaKnown (FINANCIAL_RULES §3.1).
   Крапки неповних даних: на плитках — .data-status (борг: чинний debtUiStatus; ОЧ: renderInstDot), у шторках — .cdr-dot біля назви. Ризики/альтернативи: у шторках крапка без дії (деталі в «Обліку»); «активні» ОЧ = залишок > 0. */
// F5: частка сплаченого = Σ(початкова − залишок) / Σ початкова по активних ОЧ (залишок > 0) із відомою початковою сумою; кожен внесок 0..початкова. fraction = null, якщо немає жодної такої ОЧ.
function ochPaidFraction(items){
  let paid = 0, base = 0, used = 0, skipped = 0, active = 0;
  (items || []).forEach(function(it){
    const b = Number(it && it.balance);
    if(!(b > 0)) return;
    active++;
    const ini = Number(it.initial);
    if(!(ini > 0)){ skipped++; return; }
    base += ini; paid += Math.max(0, Math.min(ini, ini - b)); used++;
  });
  return { fraction: base > 0 ? paid / base : null, used: used, skipped: skipped, active: active, base: base };
}
// F6: «% використано» = борг / кредитний ліміт; смуга клампиться до 100 %, текст показує реальний відсоток (може бути > 100); ліміт не вказано → без смуги й відсотка.
function cardUsageModel(balance, limit){
  const b = Number(balance) || 0, l = Number(limit) || 0;
  if(!(l > 0)) return { hasLimit: false, usage: null, pct: null, fill: 0, zero: !(b > 0), over: false };
  const u = b / l;
  return { hasLimit: true, usage: u, pct: Math.round(u * 100), fill: Math.max(0, Math.min(1, u)), zero: !(b > 0), over: u > 1 };
}
// «Погашено %» боргу: (старт − зараз) / старт (формула колишнього кільця «Скорочення боргу»); старт ≤ 0 → без відсотка; борг зріс → grew, смуга порожня.
function debtPaidModel(startTotal, nowTotal){
  const s = Number(startTotal) || 0, n = Number(nowTotal) || 0;
  if(!(s > 0)) return { has: false, pct: null, fill: 0, grew: false };
  const raw = (s - n) / s * 100;
  return { has: true, pct: Math.round(raw), fill: Math.max(0, Math.min(1, raw / 100)), grew: raw < 0 };
}
// Підпис під сумою боргу: дельта лише за фактом обох місяців; перенесене значення — «Станом на …»; без боргів — «Боргів немає». tone: good | bad | ''.
function debtDeltaCaption(o){
  if(!o.hasDebtData || !o.hasData) return { text: 'Боргів немає', tone: '' };
  if(!o.isCurrent) return { text: 'Станом на ' + monthLabel(o.asOfMonth), tone: '' };
  if(!o.deltaKnown) return { text: 'немає даних за ' + UA_MONTHS[parseInt(o.prevMonth.slice(5, 7), 10) - 1], tone: '' };
  const g = monthGenitive(o.prevMonth);
  if(o.delta > 0) return { text: '−' + fmt(o.delta) + ' від ' + g, tone: 'good' };
  if(o.delta < 0) return { text: '+' + fmt(-o.delta) + ' від ' + g, tone: 'bad' };
  return { text: 'без змін від ' + g, tone: '' };
}
function activeWord(n){ const m10 = n % 10, m100 = n % 100; return (m10 === 1 && m100 !== 11) ? 'активна' : ((m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'активні' : 'активних'); }

let balTilesLast = null;
function installmentAccFor(d){ return installmentAccounts.find(function(a){ return a.name === d.name; }) || null; }
function incompleteInstalmentsNow(){
  return installmentAccounts.filter(function(a){ return isInstallmentVisibleForMonth(a, selectedMonth) && installmentIncompleteReasons(a).length > 0; });
}
// Крапка неповних даних плитки «ОЧ» (той самий .data-status і попап, що біля «Борг»): які ОЧ мають неповні дані; дія — перейти в «Облік → ОЧ».
function renderInstDot(){
  const wrap = document.getElementById('bal-inst-asof');
  if(!wrap) return;
  const list = incompleteInstalmentsNow();
  if(!list.length){ wrap.classList.add('hidden'); closeDataStatusPopover(wrap); return; }
  wrap.classList.remove('hidden'); wrap.classList.add('warning');
  const btn = wrap.querySelector('.data-status-dot'), titleEl = wrap.querySelector('.dsp-title'), textEl = wrap.querySelector('.dsp-text'), hintEl = wrap.querySelector('.dsp-hint'), actionEl = wrap.querySelector('.dsp-action');
  btn.setAttribute('aria-label', 'Стан даних: неповні дані ОЧ');
  titleEl.textContent = 'Інформація неповна';
  const names = list.slice(0, 4).map(function(a){ return stripLeadingEmoji(a.name); }).join(', ');
  textEl.textContent = 'Не всі дані внесено для ' + list.length + ' ОЧ: ' + names + (list.length > 4 ? ', ще ' + (list.length - 4) : '') + '.';
  hintEl.textContent = 'Найчастіше бракує початкової суми чи дня платежу.'; hintEl.classList.remove('hidden');
  actionEl.classList.remove('hidden'); actionEl.textContent = 'Відкрити ОЧ в «Обліку»'; actionEl.onclick = goToInstallmentsTab;
}
function goToInstallmentsTab(){
  closeAllDataStatusPopovers();
  performSwitchTab('accounting');
  switchAccountingTab('installments');
}
// c: { month, prevMonth, hasDebtData, debtNow, debtStart, cardAsOf, cardDeltaKnown, cardDelta, status }
function renderDebtOchTiles(c, replay){
  if(!c || !document.getElementById('bal-pair')) return;
  balTilesLast = c;
  const setText = function(id, t){ const el = document.getElementById(id); if(el) el.textContent = String(t).replace(/ ₴/g, '\u00a0₴'); }; // ₴ не відривається від суми на вузькій плитці
  const setFill = function(id, v){ const el = document.getElementById(id); if(el) el.style.setProperty('--v', String(Math.max(0, Math.min(1, v)))); };
  const instList = c.debtNow.list.filter(function(d){ return d.kind === 'installment'; });
  // «Борг»
  const hasCards = c.hasDebtData && c.cardAsOf.hasData;
  const debtEl = document.getElementById('kpi-debt');
  if(debtEl){ if(hasCards) debtEl.dataset.final = String(Math.round(c.debtNow.total)); else delete debtEl.dataset.final; odoRender(debtEl, hasCards ? fmt(c.debtNow.total) : '—', replay); }
  const dc = debtDeltaCaption({ hasDebtData: c.hasDebtData, hasData: c.cardAsOf.hasData, isCurrent: c.cardAsOf.isCurrent, asOfMonth: c.cardAsOf.asOfMonth, deltaKnown: c.cardDeltaKnown, delta: c.cardDelta, month: c.month, prevMonth: c.prevMonth });
  setText('bal-debt-cap', dc.text); const capEl = document.getElementById('bal-debt-cap'); if(capEl) capEl.className = 'bal-tcap' + (dc.tone === 'good' ? ' pos' : (dc.tone === 'bad' ? ' neg' : ''));
  const pm = hasCards ? debtPaidModel(c.debtStart.total, c.debtNow.total) : { has: false, fill: 0 };
  setFill('bal-debt-fill', pm.fill);
  setText('bal-debt-cap2', !pm.has ? '' : (pm.grew ? 'борг зріс на ' + Math.abs(pm.pct) + '% від старту' : 'погашено ' + pm.pct + '%'));
  renderDataStatusDot('bal-debt-asof', c.status, c.month);
  // «ОЧ»
  const hasInst = c.hasDebtData && instList.length > 0;
  const items = instList.map(function(d){ const acc = installmentAccFor(d); return { initial: acc ? acc.initialAmount : null, balance: d.balance }; });
  const fr = ochPaidFraction(items);
  const ochEl = document.getElementById('kpi-och');
  if(ochEl){ if(hasInst) ochEl.dataset.final = String(Math.round(c.debtNow.totalMonthlyInstallment)); else delete ochEl.dataset.final; odoRender(ochEl, hasInst ? fmt(c.debtNow.totalMonthlyInstallment) : '—', replay); }
  const unit = document.getElementById('bal-inst-unit'); if(unit) unit.classList.toggle('hidden', !hasInst);
  setText('bal-inst-cap', hasInst ? 'залишок ' + fmt(c.debtNow.totalInstallment) : (c.hasDebtData ? 'активних ОЧ немає' : 'ОЧ немає'));
  setFill('bal-inst-fill', !hasInst ? 0 : (fr.active === 0 ? 1 : (fr.fraction === null ? 0 : fr.fraction)));
  setText('bal-inst-cap2', !hasInst ? '' : (fr.active === 0 ? 'усі ОЧ сплачено' : (fr.fraction === null ? 'початкові суми не вказано' : 'сплачено ' + Math.round(fr.fraction * 100) + '%')));
  renderInstDot();
  refreshBalSheets();
}

// ---- шторки (компонент .drawer, DS-4) ----
function balLogoHtml(name, kind){ return '<span class="bal-logo">' + bankIcon(name, 32, true, kind) + '</span>'; }
function balDotHtml(){ return '<span class="cdr-dot" role="img" aria-label="Дані заповнені неповністю"></span>'; }
function balStyleV(v){ return 'style="--v:' + Math.max(0, Math.min(1, Number(v) || 0)).toFixed(4) + '"'; }
function debtSheetHtml(c){
  const cards = c.debtNow.list.filter(function(d){ return d.kind === 'card'; }).slice().sort(function(a, b){ return b.balance - a.balance; });
  if(!c.hasDebtData || !cards.length) return '<div class="empty-hint">' + (c.hasDebtData ? 'Немає записів по картках станом на цей місяць.' : 'Ще немає даних. Додай борги на вкладці «Облік» або імпортуй з Excel у «Сервіс».') + '</div>';
  const pm = debtPaidModel(c.debtStart.total, c.debtNow.total);
  const dc = debtDeltaCaption({ hasDebtData: c.hasDebtData, hasData: c.cardAsOf.hasData, isCurrent: c.cardAsOf.isCurrent, asOfMonth: c.cardAsOf.asOfMonth, deltaKnown: c.cardDeltaKnown, delta: c.cardDelta, month: c.month, prevMonth: c.prevMonth });
  let h = '<div class="bal-sumbox"><div class="bal-srow"><span class="bal-stotal">' + fmt(c.debtNow.total) + '</span><span class="bal-scap' + (dc.tone === 'good' ? ' pos' : (dc.tone === 'bad' ? ' neg' : '')) + '">' + escapeHtml(dc.text) + '</span></div>' +
    '<div class="bal-strack"><div class="bal-fill income" ' + balStyleV(pm.fill) + '></div></div>' +
    '<div class="bal-srow"><span class="bal-scap">' + (!pm.has ? '' : (pm.grew ? 'Борг зріс на ' + Math.abs(pm.pct) + '% від стартового' : 'Погашено ' + pm.pct + '% стартового боргу')) + '</span><span class="bal-scap3">' + (pm.has ? 'старт ' + fmt(c.debtStart.total) : '') + '</span></div></div><div class="bal-slist">';
  cards.forEach(function(d){
    const acc = debtAccount(d), u = cardUsageModel(d.balance, acc ? acc.creditLimit : null);
    const incomplete = acc ? cardIncompleteReasons(acc).length > 0 : false;
    h += '<div class="bal-dr">' +
      '<div class="bal-top2">' + balLogoHtml(d.name, 'card') + '<span class="bal-nm">' + escapeHtml(stripLeadingEmoji(d.name)) + (incomplete ? balDotHtml() : '') + '</span><span class="bal-mono' + (u.zero ? ' dim' : '') + '">' + fmt(d.balance) + '</span></div>' +
      (u.hasLimit ? '<div class="bal-strack"><div class="bal-fill ' + (u.over ? 'over' : 'debt') + '" ' + balStyleV(u.fill) + '></div></div>' : '') +
      '<div class="bal-srow"><span class="bal-scap3">' + (u.hasLimit ? 'кредитний ліміт ' + fmt(acc.creditLimit) : 'кредитний ліміт не вказано') + '</span><span class="bal-scap3">' + (u.hasLimit ? (u.zero ? 'без боргу' : u.pct + '% використано') : '') + '</span></div></div>';
  });
  return h + '</div>';
}
function instSheetHtml(c){
  const all = c.debtNow.list.filter(function(d){ return d.kind === 'installment'; });
  if(!c.hasDebtData || !all.length) return '<div class="empty-hint">' + (c.hasDebtData ? 'Немає активних ОЧ станом на цей місяць.' : 'Ще немає даних. Додай ОЧ на вкладці «Облік» або імпортуй з Excel у «Сервіс».') + '</div>';
  const act = all.filter(function(d){ return d.balance > 0; }).sort(function(a, b){ return b.balance - a.balance; });
  const fr = ochPaidFraction(all.map(function(d){ const acc = installmentAccFor(d); return { initial: acc ? acc.initialAmount : null, balance: d.balance }; }));
  let h = '<div class="bal-sumbox"><div class="bal-srow"><span class="bal-stotal">' + fmt(c.debtNow.totalMonthlyInstallment) + ' <small class="bal-ssmall">/ міс</small></span><span class="bal-scap">залишок ' + fmt(c.debtNow.totalInstallment) + '</span></div>' +
    '<div class="bal-strack"><div class="bal-fill income" ' + balStyleV(act.length === 0 ? 1 : (fr.fraction === null ? 0 : fr.fraction)) + '></div></div>' +
    '<div class="bal-srow"><span class="bal-scap">' + (act.length === 0 ? 'Усі ОЧ сплачено' : (fr.fraction === null ? 'Початкові суми не вказано' : 'Сплачено ' + Math.round(fr.fraction * 100) + '% · ' + act.length + ' ' + activeWord(act.length))) + '</span><span class="bal-scap3">' + (fr.base > 0 ? 'початкова ' + fmt(fr.base) : '') + '</span></div></div><div class="bal-slist">';
  if(!act.length) return h + '</div>';
  act.forEach(function(d){
    const acc = installmentAccFor(d), std = acc ? installmentStandardPayment(acc) : null, pay = std != null ? std : d.monthlyPayment;
    const model = ochOvalsModel(acc ? acc.termMonths : null, d.balance, std);
    const k = model.mode === 'ovals' ? (model.paid !== undefined ? model.paid : model.done) : null, n = model.term || model.total;
    const ini = acc && Number(acc.initialAmount) > 0 ? Number(acc.initialAmount) : null;
    const incomplete = acc ? installmentIncompleteReasons(acc).length > 0 : false;
    h += '<div class="bal-dr">' +
      '<div class="bal-top2">' + balLogoHtml(d.name, 'installment') + '<span class="bal-nm">' + escapeHtml(stripLeadingEmoji(d.name)) + (incomplete ? balDotHtml() : '') + '<span class="bal-nsub">' + (ini !== null ? 'початкова сума ' + fmt(ini) : 'початкова сума не вказана') + '</span></span>' +
      '<span class="bal-mono">' + (pay != null ? fmt(pay) : '—') + '<small> /міс</small></span></div>' +
      (model.mode === 'ovals' ? ochOvalsHtml(model) : '') +
      '<div class="bal-srow"><span class="bal-scap3">' + (k !== null ? k + ' з ' + n + ' платежів' : '') + '</span><span class="bal-scap3">залишок ' + fmt(d.balance) + '</span></div></div>';
  });
  return h + '</div>';
}
function renderBalSheet(which){
  const c = balTilesLast;
  const body = document.getElementById(which === 'debt' ? 'bal-sheet-debt-body' : 'bal-sheet-inst-body');
  if(!body || !c) return;
  const drawer = document.getElementById(which === 'debt' ? 'bal-sheet-debt' : 'bal-sheet-inst');
  const top = drawer ? drawer.scrollTop : 0;
  body.innerHTML = which === 'debt' ? debtSheetHtml(c) : instSheetHtml(c);
  if(drawer) drawer.scrollTop = top;
}
// Відкрита шторка перемальовується з нових даних (другий пристрій, зміна місяця під шторкою).
function refreshBalSheets(){
  [['debt', 'bal-sheet-debt'], ['inst', 'bal-sheet-inst']].forEach(function(p){ const d = document.getElementById(p[1]); if(d && d.classList.contains('open')) renderBalSheet(p[0]); });
  const cd = document.getElementById('bal-sheet-cats'); if(cd && cd.classList.contains('open')) renderCatsSheet(); // Rev 2.32.388 (DS-5c-1): шторка деталізації перемальовується з нових даних
}
function balSheetOpen(id){
  const b = document.getElementById(id + '-backdrop'), d = document.getElementById(id);
  if(!d) return;
  const was = d.classList.contains('open');
  lastFocusedBeforeDialog = document.activeElement;
  if(b){ b.removeAttribute('inert'); b.classList.add('open'); }
  d.removeAttribute('inert'); d.classList.add('open'); focusFirstIn(d);
  if(!was) lockBackgroundScroll();
}
function balSheetClose(id){
  const b = document.getElementById(id + '-backdrop'), d = document.getElementById(id);
  if(!d) return;
  const was = d.classList.contains('open');
  if(b){ b.classList.remove('open'); b.setAttribute('inert', ''); }
  d.classList.remove('open'); d.setAttribute('inert', '');
  restoreFocus();
  if(was) unlockBackgroundScroll();
}
function openDebtSheet(){ renderBalSheet('debt'); balSheetOpen('bal-sheet-debt'); }
function closeDebtSheet(){ balSheetClose('bal-sheet-debt'); }
function openInstSheet(){ renderBalSheet('inst'); balSheetOpen('bal-sheet-inst'); }
function closeInstSheet(){ balSheetClose('bal-sheet-inst'); }
/* ===== Rev 2.32.388 (DS-5c-1): картка «Деталізація витрат» і шторка з кільцями (макет analytics-ds v18, картка 4; docs/reports/DS-5-step0.md, «Рішення 18.11») =====
   F9: відсотки — частка суми витрат місяця (не доходу). Кільце: топ-5 + «Решта» (якщо в «Інших» одна позиція — лишається під власною назвою); список шторки — усі позиції; підкатегорії — з рядком «Без підкатегорії» (витрати без підкатегорії).
   Колір: категорії --k1…--k5 за рангом, решта й «Без підкатегорії» --k6; підкатегорія — відтінок кольору категорії (100/64/42 % за рангом у ній). Анімація довжини дуги (stroke-dasharray) — свідомий виняток із «лише transform/opacity»; при «зменшити рух» вимкнена. */
const DONUT_LABEL_MIN = 7;     // підпис (емодзі й %) на секторі від 7 % витрат
const DONUT_R = 80.9;          // радіус підписів у кільці 208 pt
const DONUT_SHADES = [100, 64, 42];
// Розбивка витрат місяця: cats (усі категорії), subs (усі підкатегорії + «Без підкатегорії»); кожна позиція { key, name, sum, emoji, parent }; total — сума витрат. Записи з сумою ≤ 0 не рахуються.
function catBreakdown(monthExp){
  const byCat = {}, bySub = {}, subCat = {};
  let total = 0, none = 0;
  (monthExp || []).forEach(function(e){
    const a = Number(e && e.amount);
    if(!(a > 0)) return;
    total += a;
    const cat = e.category || '🧾 Без категорії';
    byCat[cat] = (byCat[cat] || 0) + a;
    if(e.subcategory){
      bySub[e.subcategory] = (bySub[e.subcategory] || 0) + a;
      (subCat[e.subcategory] = subCat[e.subcategory] || {})[cat] = ((subCat[e.subcategory] || {})[cat] || 0) + a;
    }else none += a;
  });
  const desc = function(x, y){ return y.sum - x.sum || (x.name < y.name ? -1 : 1); };
  const mk = function(raw, sum, kind, parent){ return { key: kind + ':' + raw, name: stripLeadingEmoji(raw) || raw, sum: sum, icon: tileForName(raw).text, parent: parent || '' }; };
  const cats = Object.keys(byCat).map(function(k){ return mk(k, byCat[k], 'c', ''); }).sort(desc);
  const subs = Object.keys(bySub).map(function(k){
    const pc = subCat[k]; let best = '', bs = -1; Object.keys(pc).forEach(function(c){ if(pc[c] > bs){ bs = pc[c]; best = c; } }); // батько — категорія з більшою сумою
    return mk(k, bySub[k], 's', best);
  });
  if(none > 0) subs.push({ key: 'n:', name: 'Без підкатегорії', sum: none, icon: tileForName('Без підкатегорії').text, parent: '' });
  subs.sort(desc);
  return { total: total, cats: cats, subs: subs };
}
// Кільце: частки, «Решта», межа підпису, дуги. maxNamed = 5.
function donutModel(items, maxNamed){
  const mx = maxNamed || 5;
  const list = (items || []).filter(function(i){ return i && Number(i.sum) > 0; }).slice().sort(function(a, b){ return b.sum - a.sum; });
  const total = list.reduce(function(s, i){ return s + Number(i.sum); }, 0);
  if(!(total > 0)) return { total: 0, count: 0, empty: true, segs: [] };
  let head = list, rest = [];
  if(list.length - mx > 1){ head = list.slice(0, mx); rest = list.slice(mx); } // «Решта» лише коли в них щонайменше дві позиції
  const raw = head.map(function(i){ return { key: i.key, name: i.name, sum: Number(i.sum), icon: i.icon || '', parent: i.parent || '', other: false, restKeys: [] }; });
  if(rest.length) raw.push({ key: '__other', name: 'Решта', sum: rest.reduce(function(s, i){ return s + Number(i.sum); }, 0), icon: '📦', parent: '', other: true, restKeys: rest.map(function(i){ return i.key; }) });
  let a = 0;
  const segs = raw.map(function(s){
    const share = s.sum / total * 100, mid = (a + share / 2) / 100 * 2 * Math.PI - Math.PI / 2, single = raw.length === 1;
    const out = Object.assign({}, s, { share: share, pct: Math.round(share), label: share >= DONUT_LABEL_MIN,
      dash: single ? 100 : Math.max(share - 0.8, 0.3), offset: single ? -a : -(a + 0.4), lx: 104 + DONUT_R * Math.cos(mid), ly: 104 + DONUT_R * Math.sin(mid) });
    a += share;
    return out;
  });
  return { total: total, count: list.length, empty: false, segs: segs };
}
function catPctText(sum, total){
  if(!(total > 0)) return '';
  const p = Math.round(sum / total * 100);
  return (p === 0 && sum > 0) ? '<1%' : p + '%';
}
// Колір позиції: категорія — --k1…--k5 за рангом (решта --k6); підкатегорія — відтінок кольору категорії; без батька — --k6.
function catColorIndex(rank){ return rank < 5 ? rank + 1 : 6; }
function catColor(item, mode, cats, subs){
  if(item.other || item.key === '__other') return 'var(--k6)';
  if(mode === 'cat') return 'var(--k' + catColorIndex(cats.findIndex(function(c){ return c.key === item.key; })) + ')';
  if(!item.parent) return 'var(--k6)';
  const pr = cats.findIndex(function(c){ return c.key === 'c:' + item.parent; });
  const sib = subs.filter(function(s){ return s.parent === item.parent; });
  const r = Math.min(sib.findIndex(function(s){ return s.key === item.key; }), DONUT_SHADES.length - 1);
  return 'color-mix(in srgb, var(--k' + catColorIndex(pr < 0 ? 5 : pr) + ') ' + DONUT_SHADES[Math.max(0, r)] + '%, var(--surface))';
}

let balCatMode = 'cat', balCatSel = null, balCatData = null, balCatSource = [], balCatMonth = null;
function balCatItems(){ return balCatData ? (balCatMode === 'cat' ? balCatData.cats : balCatData.subs) : []; }
function catRowHtml(item, max, mode, color, inSheet){
  const w = max > 0 ? item.sum / max : 0;
  const emoji = escapeHtml(item.icon || '?'); // емодзі з початку назви, без емодзі — перша літера (як у «Структурі», tileForName); крапка зарезервована за неповними даними
  return '<button type="button" class="bal-crow" data-k="' + escapeAttr(item.key) + '"><span class="bal-cli"><span class="bal-em" aria-hidden="true">' + emoji + '</span><span class="bal-cnm">' + escapeHtml(item.name) +
    (mode === 'sub' && item.parent ? '<span class="bal-csub">' + escapeHtml(stripLeadingEmoji(item.parent)) + '</span>' : '') + '</span><span class="bal-cam">' + fmt(item.sum) + '</span><span class="bal-cpc">' + catPctText(item.sum, balCatData.total) + '</span></span>' +
    '<span class="bal-ctrack"><span class="bal-cfill' + (inSheet ? '' : (mode === 'cat' ? ' cat' : ' sub')) + '" style="--v:' + Math.max(0, Math.min(1, w)).toFixed(4) + (inSheet ? ';background:' + color : '') + '"></span></span></button>';
}
function syncCatSegs(){
  ['bal-cat-seg', 'bal-cat-seg-s'].forEach(function(id){
    const seg = document.getElementById(id); if(!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function(b, i){ const on = b.dataset.m === balCatMode; b.setAttribute('aria-pressed', on ? 'true' : 'false'); if(on) seg.style.setProperty('--p', String(i)); });
  });
}
// Картка: сегмент + топ-4 позицій (емодзі, сума, %, смуга).
function renderCatCard(monthExp, month){
  const host = document.getElementById('bal-cat-top');
  if(!host) return;
  balCatSource = monthExp || [];
  if(month !== undefined && month !== balCatMonth){ balCatMonth = month; balCatSel = null; } // інший місяць — вибір скидається
  balCatData = catBreakdown(balCatSource);
  if(balCatSel && balCatSel !== '__other' && !balCatData.cats.concat(balCatData.subs).some(function(i){ return i.key === balCatSel; })) balCatSel = null;
  if(balCatSel === '__other' && !donutModel(balCatItems(), 5).segs.some(function(x){ return x.other; })) balCatSel = null; // «Решта» зникли — вибір скидається
  const items = balCatItems(), top = items.slice(0, 4);
  syncCatSegs();
  host.innerHTML = top.length ? top.map(function(i){ return catRowHtml(i, top[0].sum, balCatMode, '', false); }).join('') : '<div class="empty-hint">Немає витрат за цей місяць</div>';
  const all = document.getElementById('bal-cat-all'); if(all) all.classList.toggle('hidden', !items.length);
  refreshBalSheets();
}
function setCatMode(mode){
  if(mode !== 'cat' && mode !== 'sub') return;
  balCatMode = mode; balCatSel = null;
  renderCatCard(balCatSource);
}
function catCenterHtml(){
  const items = balCatItems(), total = balCatData ? balCatData.total : 0;
  if(!balCatSel){
    let cmp = '';
    const c = balLast;
    if(c){
      const lim = sameDayLimits(c.pos, c.prevMonth);
      if(lim){
        const pp = percentChange(sumUpToDay(c.curExp, c.month, lim.curDay), sumUpToDay(c.prevExp, c.prevMonth, lim.prevDay)), ab = monthGenitive(c.prevMonth).slice(0, 3);
        if(pp !== null) cmp = '<span class="bal-cpos' + (pp > 0 ? ' up' : '') + '">' + (pp > 0 ? '+' : (pp < 0 ? '−' : '')) + Math.abs(pp) + '% до ' + (lim.full ? ab : lim.prevDay + ' ' + ab) + '</span>';
      }
    }
    return '<b>' + fmt(total) + '</b><span>' + items.length + ' ' + (balCatMode === 'cat' ? (items.length === 1 ? 'категорія' : (items.length >= 2 && items.length <= 4 ? 'категорії' : 'категорій')) : (items.length === 1 ? 'підкатегорія' : (items.length >= 2 && items.length <= 4 ? 'підкатегорії' : 'підкатегорій'))) + '</span>' + cmp;
  }
  if(balCatSel === '__other'){
    const m = donutModel(items, 5), o = m.segs.filter(function(s){ return s.other; })[0];
    return o ? '<span class="bal-ce">' + escapeHtml(o.icon) + '</span><b>' + fmt(o.sum) + '</b><span>Решта · ' + catPctText(o.sum, total) + '</span>' : '<b>' + fmt(total) + '</b>';
  }
  const it = items.filter(function(i){ return i.key === balCatSel; })[0];
  if(!it) return '<b>' + fmt(total) + '</b>';
  return '<span class="bal-ce">' + escapeHtml(it.icon || '?') + '</span><b>' + fmt(it.sum) + '</b><span>' + escapeHtml(it.name) + ' · ' + catPctText(it.sum, total) + '</span>';
}
function applyCatSel(){
  const body = document.getElementById('bal-sheet-cats-body'); if(!body) return;
  const model = donutModel(balCatItems(), 5), restKeys = {};
  model.segs.forEach(function(s){ s.restKeys.forEach(function(k){ restKeys[k] = true; }); });
  const segOf = function(k){ return restKeys[k] ? '__other' : k; };
  const selSeg = balCatSel ? segOf(balCatSel) : null;
  Array.prototype.forEach.call(body.querySelectorAll('.bal-sg, .bal-dl'), function(g){ g.classList.toggle('dim', !!selSeg && g.dataset.k !== selSeg); });
  Array.prototype.forEach.call(body.querySelectorAll('.bal-crow'), function(r){ r.classList.toggle('on', !!balCatSel && (r.dataset.k === balCatSel || (balCatSel === '__other' && !!restKeys[r.dataset.k]))); });
  const c = document.getElementById('bal-sunc'); if(c){ c.innerHTML = catCenterHtml(); c.setAttribute('aria-label', (balCatSel ? c.innerText.replace(/\s+/g, ' ') + '. ' : '') + 'Скинути вибір'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
}
function renderBalDonut(){
  const wrap = document.getElementById('bal-sunwrap'); if(!wrap || !balCatData) return;
  const items = balCatItems(), model = donutModel(items, 5);
  if(model.empty){ wrap.innerHTML = '<svg viewBox="0 0 36 36" role="img" aria-label="Немає витрат"><circle cx="18" cy="18" r="14" fill="none" stroke="var(--surface-2)" stroke-width="7.4"/></svg><button type="button" class="bal-suc" id="bal-sunc" aria-label="Скинути вибір"></button>'; applyCatSel(); return; }
  let segs = '', labs = '';
  model.segs.forEach(function(s, i){
    const col = catColor(s, balCatMode, balCatData.cats, balCatData.subs);
    segs += '<circle class="bal-sg" data-k="' + escapeAttr(s.key) + '" cx="18" cy="18" r="14" pathLength="100" stroke-width="7.4" stroke="' + col + '" stroke-dasharray="0 100" data-v="' + s.dash.toFixed(2) + '" stroke-dashoffset="' + s.offset.toFixed(2) + '"/>';
    if(s.label) labs += '<span class="bal-dl" data-k="' + escapeAttr(s.key) + '" style="left:' + s.lx.toFixed(1) + 'px;top:' + s.ly.toFixed(1) + 'px;--n:' + i + '"><i>' + escapeHtml(s.icon || '') + '</i>' + s.pct + '%</span>';
  });
  wrap.innerHTML = '<svg viewBox="0 0 36 36" role="img" aria-label="' + (balCatMode === 'cat' ? 'Частки категорій' : 'Частки підкатегорій') + '">' + segs + '</svg>' + labs + '<button type="button" class="bal-suc" id="bal-sunc" aria-label="Скинути вибір"></button>';
  applyCatSel();
  const circles = wrap.querySelectorAll('.bal-sg');
  const finish = function(){ Array.prototype.forEach.call(circles, function(c){ c.setAttribute('stroke-dasharray', c.dataset.v + ' ' + (100 - parseFloat(c.dataset.v))); }); };
  if(motionReduced()) finish();
  else requestAnimationFrame(function(){ requestAnimationFrame(function(){ Array.prototype.forEach.call(circles, function(c, i){ c.style.transitionDelay = (120 + i * 45) + 'ms, 0ms'; }); finish(); }); });
}
function catsSheetHtml(){
  const items = balCatItems(), max = items.length ? items[0].sum : 0;
  const rows = items.map(function(i){ return catRowHtml(i, max, balCatMode, catColor(i, balCatMode, balCatData.cats, balCatData.subs), true); }).join('');
  return '<div class="bal-seg2" id="bal-cat-seg-s"><div class="ind"></div><button type="button" aria-pressed="true" data-m="cat">Категорії</button><button type="button" aria-pressed="false" data-m="sub">Підкатегорії</button></div>' +
    '<div class="bal-sunwrap" id="bal-sunwrap"></div><div class="bal-hint">Сектор показує частку витрат місяця. Торкніться сектора або рядка.</div><div id="bal-call">' + (rows || '<div class="empty-hint">Немає витрат за цей місяць</div>') + '</div>';
}
let balCatSheetSig = null;
function renderCatsSheet(force){
  const body = document.getElementById('bal-sheet-cats-body');
  if(!body || !balCatData) return;
  const sig = chartSignature([balCatMode, balCatItems().map(function(i){ return [i.key, i.sum]; })]);
  if(!force && sig === balCatSheetSig && body.firstElementChild){ applyCatSel(); return; } // дані не змінились: кільце не перемальовується й анімація не стартує знову
  balCatSheetSig = sig;
  const drawer = document.getElementById('bal-sheet-cats'), top = drawer ? drawer.scrollTop : 0;
  body.innerHTML = catsSheetHtml();
  syncCatSegs(); renderBalDonut();
  if(drawer) drawer.scrollTop = top;
}
function selectCat(key){
  balCatSel = (balCatSel === key) ? null : key;
  applyCatSel();
  if(balCatSel){ const r = document.querySelector('#bal-call .bal-crow.on'); if(r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest', behavior: motionReduced() ? 'auto' : 'smooth' }); }
}
function openCatsSheet(key, mode){
  if(mode === 'cat' || mode === 'sub') balCatMode = mode;
  balCatSel = key || null;
  renderCatsSheet(true); balSheetOpen('bal-sheet-cats');
  if(balCatSel){ const r = document.querySelector('#bal-call .bal-crow.on'); if(r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' }); }
}
function closeCatsSheet(){ balSheetClose('bal-sheet-cats'); balCatSel = null; }
(function(){
  const top = document.getElementById('bal-cat-top');
  if(top) top.addEventListener('click', function(e){ const b = e.target.closest('[data-k]'); if(b) openCatsSheet(b.dataset.k, balCatMode); });
  const seg = document.getElementById('bal-cat-seg');
  if(seg) seg.addEventListener('click', function(e){ const b = e.target.closest('button[data-m]'); if(b) setCatMode(b.dataset.m); });
  const sheet = document.getElementById('bal-sheet-cats-body');
  if(sheet) sheet.addEventListener('click', function(e){
    const sb = e.target.closest('#bal-cat-seg-s button[data-m]');
    if(sb){ if(sb.dataset.m !== balCatMode){ balCatMode = sb.dataset.m; balCatSel = null; renderCatCard(balCatSource); } return; } // renderCatCard перемальовує й відкриту шторку
    if(e.target.closest('#bal-sunc')){ balCatSel = null; applyCatSel(); return; }
    const k = e.target.closest('[data-k]'); if(k) selectCat(k.dataset.k);
  });
})();
/* ===== Rev 2.32.390 (DS-5c-2): картка «Потенціал економії» (макет analytics-ds v18, картка 5; docs/reports/DS-5-step0.md, «Рішення 18.11») =====
   F7: чинна формула без змін — топ-5 підкатегорій із позначкою рівня за (сума × коефіцієнт рівня 1 / 0,65 / 0,25, SUBCATEGORY_PRIORITY); «потенціал» = Σ сум цих п'яти (як у колишній таблиці), підпис «Можна скоротити цього місяця».
   F8: «≈ на рік» = 12 × типовий місяць того самого показника: вікно — до 6 місяців перед вибраним; місяці без жодного запису витрат виключаються, місяць із записами без позначених підкатегорій дає 0; n ≥ 5 — без найбільшого й найменшого, 3–4 — просте середнє, < 3 — просте середнє з позначкою «мало даних»; без жодного місяця — «на рік» не показуємо; округлення до 100.
   Пріоритети — поточні налаштування (перераховують і минулі місяці; свідомо). */
const POT_SHADES = [100, 72, 50, 36, 24];
// F7: топ-5 за (сума × коефіцієнт) і сума цих п'яти; дослівно колишня логіка renderDashboard (bySub лише з записів з підкатегорією).
function savingsPotential(monthExp, prio){
  const bySub = {};
  (monthExp || []).forEach(function(e){ if(!e.subcategory) return; bySub[e.subcategory] = (bySub[e.subcategory] || 0) + e.amount; });
  const P = prio || {};
  const items = Object.entries(bySub)
    .map(function(pair){ return { name: pair[0], sum: pair[1], priority: P[pair[0]] }; })
    .filter(function(r){ return !!r.priority; })
    .map(function(r){ return Object.assign({}, r, { weighted: r.sum * r.priority.score }); })
    .sort(function(a, b){ return b.weighted - a.weighted; })
    .slice(0, 5);
  return { items: items, total: items.reduce(function(s, r){ return s + r.sum; }, 0) };
}
// Рівень за коефіцієнтом: ≥ 1 — високий, ≥ 0,5 — середній, інакше низький (кольори: зелений / бурштиновий / нейтральний).
function potLevel(priority){
  const sc = Number(priority && priority.score);
  return sc >= 1 ? 'high' : (sc >= 0.5 ? 'mid' : 'low');
}
// F8: values — потенціал кожного з місяців вікна (лише місяці з записами). Повертає { typical, year, n, few, trimmed } або null (немає жодного місяця).
function typicalMonth(values){
  const v = (values || []).map(Number).filter(function(x){ return isFinite(x); });
  const n = v.length;
  if(n === 0) return null;
  let base = v;
  if(n >= 5){ base = v.slice().sort(function(a, b){ return a - b; }).slice(1, -1); } // без найбільшого й найменшого
  const mean = base.reduce(function(a, b){ return a + b; }, 0) / base.length;
  const typical = roundSym(mean, 100);
  return { typical: typical, year: 12 * typical, n: n, few: n < 3, trimmed: n >= 5 };
}
// Вікно F8: до 6 календарних місяців перед вибраним, але лише ПОВНІ: поточний (ще неповний) місяць і пізніші ніколи не входять — навіть коли вибрано наступний місяць (інакше неповний місяць занижує типовий).
function potentialWindowMonths(month, todayKey){
  const out = [];
  for(let i = 1; i <= 6; i++){ const m = shiftMonth(month, -i); if(m < todayKey) out.push(m); }
  return out;
}
let balPotOpen = false, balPotLast = null;
// Помічені підкатегорії для підказки порожнього стану (з поточних налаштувань, без емодзі).
function potMarkedHint(){
  const names = Object.keys(SUBCATEGORY_PRIORITY || {}).slice(0, 3).map(function(n){ return stripLeadingEmoji(n); });
  return 'Рівень потенціалу мають лише позначені підкатегорії' + (names.length ? ' (наприклад: ' + names.join(', ') + ')' : '') + '. Позначити: «Структура» → підкатегорія → «Потенціал економії».';
}
// ctx: { month, pot, totalExpense, typ }
function renderPotentialCard(ctx, replay){
  const card = document.getElementById('bal-pot-card');
  if(!card || !ctx) return;
  balPotLast = ctx;
  const items = ctx.pot.items, empty = items.length === 0;
  const get = function(id){ return document.getElementById(id); };
  card.classList.toggle('is-empty', empty);
  const showOpen = balPotOpen && !empty; // бажаний стан розгортання зберігається; у порожньому стані картка згорнута (клас і aria-expanded)
  card.classList.toggle('open', showOpen);
  const btn = get('bal-pot-toggle'); if(btn){ btn.setAttribute('aria-disabled', empty ? 'true' : 'false'); btn.setAttribute('aria-expanded', showOpen ? 'true' : 'false'); }
  const emptyEl = get('bal-pot-empty'); if(emptyEl){ emptyEl.textContent = 'Немає підкатегорій для аналізу'; }
  const hint = get('bal-pot-hint'); if(hint) hint.textContent = potMarkedHint();
  const num = get('kpi-pot');
  if(num){ if(empty) delete num.dataset.final; else num.dataset.final = String(Math.round(ctx.pot.total)); odoRender(num, empty ? '—' : fmt(ctx.pot.total), replay); }
  // три найбільші позиції: емодзі або перша літера (правило «Структури»)
  const em = get('bal-pot-em'); if(em) em.innerHTML = items.slice(0, 3).map(function(r){ return '<span aria-hidden="true">' + escapeHtml(tileForName(r.name).text) + '</span>'; }).join('');
  // смуга частки від витрат місяця: сегмент на позицію
  const bar = get('bal-pot-bar');
  if(bar){
    const te = Number(ctx.totalExpense) || 0;
    bar.setAttribute('aria-label', te > 0 ? catPctText(ctx.pot.total, te) + ' витрат — необов’язкові' : '');
    bar.innerHTML = items.map(function(r, i){ return '<i style="width:' + (te > 0 ? Math.max(0, Math.min(100, r.sum / te * 100)).toFixed(2) : '0') + '%;background:color-mix(in srgb, var(--income) ' + POT_SHADES[i] + '%, var(--surface));--n:' + i + '"></i>'; }).join('');
  }
  const share = get('bal-pot-share'); if(share) share.textContent = ctx.totalExpense > 0 ? catPctText(ctx.pot.total, ctx.totalExpense) + ' із ' + fmt(ctx.totalExpense) + ' витрат' : '';
  const yr = get('bal-pot-year');
  if(yr){
    if(!ctx.typ){ yr.innerHTML = ''; }
    else yr.innerHTML = '<span class="pos">≈ ' + escapeHtml(fmt(ctx.typ.year)) + '</span> на рік' + (ctx.typ.few ? ' <span class="bal-few">· мало даних</span>' : '');
  }
  // розгорнутий список: рівень потенціалу, сума, внесок у потенціал
  const list = get('bal-pot-list');
  if(list) list.innerHTML = items.map(function(r){
    const lv = potLevel(r.priority), label = lv === 'high' ? 'Високий' : (lv === 'mid' ? 'Середній' : 'Низький');
    return '<div class="bal-pli"><span class="bal-em" aria-hidden="true">' + escapeHtml(tileForName(r.name).text) + '</span><span class="bal-pnm">' + escapeHtml(stripLeadingEmoji(r.name)) + '<span class="bal-psub">' + escapeHtml(fmt(r.sum)) + ' · внесок ' + catPctText(r.sum, ctx.pot.total) + '</span></span><span class="bal-plvl ' + lv + '">' + label + '</span></div>';
  }).join('');
}
function togglePotCard(){
  const card = document.getElementById('bal-pot-card'), btn = document.getElementById('bal-pot-toggle');
  if(!card || card.classList.contains('is-empty')) return;
  balPotOpen = !balPotOpen;
  card.classList.toggle('open', balPotOpen);
  if(btn) btn.setAttribute('aria-expanded', balPotOpen ? 'true' : 'false');
}
/* ===== Rev 2.32.392 (DS-5d-1): картка «Динаміка за 6 місяців» (макет analytics-ds v18, картка 6; docs/reports/DS-5-step0.md, «Рішення 18.11») =====
   Один сегмент «Доходи і витрати / Борг», обидва графіки 212 pt: шкала зліва (F10: крок 5k/10k/20k/25k/40k/50k, не більше 4 інтервалів — лише відображення), сітка, місяці знизу, «Nk» над стовпчиками/точками, поточний неповний місяць напівпрозорий,
   дотик або ведення пальцем виділяє місяць (смуга, вертикальна лінія, решта приглушена, легенда з точними сумами), повторний дотик знімає вибір; touch-action: pan-y лишає вертикальну прокрутку.
   Борг: лінія з розривами — точка лише за місяць із ФАКТОМ запису (kindHasActualForMonth; FINANCIAL_RULES §3.1), carry-forward не малюється. Порожні дані — пояснення замість осі з NaN. */
const DYN_STEPS = [5000, 10000, 20000, 25000, 40000, 50000];
// F10: найменший крок зі списку (далі ×10, ×100 …), при якому в осі не більше 4 інтервалів; нуль, від'ємне й нечислове → 5000.
function niceAxisStep(max){
  const m = Number(max);
  if(!isFinite(m) || m <= 0) return 5000;
  for(let p = 1; p <= 1e9; p *= 10){
    for(let i = 0; i < DYN_STEPS.length; i++){ const st = DYN_STEPS[i] * p; if(m / st <= 4) return st; }
  }
  return DYN_STEPS[DYN_STEPS.length - 1] * 1e9;
}
// Вісь: step, верх (≥ одного кроку, кратний кроку) і поділки 0…верх.
function axisModel(max){
  const step = niceAxisStep(max), top = Math.max(step, Math.ceil((Number(max) > 0 ? Number(max) : 0) / step) * step), ticks = [];
  for(let v = 0; v <= top; v += step) ticks.push(v);
  return { step: step, top: top, ticks: ticks };
}
// Підпис «Nk»: від 1 000 — округлене до тисяч, менше — число як є (інакше 400 стало б «0k»).
function axisLabel(v){
  const n = Math.round(Number(v) || 0);
  return n === 0 ? '0' : (Math.abs(n) >= 1000 ? (n < 0 ? '-' : '') + Math.round(Math.abs(n) / 1000) + 'k' : String(n)); // симетрично для від'ємних (Math.round(−2,5) = −2)
}
// Шлях стовпчика з округленими верхніми кутами.
function dynBarPath(x, y, w, h, r){ x = +x; y = +y; w = +w; h = +h; r = Math.min(r, h); const f = function(v){ return Math.round(v * 10) / 10; }; x = f(x); y = f(y); w = f(w); h = f(h); return 'M' + x + ' ' + (y + h) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + h) + 'Z'; }
let dynMode = 'io', dynSel = -1, dynLast = null, dynMonth = null;
// Графік у host. o = { type:'bars'|'line', slots:[{m, label, cur, partial, vals:[…], has:bool}], series:[{color}], ro(i), aria }. Дані місяців без значення (has=false) не малюються.
function balAcChart(host, o){
  const W = host.clientWidth || 310, H = 212, pl = 34, pr = 4, pt = 24, pb = 24, n = o.slots.length;
  const all = [];
  o.slots.forEach(function(s){ if(s.has) s.vals.forEach(function(v){ if(v !== null) all.push(v); }); });
  const ax = axisModel(all.length ? Math.max.apply(null, all) : 0);
  const gw = (W - pl - pr) / n, X = function(i){ return pl + gw * (i + 0.5); }, Y = function(v){ return pt + (H - pt - pb) * (1 - v / ax.top); }, base = Y(0);
  let grid = '', body = '';
  ax.ticks.forEach(function(v){ const y = Y(v).toFixed(1); grid += '<line class="gridl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pl - 6) + '" y="' + (Number(y) + 4).toFixed(1) + '" text-anchor="end">' + axisLabel(v) + '</text>'; });
  if(o.type === 'bars'){
    const bw = Math.min(13, gw * 0.28), gap = 8;
    o.slots.forEach(function(s, i){
      if(!s.has){ return; }
      const x0 = X(i) - (2 * bw + gap) / 2;
      body += '<g class="grp">' + s.vals.map(function(v, k){ const x = x0 + k * (bw + gap), y = Y(v);
        return '<path class="bar' + (s.partial ? ' part' : '') + '" style="--n:' + (i * 2 + k) + '" fill="' + o.series[k].color + '" d="' + dynBarPath(x.toFixed(1), y.toFixed(1), bw.toFixed(1), (base - y).toFixed(1), 4) + '"/>' + (v > 0 ? '<text class="vt" style="--n:' + (i * 2 + k) + '" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle">' + axisLabel(v) + '</text>' : ''); }).join('') + '</g>';
    });
  }else{
    const col = o.series[0].color; let run = [], paths = '';
    const flush = function(){ if(run.length > 1) paths += '<path class="ln" pathLength="1" stroke="' + col + '" stroke-width="2.5" d="' + run.map(function(p, j){ return (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + '"/>'; run = []; };
    o.slots.forEach(function(s, i){ if(s.has && s.vals[0] !== null){ run.push([X(i), Y(s.vals[0])]); } else flush(); });
    flush();
    body = paths + o.slots.map(function(s, i){ if(!(s.has && s.vals[0] !== null)) return ''; const v = s.vals[0];
      return '<g class="grp"><circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="4" fill="' + col + '" stroke="var(--surface)" stroke-width="1.5" style="--n:' + i + '"/>' + (v > 0 ? '<text class="vt" style="--n:' + i + '" x="' + X(i).toFixed(1) + '" y="' + (Y(v) - 10).toFixed(1) + '" text-anchor="middle">' + axisLabel(v) + '</text>' : '') + '</g>'; }).join('');
  }
  host.classList.remove('has'); // новий малюнок: залишок вибору попереднього графіка (інший режим/дані) не приглушує групи
  host.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeAttr(o.aria) + '"><rect class="band" y="' + (pt - 18) + '" height="' + (base - pt + 18) + '" width="' + (gw - 4).toFixed(1) + '" rx="8"/>' + grid + '<line class="vl" y1="' + (pt - 18) + '" y2="' + base.toFixed(1) + '"/>' + body +
    o.slots.map(function(s, i){ return '<text class="xl' + (s.cur ? ' cur' : '') + (s.has ? '' : ' off') + '" x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + escapeHtml(s.label) + '</text>'; }).join('') + '</svg>';
  const svg = host.querySelector('svg'), band = host.querySelector('.band'), vl = host.querySelector('.vl'), gs = host.querySelectorAll('.grp'), xs = host.querySelectorAll('.xl');
  // групи є лише для місяців із даними: відповідність слот → група
  const grpIdx = []; o.slots.forEach(function(s, i){ if(s.has && s.vals.some(function(v){ return v !== null; })) grpIdx.push(i); });
  let sel = -1;
  const set = function(i){
    sel = i; dynSel = i;
    svg.classList.toggle('has', i >= 0); host.classList.toggle('has', i >= 0);
    band.classList.toggle('on', i >= 0); vl.classList.toggle('on', i >= 0);
    if(i >= 0){ band.setAttribute('x', X(i) - (gw - 4) / 2); vl.setAttribute('x1', X(i)); vl.setAttribute('x2', X(i)); }
    Array.prototype.forEach.call(gs, function(g, k){ g.classList.toggle('on', grpIdx[k] === i); });
    Array.prototype.forEach.call(xs, function(x, k){ x.classList.toggle('on', k === i); });
    o.ro(i);
  };
  chartScrub(host, function(x){ return Math.max(0, Math.min(n - 1, Math.floor((x - pl) / gw))); }, function(){ return sel; }, set);
  if(o.keep >= 0 && o.keep < n) set(o.keep); else o.ro(-1);
}
function dynLegendHtml(parts){ return parts.join(''); }
// c: { month, todayKey, months:[6 ключів], incomes:[], expenses:[], earliest, hasDebtData, debts:[{total, actual}], startMonth, status }
function renderDynCard(c, replay){
  const host = document.getElementById('bal-dyn-chart');
  if(!host) return;
  if(c.month !== dynMonth){ dynMonth = c.month; dynSel = -1; } // інший місяць — вибір скидається
  dynLast = c;
  const leg = document.getElementById('bal-dyn-leg'), note = document.getElementById('bal-dyn-note'), seg = document.getElementById('bal-dyn-seg');
  if(seg){ Array.prototype.forEach.call(seg.querySelectorAll('button'), function(b, i){ const on = b.dataset.k === dynMode; b.setAttribute('aria-pressed', on ? 'true' : 'false'); if(on) seg.style.setProperty('--p', String(i)); }); }
  const names = UA_MONTHS.map(function(x){ return x.charAt(0).toUpperCase() + x.slice(1); });
  const mname = function(m){ return names[parseInt(m.slice(5, 7), 10) - 1]; };
  let sig, draw = null;
  if(dynMode === 'io'){
    const slots = c.months.map(function(m, i){ return { m: m, label: monthLabelShort(m), cur: m === c.month, partial: m === c.todayKey, has: !!c.earliest && m >= c.earliest, vals: [c.incomes[i], c.expenses[i]] }; });
    const any = slots.some(function(s){ return s.has && (s.vals[0] > 0 || s.vals[1] > 0); });
    const def = '<span><i class="sq" style="background:var(--income)"></i>Доходи</span><span><i class="sq" style="background:var(--expense)"></i>Витрати</span>';
    if(!any){ host.innerHTML = '<div class="empty-hint">Ще немає даних про доходи й витрати. Додай записи на вкладці «Облік».</div>'; host.dataset.sig = ''; if(leg) leg.innerHTML = ''; if(note) note.textContent = ''; dynSel = -1; return; }
    sig = chartSignature(['io', slots.map(function(s){ return [s.m, s.has, s.vals, s.partial]; }), host.clientWidth]);
    const part = slots.filter(function(s){ return s.partial && s.has; })[0];
    if(note) note.textContent = part ? mname(part.m) + ' неповний: ' + balancePosition(part.m, localDateISO()).T + ' ' + dayWord(balancePosition(part.m, localDateISO()).T) + '. Торкніться місяця.' : 'Торкніться місяця або проведіть пальцем.';
    draw = function(){ balAcChart(host, { type: 'bars', slots: slots, series: [{ color: 'var(--income)' }, { color: 'var(--expense)' }], aria: 'Доходи і витрати за шість місяців', keep: replay ? -1 : dynSel,
      ro: function(i){ if(!leg) return; leg.innerHTML = i < 0 ? def : '<span><b>' + escapeHtml(mname(slots[i].m)) + '</b></span><span><i class="sq" style="background:var(--income)"></i><b>' + (slots[i].has ? fmt(slots[i].vals[0]) : '—') + '</b></span><span><i class="sq" style="background:var(--expense)"></i><b>' + (slots[i].has ? fmt(slots[i].vals[1]) : '—') + '</b></span>'; } }); };
  }else{
    if(!c.hasDebtData){ host.innerHTML = '<div class="empty-hint">Ще немає даних. Додай борги на вкладці «Облік» або імпортуй з Excel у «Сервіс».</div>'; host.dataset.sig = ''; if(leg) leg.innerHTML = ''; if(note) note.textContent = ''; dynSel = -1; return; }
    const slots = c.months.map(function(m, i){ const d = c.debts[i], ok = !!c.startMonth && m >= c.startMonth && d.actual; return { m: m, label: monthLabelShort(m), cur: m === c.month, partial: false, has: true, vals: [ok ? d.total : null] }; });
    if(!slots.some(function(s){ return s.vals[0] !== null; })){ host.innerHTML = '<div class="empty-hint">Немає фактичних записів боргу за ці місяці.</div>'; host.dataset.sig = ''; if(leg) leg.innerHTML = ''; if(note) note.textContent = ''; dynSel = -1; return; }
    sig = chartSignature(['debt', slots.map(function(s){ return [s.m, s.vals]; }), host.clientWidth]);
    if(note) note.textContent = 'Торкніться точки або проведіть пальцем. Розрив лінії — місяць без запису.';
    draw = function(){ balAcChart(host, { type: 'line', slots: slots, series: [{ color: 'var(--debt)' }], aria: 'Динаміка боргу за шість місяців', keep: replay ? -1 : dynSel,
      ro: function(i){ if(!leg) return;
        if(i < 0){ leg.innerHTML = '<span><i class="sw-ln" style="background:var(--debt)"></i>Борг на кінець місяця</span>'; return; }
        const v = slots[i].vals[0], pv = i > 0 ? slots[i - 1].vals[0] : null;
        leg.innerHTML = '<span><b>' + escapeHtml(mname(slots[i].m)) + '</b></span>' + (v === null ? '<span>немає даних</span>' : '<span><b>' + fmt(v) + '</b></span>' + (pv !== null ? '<span class="' + (v - pv <= 0 ? 'pos' : 'neg') + '">' + escapeHtml(fmtSigned(v - pv)) + '</span>' : '')); } }); };
  }
  if(!replay && host.dataset.sig === sig && host.firstElementChild && !host.querySelector('.empty-hint')) return; // дані не змінились: графік не перемальовується й анімація не стартує знову
  host.dataset.sig = sig; draw();
}
function setDynMode(k){
  if(k !== 'io' && k !== 'debt' || k === dynMode) return;
  dynMode = k; dynSel = -1;
  if(dynLast) renderDynCard(dynLast, false);
}
function dynReplay(){ if(dynLast){ dynSel = -1; renderDynCard(dynLast, true); } }
(function(){
  const seg = document.getElementById('bal-dyn-seg');
  if(seg) seg.addEventListener('click', function(e){ const b = e.target.closest('button[data-k]'); if(b) setDynMode(b.dataset.k); });
  let t = null;
  window.addEventListener('resize', function(){ clearTimeout(t); t = setTimeout(function(){ const h = document.getElementById('bal-dyn-chart'); if(h && dynLast){ delete h.dataset.sig; renderDynCard(dynLast, false); } }, 150); });
})();
(window.__MT_FILES = window.__MT_FILES || []).push('analytics.js');
