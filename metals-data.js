// Споделена база данни за метални профили — използва се от calc-metali и bar-cut

export const MAT = {
  'Стомана (S235)': 7850,
  'Неръждавейка 304': 8000,
  'Алуминий': 2700,
  'Месинг': 8500,
  'Мед': 8960,
  'Бронз': 8800,
  'Чугун': 7200,
};

const sq  = x => x * x;
const pos = x => Math.max(0, x);
const stadium = (W, H) => pos(W - H) * H + Math.PI * sq(H / 2);

export const IPE  = {80:6.0,100:8.1,120:10.4,140:12.9,160:15.8,180:18.8,200:22.4,220:26.2,240:30.7,270:36.1,300:42.2,330:49.1,360:57.1,400:66.3,450:77.6,500:90.7,550:106,600:122};
export const IPN  = {80:5.94,100:8.34,120:11.1,140:14.3,160:17.9,180:21.9,200:26.2,220:31.1,240:36.2,260:41.9,280:47.9,300:54.2,320:61.0,340:68.0,360:76.1,380:84.0,400:92.4};
export const HEA  = {100:16.7,120:19.9,140:24.7,160:30.4,180:35.5,200:42.3,220:50.5,240:60.3,260:68.2,280:76.4,300:88.3,320:97.6,340:105,360:112,400:125,450:140,500:155,550:166,600:178};
export const HEB  = {100:20.4,120:26.7,140:33.7,160:42.6,180:51.2,200:61.3,220:71.5,240:83.2,260:93.0,280:103,300:117,320:127,340:134,360:142,400:155,450:171,500:187,550:199,600:212};
export const UPN  = {50:5.59,65:7.09,80:8.64,100:10.6,120:13.4,140:16.0,160:18.8,180:22.0,200:25.3,220:29.4,240:33.2,260:37.9,280:41.8,300:46.2,320:59.5,350:60.6,380:63.1,400:71.8};
export const REBAR = {};
[6,8,10,12,14,16,18,20,22,25,28,32,40].forEach(d => REBAR[d] = +(Math.PI/4*d*d*1e-6*7850).toFixed(3));

export const P = {
  round:     { g:'Плътни профили', label:'Кръгла плътна стомана',       mode:'linear', draw:'round',
               dims:[['d','Диаметър Ø',20]], area:f=>Math.PI/4*sq(f.d), formula:'π/4 · Ø² · ρ' },
  square:    { g:'Плътни профили', label:'Плътен квадрат',               mode:'linear', draw:'square',
               dims:[['a','Страна a',20]], area:f=>sq(f.a), formula:'a² · ρ' },
  hex:       { g:'Плътни профили', label:'Шестостен (по ключ)',          mode:'linear', draw:'hex',
               dims:[['s','Ключ S',20]], area:f=>Math.sqrt(3)/2*sq(f.s), formula:'(√3/2) · S² · ρ' },
  flat:      { g:'Плътни профили', label:'Шина / плосък',                mode:'linear', draw:'flat',
               dims:[['a','Широчина a',40],['b','Дебелина b',5]], area:f=>f.a*f.b, formula:'a · b · ρ' },

  tube_s:    { g:'Тръби', label:'Безшевна тръба (кръгла)',               mode:'linear', draw:'rtube',
               dims:[['D','Външен Ø',33.7],['t','Стена t',3.2]],
               area:f=>Math.PI/4*(sq(f.D)-sq(pos(f.D-2*f.t))), formula:'π/4 · (Ø² − (Ø−2t)²) · ρ',
               check:f=>f.t<=f.D/2 },
  tube_w:    { g:'Тръби', label:'Шевна тръба (кръгла)',                  mode:'linear', draw:'rtube',
               dims:[['D','Външен Ø',48.3],['t','Стена t',2.5]],
               area:f=>Math.PI/4*(sq(f.D)-sq(pos(f.D-2*f.t))), formula:'π/4 · (Ø² − (Ø−2t)²) · ρ',
               check:f=>f.t<=f.D/2 },
  oval:      { g:'Тръби', label:'Плоско-овална тръба',                   mode:'linear', draw:'oval',
               dims:[['W','Голяма ос W',40],['H','Малка ос H',20],['t','Стена t',2]],
               area:f=>stadium(f.W,f.H)-stadium(pos(f.W-2*f.t),pos(f.H-2*f.t)),
               formula:'стадион(W,H) − стадион(W−2t,H−2t) · ρ', check:f=>f.t<=f.H/2&&f.H<=f.W },

  shs:       { g:'Кухи профили', label:'Кух квадрат (SHS)',              mode:'linear', draw:'shs',
               dims:[['a','Страна a',20],['t','Стена t',2]],
               area:f=>sq(f.a)-sq(pos(f.a-2*f.t)), formula:'(a² − (a−2t)²) · ρ',
               check:f=>f.t<=f.a/2 },
  rhs:       { g:'Кухи профили', label:'Кух правоъгълник (RHS)',         mode:'linear', draw:'rhs',
               dims:[['a','Страна A',40],['b','Страна B',20],['t','Стена t',2]],
               area:f=>f.a*f.b-pos(f.a-2*f.t)*pos(f.b-2*f.t),
               formula:'(A·B − (A−2t)(B−2t)) · ρ', check:f=>f.t<=Math.min(f.a,f.b)/2 },

  angle_eq:  { g:'Винкели и СОП', label:'Винкел равностранен',           mode:'linear', draw:'angle',
               dims:[['a','Рамо a',40],['t','Дебелина t',4]],
               area:f=>f.t*(2*f.a-f.t), formula:'t · (2a − t) · ρ', check:f=>f.t<=f.a },
  angle_uneq:{ g:'Винкели и СОП', label:'Винкел разностранен',           mode:'linear', draw:'angle',
               dims:[['a','Рамо a',40],['b','Рамо b',20],['t','Дебелина t',4]],
               area:f=>f.t*(f.a+f.b-f.t), formula:'t · (a + b − t) · ρ', check:f=>f.t<=Math.min(f.a,f.b) },
  sop_l:     { g:'Винкели и СОП', label:'СОП L-образен (студено огънат)',mode:'linear', draw:'angle',
               dims:[['a','Рамо a',40],['b','Рамо b',40],['t','Дебелина t',2]],
               area:f=>f.t*(f.a+f.b-f.t), formula:'t · (a + b − t) · ρ', check:f=>f.t<=Math.min(f.a,f.b) },
  sop_u:     { g:'Винкели и СОП', label:'СОП U-образен (студено огънат)',mode:'linear', draw:'channel',
               dims:[['a','Гръб a',40],['b','Рамо b',20],['t','Дебелина t',2]],
               area:f=>f.t*(f.a+2*f.b-2*f.t), formula:'t · (a + 2b − 2t) · ρ', check:f=>f.t<=Math.min(f.a,f.b)/2 },

  ipe:       { g:'Европрофили', label:'Европрофил IPE',    mode:'table', draw:'ibeam', table:IPE, std:'EN 10365 / DIN 1025' },
  ipn:       { g:'Европрофили', label:'Европрофил IPN',    mode:'table', draw:'ibeam', table:IPN, std:'DIN 1025-1' },
  hea:       { g:'Европрофили', label:'Европрофил HEA',    mode:'table', draw:'ibeam', table:HEA, std:'DIN 1025-3' },
  heb:       { g:'Европрофили', label:'Европрофил HEB',    mode:'table', draw:'ibeam', table:HEB, std:'DIN 1025-2' },
  upn:       { g:'Европрофили', label:'Европрофил UPN',    mode:'table', draw:'channel', table:UPN, std:'DIN 1026-1' },

  rebar:     { g:'Армировка', label:'Арматурна стомана',   mode:'table', draw:'round', table:REBAR, std:'нормален Ø', unitDesig:'Ø' },

  plate:     { g:'Листови', label:'Листова стомана',       mode:'plate', draw:'plate', factor:1 },
  lt:        { g:'Листови', label:'Покривна LT ламарина',  mode:'plate', draw:'lt',    factor:1.12, hasFactor:true },
};

/**
 * Изчислява тегло в кг/м за даден профил.
 * @param {string} profileKey - ключ от P
 * @param {Object} dims       - размери { a, b, t, d, D, s, W, H, w, l, factor }
 * @param {string|number} desig - типоразмер за table-mode (напр. "200" за IPE200)
 * @param {number} density    - плътност кг/м³
 * @returns {{ kgPerM: number, kgPerMm2: number, valid: boolean, label: string }}
 */
export function computeWeightPerM(profileKey, dims, desig, density) {
  const p = P[profileKey];
  if (!p) return { kgPerM: 0, valid: false, label: '—' };

  const rho = density || MAT['Стомана (S235)'];
  let kgPerM = 0;
  let valid = true;
  let label = '';

  if (p.mode === 'table') {
    const row = p.table[desig];
    kgPerM = row ? row * (rho / 7850) : 0;
    label = `${p.unitDesig || ''}${desig} · ${p.std || ''}`;
    valid = !!row;
  } else if (p.mode === 'plate') {
    const t = dims.t || 0;
    const factor = dims.factor ?? p.factor ?? 1;
    kgPerM = (t / 1000) * rho * factor; // кг/м²
    label = `${t} мм`;
  } else {
    valid = !p.check || p.check(dims);
    const area = valid ? Math.max(0, p.area(dims)) : 0;
    kgPerM = area * 1e-6 * rho;
    label = p.dims.map(d => `${d[1].split(' ')[0]}=${dims[d[0]] || 0}`).join(', ');
  }

  return { kgPerM, valid, label };
}
