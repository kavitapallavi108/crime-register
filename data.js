// All data loading, parsing and number logic lives here.

const STATE_URL = 'data/state_crime_2020_2022.csv';
const CITY_URL = 'data/city_arrests_2020_2022.csv';

export const YEARS = [2020, 2021, 2022];
export const AGE_GROUPS = ['Under 18 (juvenile)', '18-29', '30-44', '45-59', '60+'];
export const AGE_LABEL = {
  'Under 18 (juvenile)': 'Under 18',
  '18-29': '18–29',
  '30-44': '30–44',
  '45-59': '45–59',
  '60+': '60 and over',
};
export const SEXES = ['Male', 'Female'];

// Paper sheet = 0.1 mm. Qutub Minar = 72.5 m. Eiffel Tower = 330 m.
export const SHEET_MM = 0.1;
export const QUTUB_M = 72.5;
export const EIFFEL_M = 330;

function parseCSV(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const keys = head.split(',');
  return rows.filter(Boolean).map((line) => {
    const v = line.split(',');
    const o = {};
    keys.forEach((k, i) => (o[k] = (v[i] ?? '').trim()));
    return o;
  });
}

const num = (s) => (s === '' || s == null ? null : Number(s));

async function getText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
  return r.text();
}

export async function loadData() {
  const [stText, ctText] = await Promise.all([getText(STATE_URL), getText(CITY_URL)]);

  const all = parseCSV(stText).map((r) => ({
    state: r.state,
    abbr: r.abbr,
    type: r.type,
    cases: { 2020: num(r.cases_2020), 2021: num(r.cases_2021), 2022: num(r.cases_2022) },
    populationLakh: num(r.population_lakh_2022),
    rate: num(r.crime_rate_per_lakh_2022),
    chargesheet: num(r.chargesheeting_rate_pct_2022),
    col: num(r.tile_col),
    row: num(r.tile_row),
  }));
  const india = all.find((d) => d.type === 'Total');
  const states = all.filter((d) => d.type !== 'Total');

  const cityRows = parseCSV(ctText).map((r) => ({
    year: Number(r.year),
    city: r.city,
    state: r.state,
    age: r.age_group,
    sex: r.sex,
    n: Number(r.persons_arrested),
    status: r.data_status,
  }));
  const cities = [...new Set(cityRows.map((r) => r.city))].sort();

  return { states, india, cityRows, cities };
}

export const isSimulatedRow = (r) => String(r.status).toUpperCase() === 'SIMULATED';

export function cityYear(cityRows, city, year) {
  const rows = cityRows.filter((r) => r.city === city && r.year === year);
  const total = rows.reduce((s, r) => s + r.n, 0);
  return { rows, total, simulated: rows.some(isSimulatedRow), state: rows[0]?.state };
}

export function citiesInState(cityRows, stateName) {
  return [...new Set(cityRows.filter((r) => r.state === stateName).map((r) => r.city))].sort();
}

export function totalArrests(cityRows, year) {
  return cityRows.filter((r) => r.year === year).reduce((s, r) => s + r.n, 0);
}

// Largest-remainder rounding: integers that always sum to exactly `total`.
export function largestRemainder(values, total = 100) {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return values.map(() => 0);
  const raw = values.map((v) => (v / sum) * total);
  const ints = raw.map(Math.floor);
  let left = total - ints.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r || values[b.i] - values[a.i]);
  for (let k = 0; k < order.length && left > 0; k++, left--) ints[order[k].i]++;
  return ints;
}

// Indian number system: 1,06,503
const inFmt = new Intl.NumberFormat('en-IN');
export const fmtIN = (n) => inFmt.format(Math.round(n));

// Short labels: "3.0 lakh", "2.1 crore", "59k"
export function fmtShort(n) {
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)} crore`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} lakh`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

// Ultra-compact for tiny map tiles: "3.0L", "59k"
export function fmtTiny(n) {
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

export const pctChange = (a, b) => ((b - a) / a) * 100;

// Fixed bins so colour changes are visible between years.
export const BINS = {
  cases: {
    edges: [10000, 50000, 150000, 300000],
    labels: ['under 10k', '10k–50k', '50k–1.5 lakh', '1.5–3 lakh', 'over 3 lakh'],
    unit: 'cases registered',
  },
  rate: {
    edges: [100, 200, 300, 500],
    labels: ['under 100', '100–200', '200–300', '300–500', 'over 500'],
    unit: 'cases per lakh people (2022)',
  },
  chargesheet: {
    edges: [40, 60, 75, 85],
    labels: ['under 40%', '40–60%', '60–75%', '75–85%', 'over 85%'],
    unit: 'of cases chargesheeted (2022)',
  },
};

export function binIndex(v, edges) {
  let i = 0;
  while (i < edges.length && v >= edges[i]) i++;
  return i;
}

// Small seeded RNG so the "neighbourhood" dots stay put for a state.
export function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
