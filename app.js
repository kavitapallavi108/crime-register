import {
  loadData, YEARS, AGE_GROUPS, AGE_LABEL, SEXES, SHEET_MM, QUTUB_M, EIFFEL_M,
  cityYear, citiesInState, largestRemainder, fmtIN, fmtShort, fmtTiny, pctChange,
  BINS, binIndex, seededRandom,
} from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const S = {
  year: 2022,
  metric: 'cases',
  selState: 'DL',
  city: 'Chennai',
  preset: 'story',
  focus: null, // {kind:'age'|'sex', val}
  focusLocked: false,
  hoverState: null,
  data: null,
};

const HERO_LINES = {
  2020: 'The highest of the three years, swollen by lakhs of cases filed for breaking COVID lockdown rules.',
  2021: 'Lockdown-rule cases faded away, and the national total fell by about six lakh.',
  2022: 'Close to 2021 again. The lockdown bump is gone from the numbers.',
};
const WAVE_CAPTIONS = {
  2020: 'Lockdown year. Tamil Nadu and Gujarat registered very high numbers, largely cases for breaking COVID rules.',
  2021: 'Lockdown cases fade, and totals fall.',
  2022: "Uttar Pradesh tops the list. Delhi registers 3 lakh cases with about one-eleventh of UP's population.",
};
const STORY = { 2020: ['TN', 'GJ', 'MH', 'UP'], 2021: ['TN', 'GJ', 'MH', 'UP'], 2022: ['UP', 'DL', 'MH', 'MP'] };
const PRESETS = {
  fallers: ['TN', 'GJ', 'AS', 'AP'],
  climbers: ['UP', 'KL', 'RJ', 'DL', 'OR'],
};

/* ---------- small helpers ---------- */
function tween(from, to, ms, step, key) {
  tween.ids = tween.ids || {};
  if (tween.ids[key]) cancelAnimationFrame(tween.ids[key]);
  if (reduceMotion.matches || document.hidden || ms <= 0 || from === to) { step(to); return; }
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    step(from + (to - from) * ease(t));
    if (t < 1) tween.ids[key] = requestAnimationFrame(frame);
  };
  tween.ids[key] = requestAnimationFrame(frame);
}

// Radio-style button groups with arrow-key navigation and roving tabindex.
function radioGroup(container, attr, getValue, onPick) {
  const buttons = () => [...container.querySelectorAll(`[data-${attr}]`)];
  const sync = () => {
    const cur = String(getValue());
    buttons().forEach((b) => {
      const on = b.dataset[attr] === cur;
      b.setAttribute('aria-checked', on);
      b.tabIndex = on ? 0 : -1;
    });
  };
  container.addEventListener('click', (e) => {
    const b = e.target.closest(`[data-${attr}]`);
    if (b) onPick(b.dataset[attr]);
  });
  container.addEventListener('keydown', (e) => {
    const list = buttons();
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % list.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + list.length) % list.length;
    if (j === null) return;
    e.preventDefault();
    onPick(list[j].dataset[attr]);
    list[j].focus();
  });
  return sync;
}

const syncers = [];

/* ---------- year ---------- */
function setYear(y) {
  S.year = Number(y);
  document.querySelectorAll('.yr').forEach((el) => (el.textContent = S.year));
  syncers.forEach((f) => f());
  renderHero();
  renderStack();
  renderMap();
  renderDossier();
  renderChips();
  renderLineup();
  renderWave();
}

let playTimer = null;
function togglePlay() {
  const btn = $('#playBtn');
  if (playTimer) { stopPlay(); return; }
  btn.setAttribute('aria-pressed', 'true');
  let i = 0;
  setYear(YEARS[i]);
  playTimer = setInterval(() => {
    i++;
    if (i >= YEARS.length) { stopPlay(); return; }
    setYear(YEARS[i]);
  }, reduceMotion.matches ? 2200 : 3000);
}
function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  $('#playBtn').setAttribute('aria-pressed', 'false');
}

/* ---------- HERO: ticking clock ---------- */
let heroShown = 0;
const clock = { t0: performance.now(), last: 0 };
function casesPerSecond() {
  return S.data.india.cases[S.year] / (365 * 24 * 3600);
}
function renderHero() {
  const { india } = S.data;
  const v = india.cases[S.year];
  tween(heroShown, v, 900, (x) => { $('#heroTotal').textContent = fmtIN(x); heroShown = x; }, 'hero');

  const prev = india.cases[S.year - 1];
  const delta = $('#heroDelta');
  if (prev) {
    const p = pctChange(prev, v);
    const arrow = p < 0 ? '&darr;' : '&uarr;';
    delta.innerHTML = `<span aria-hidden="true">${arrow}</span> ${Math.abs(p).toFixed(1)}% ${p < 0 ? 'fewer' : 'more'} than ${S.year - 1} <span class="fine">(${fmtIN(prev)} cases)</span>`;
  } else {
    delta.innerHTML = 'The first year in this file, so there is no earlier year to compare with.';
  }
  $('#heroLine').textContent = HERO_LINES[S.year];
  const every = 1 / casesPerSecond();
  $('#every').textContent = every.toFixed(1);
  $('#clockSec').textContent = every.toFixed(1);
}
function clockTick() {
  if (!S.data) return;
  const elapsed = (performance.now() - clock.t0) / 1000;
  const count = elapsed * casesPerSecond();
  const whole = Math.floor(count);
  $('#clockFill').style.strokeDasharray = `${(count % 1) * 100} 100`;
  if (whole !== clock.last) {
    clock.last = whole;
    $('#sinceOpen').textContent = fmtIN(whole);
    $('#sinceUnit').textContent = whole === 1 ? 'case' : 'cases';
    if (whole > 0 && !reduceMotion.matches) {
      const pop = $('#firPop');
      pop.classList.remove('go');
      void pop.offsetWidth;
      pop.classList.add('go');
    }
  }
}
function startClock() {
  if (reduceMotion.matches) { setInterval(clockTick, 1000); clockTick(); return; }
  const loop = () => { clockTick(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

/* ---------- EXHIBIT A: paper tower ---------- */
let towerShown = 0;
function renderStack() {
  const m = (S.data.india.cases[S.year] * SHEET_MM) / 1000;
  tween(towerShown, m, 1100, (x) => { drawTower(x); towerShown = x; }, 'tower');

  const q = m / QUTUB_M;
  $('#stackM').textContent = `${Math.round(m)} m`;
  const eiffel = m > EIFFEL_M ? 'taller than the Eiffel Tower' : 'a little short of the Eiffel Tower';
  $('#stackText').innerHTML = `${S.year}'s ${fmtIN(S.data.india.cases[S.year])} cases would make a pile of paper <b>${q.toFixed(1)} Qutub Minars</b> high, ${eiffel}.`;
  $('#stackDesc').textContent = `A pile of ${fmtIN(S.data.india.cases[S.year])} sheets of paper would be ${Math.round(m)} metres tall, ${q.toFixed(1)} times the Qutub Minar.`;
}
function drawTower(m) {
  const W = 600, ground = 440, maxM = 450;
  const px = 390 / maxM;
  const h = m * px;
  const tx = 300, tw = 104;
  const qh = QUTUB_M * px, qx = 160;
  const ey = ground - EIFFEL_M * px;
  let qlines = '';
  for (let k = 1; k * QUTUB_M <= m; k++) {
    const y = ground - k * QUTUB_M * px;
    qlines += `<line class="tw-qline" x1="${qx + 18}" x2="${tx + tw + 8}" y1="${y}" y2="${y}"/>
      <text class="tw-label" x="${tx + tw + 14}" y="${y + 4}">${k}&times; Qutub</text>`;
  }
  const top = ground - h;
  $('#stackSvg').innerHTML = `
    <defs>
      <pattern id="sheets" width="10" height="4" patternUnits="userSpaceOnUse">
        <line x1="0" y1="3.5" x2="10" y2="3.5" class="tw-sheets"/>
      </pattern>
    </defs>
    <line class="tw-ref" x1="40" x2="${W - 20}" y1="${ey}" y2="${ey}"/>
    <text class="tw-label" x="40" y="${ey - 6}">Eiffel Tower, 330 m</text>
    ${qlines}
    <g>
      <rect class="tw-paper" x="${tx}" y="${top}" width="${tw}" height="${h}"/>
      <rect x="${tx}" y="${top}" width="${tw}" height="${h}" fill="url(#sheets)"/>
      <rect class="tw-paper" x="${tx - 3}" y="${top - 3}" width="${tw}" height="4" transform="rotate(-1.2 ${tx + tw / 2} ${top})"/>
      <rect class="tw-paper" x="${tx + 4}" y="${top - 6}" width="${tw - 6}" height="4" transform="rotate(1.5 ${tx + tw / 2} ${top})"/>
    </g>
    <text class="tw-label tw-label--strong" x="${tx + tw / 2}" y="${top - 14}" text-anchor="middle">${Math.round(m)} m</text>
    <path class="tw-qutub" d="M${qx - 13} ${ground} L${qx - 6} ${ground - qh} L${qx + 6} ${ground - qh} L${qx + 13} ${ground} Z"/>
    <rect class="tw-qutub" x="${qx - 4}" y="${ground - qh - 6}" width="8" height="6" rx="2"/>
    ${[0.25, 0.5, 0.72].map((f) => `<rect class="tw-qutub" x="${qx - 13 + 7 * f - 2}" y="${ground - qh * f - 1.5}" width="${26 - 14 * f + 4}" height="3"/>`).join('')}
    <text class="tw-label" x="${qx}" y="${ground - qh - 14}" text-anchor="middle">Qutub Minar</text>
    <text class="tw-label" x="${qx}" y="${ground + 20}" text-anchor="middle">72.5 m</text>
    <text class="tw-label" x="${tx + tw / 2}" y="${ground + 20}" text-anchor="middle">${S.year} cases</text>
    <line class="tw-ground" x1="20" x2="${W - 20}" y1="${ground}" y2="${ground}"/>`;
}

/* ---------- EXHIBIT B: tile map ---------- */
function metricValue(d) {
  if (S.metric === 'cases') return d.cases[S.year];
  if (S.metric === 'rate') return d.rate;
  return d.chargesheet;
}
function metricLabels(v) {
  if (S.metric === 'cases') return [fmtShort(v), fmtTiny(v)];
  if (S.metric === 'rate') return [fmtIN(v), fmtIN(v)];
  return [`${Math.round(v)}%`, `${Math.round(v)}%`];
}
function metricAria(d, v) {
  if (S.metric === 'cases') return `${d.state}: ${fmtIN(v)} cases in ${S.year}`;
  if (S.metric === 'rate') return `${d.state}: ${fmtIN(v)} cases per lakh people in 2022`;
  return `${d.state}: ${v}% of cases chargesheeted in 2022`;
}

function buildTiles() {
  const box = $('#tilemap');
  const cityStates = new Set(S.data.cityRows.map((r) => r.state));
  box.innerHTML = S.data.states
    .map((d) => `<button type="button" class="tile" data-abbr="${d.abbr}" style="grid-column:${d.col + 1};grid-row:${d.row + 1}" aria-pressed="false">
        ${cityStates.has(d.state) ? '<span class="city-dot" aria-hidden="true"></span>' : ''}
        <span class="tile__abbr">${d.abbr}</span>
        <span class="tile__val tile__val--long"></span>
        <span class="tile__val tile__val--tiny"></span>
      </button>`)
    .join('');
  box.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    S.selState = t.dataset.abbr;
    renderMap();
    renderDossier();
    if (innerWidth < 960) $('#dossier').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  });
}

function renderMap() {
  const bins = BINS[S.metric];
  S.data.states.forEach((d) => {
    const t = $(`.tile[data-abbr="${d.abbr}"]`);
    const v = metricValue(d);
    const [long, tiny] = metricLabels(v);
    t.className = `tile b${binIndex(v, bins.edges)}`;
    t.querySelector('.tile__val--long').textContent = long;
    t.querySelector('.tile__val--tiny').textContent = tiny;
    t.setAttribute('aria-label', metricAria(d, v));
    t.setAttribute('aria-pressed', d.abbr === S.selState);
  });
  $('#mapLegend').innerHTML = `<span class="legend__title">${S.metric === 'cases' ? `Cases registered in ${S.year}` : bins.unit}</span>` +
    bins.labels.map((l, i) => `<span class="legend__item"><span class="sw" style="background:var(--b${i})"></span>${l}</span>`).join('');

  const note = $('#rateNote');
  if (S.metric !== 'cases' && S.year !== 2022) {
    note.hidden = false;
    note.textContent = `NCRB publishes these rates for 2022 only, so the map shows 2022 values even though ${S.year} is selected.`;
  } else note.hidden = true;
}

function renderDossier() {
  const d = S.data.states.find((s) => s.abbr === S.selState);
  const india = S.data.india;
  const maxC = Math.max(...YEARS.map((y) => d.cases[y]));
  const bars = YEARS.map((y) => `<div class="mb ${y === S.year ? 'is-current' : ''}">
      <span>${y}</span>
      <span class="mb__track"><span class="mb__bar" style="display:block;width:${(d.cases[y] / maxC) * 100}%"></span></span>
      <span class="mb__val">${fmtIN(d.cases[y])}</span></div>`).join('');

  const per10k = Math.round(d.rate / 10);
  const india10k = Math.round(india.rate / 10);
  const ratio = d.rate / india.rate;
  const cmp = ratio >= 1.15 ? `<b>${ratio.toFixed(1)} times</b> the national average`
    : ratio <= 0.87 ? `<b>${Math.round(ratio * 100)}%</b> of the national average`
    : 'close to the national average';

  const cs = d.chargesheet;
  const files = Array.from({ length: 10 }, (_, i) => {
    const f = Math.max(0, Math.min(1, cs / 10 - i));
    return `<svg viewBox="0 0 26 32" aria-hidden="true"><rect class="file-bg" x="1" y="1" width="24" height="30" rx="3"/>
      <rect class="file-fill" x="1" y="${1 + 30 * (1 - f)}" width="24" height="${30 * f}" rx="${f > 0.95 ? 3 : 0}"/></svg>`;
  }).join('');

  const cities = citiesInState(S.data.cityRows, d.state);
  const cityHtml = cities.length
    ? `<div class="dsec"><h4>Cities in the line-up</h4><div class="city-list">${cities.map((c) => `<button type="button" class="city-btn" data-city="${c}">See 100 people arrested in ${c}</button>`).join('')}</div></div>`
    : '';

  $('#dossier').innerHTML = `
    <div class="dossier__tab">Dossier &middot; ${d.abbr}</div>
    <h3>${d.state}</h3>
    <p class="dossier__meta">${d.type === 'UT' ? 'Union Territory' : 'State'} &middot; about ${fmtShort(d.populationLakh * 1e5)} people (2022)</p>

    <div class="dsec"><h4>Cases registered</h4><div class="minibars">${bars}</div></div>

    <div class="dsec"><h4>Picture 10,000 neighbours (2022)</h4>
      <div class="crowd-wrap">
        <canvas class="crowd" id="crowd" role="img" aria-label="${per10k} lit dots out of 10,000"></canvas>
        <div>
          <div class="crowd-num">${per10k} <span class="fine">of 10,000</span></div>
          <p>For every 10,000 people in ${d.state}, about <b>${per10k}</b> cases were registered in 2022. That is ${cmp} (${india10k}).</p>
          <p class="fine">Official rate: ${fmtIN(d.rate)} cases per lakh people, India ${india.rate}.</p>
        </div>
      </div>
    </div>

    <div class="dsec"><h4>How many cases reach court? (2022)</h4>
      <div class="files">${files}</div>
      <p>Out of every 10 cases, police finished the investigation and sent about <b>${(cs / 10).toFixed(1)}</b> to court with a chargesheet (${cs}%). India: ${(india.chargesheet / 10).toFixed(1)} of 10.</p>
    </div>
    ${cityHtml}`;
  drawCrowd(d, per10k);
}

function drawCrowd(d, lit) {
  const c = $('#crowd');
  if (!c) return;
  const size = c.clientWidth || 280;
  const dpr = window.devicePixelRatio || 1;
  c.width = size * dpr;
  c.height = size * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const n = 100, cell = size / n;
  ctx.fillStyle = cssVar('--crowd');
  for (let i = 0; i < n * n; i++) {
    ctx.fillRect((i % n) * cell + cell * 0.2, Math.floor(i / n) * cell + cell * 0.2, cell * 0.6, cell * 0.6);
  }
  // pick lit dots with a seeded shuffle so they stay put
  const rnd = seededRandom(d.abbr);
  const idx = Array.from({ length: n * n }, (_, i) => i);
  for (let i = 0; i < lit; i++) {
    const j = i + Math.floor(rnd() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  ctx.fillStyle = cssVar('--lit');
  const r = Math.max(1.6, cell * 0.9);
  for (let i = 0; i < lit; i++) {
    const k = idx[i];
    ctx.beginPath();
    ctx.arc((k % n) * cell + cell / 2, Math.floor(k / n) * cell + cell / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------- EXHIBIT C: line-up ---------- */
// City picker: a drawer of case files, ranked by people arrested in the selected year.
function buildChips() {
  syncers.push(radioGroup($('#cityChips'), 'city', () => S.city, (c) => {
    S.city = c;
    syncers.forEach((f) => f());
    const seal = $(`#cityChips [data-city="${c}"]`);
    if (seal && !reduceMotion.matches) { seal.classList.remove('stamped'); void seal.offsetWidth; seal.classList.add('stamped'); }
    renderLineup(true);
  }));
}
function renderChips() {
  const abbrOf = Object.fromEntries(S.data.states.map((d) => [d.state, d.abbr]));
  const files = S.data.cities
    .map((c) => ({ c, ...cityYear(S.data.cityRows, c, S.year) }))
    .sort((a, b) => b.total - a.total);
  const max = files[0].total;
  const box = $('#cityChips');
  const hadFocus = box.contains(document.activeElement);

  // Round police seals sized by people arrested (square-root scale, so area tracks the count).
  const small = innerWidth < 640;
  const [minS, maxS] = small ? [70, 118] : [92, 168];
  files.forEach((f, i) => {
    f.rank = i + 1;
    f.size = Math.round(minS + (maxS - minS) * Math.sqrt(f.total / max));
    const rnd = seededRandom(f.c);
    f.tilt = (rnd() * 12 - 6).toFixed(1);
  });
  // Pack seals into rows that fit the width (largest first), then put the biggest row in the
  // middle with smaller rows alternating above and below; inside a row, biggest in the centre.
  const avail = Math.max(240, box.clientWidth - 24);
  const rows = [];
  let row = [], used = 0;
  files.forEach((f) => {
    if (row.length && used + f.size + 6 > avail) { rows.push(row); row = []; used = 0; }
    row.push(f);
    used += f.size + 6;
  });
  if (row.length) rows.push(row);
  const centreOut = (list) => { const out = []; list.forEach((f, i) => (i % 2 ? out.push(f) : out.unshift(f))); return out; };
  const stacked = [];
  rows.forEach((r, i) => (i % 2 ? stacked.unshift(centreOut(r)) : stacked.push(centreOut(r))));

  const sealHtml = (f) => {
    const id = `arc-${f.c.toLowerCase()}`;
    const name = f.c.toUpperCase();
    return `<button type="button" role="radio" class="seal" data-city="${f.c}" style="--s:${f.size}px;--tilt:${f.tilt}deg"
        aria-label="${f.c}: ${fmtIN(f.total)} people arrested in ${S.year}, rank ${f.rank} of ${files.length}">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <path id="${id}-t" d="M17,50 A33,33 0 0 1 83,50"/>
          <path id="${id}-b" d="M21,50 A29,29 0 0 0 79,50"/>
        </defs>
        <circle class="seal__bg" cx="50" cy="50" r="47"/>
        <circle class="seal__ring" cx="50" cy="50" r="47"/>
        <circle class="seal__ring seal__ring--thin" cx="50" cy="50" r="42"/>
        <circle class="seal__ring seal__ring--thin" cx="50" cy="50" r="24"/>
        <text class="seal__name" font-size="${name.length > 8 ? 9.5 : 11}"><textPath href="#${id}-t" startOffset="50%" text-anchor="middle">${name}</textPath></text>
        <text class="seal__foot"><textPath href="#${id}-b" startOffset="50%" text-anchor="middle">No.${String(f.rank).padStart(2, '0')} &middot; ${abbrOf[f.state] || ''}</textPath></text>
        <circle class="seal__dot" cx="12.5" cy="50" r="1.6"/><circle class="seal__dot" cx="87.5" cy="50" r="1.6"/>
        <text class="seal__n" x="50" y="53" text-anchor="middle">${fmtTiny(f.total)}</text>
        <text class="seal__unit" x="50" y="62" text-anchor="middle">ARRESTED</text>
      </svg>
    </button>`;
  };
  box.innerHTML = stacked.map((r) => `<div class="seal-row">${r.map(sealHtml).join('')}</div>`).join('');
  syncers.forEach((s) => s());
  if (hadFocus) box.querySelector('[aria-checked="true"]')?.focus();
}

let lastLineupKey = '';
function renderLineup(animate) {
  const { rows, total, simulated } = cityYear(S.data.cityRows, S.city, S.year);
  const groups = [];
  AGE_GROUPS.forEach((age, ai) => SEXES.forEach((sex) => {
    const r = rows.find((x) => x.age === age && x.sex === sex);
    groups.push({ age, ai, sex, n: r ? r.n : 0 });
  }));
  const ints = largestRemainder(groups.map((g) => g.n), 100);
  groups.forEach((g, i) => (g.k = ints[i]));

  const ageK0 = AGE_GROUPS.map((_, ai) => groups.filter((g) => g.ai === ai).reduce((s, g) => s + g.k, 0));
  const sexK0 = SEXES.map((s) => groups.filter((g) => g.sex === s).reduce((a, g) => a + g.k, 0));

  // People pyramid: oldest row on top, men step out left, women right.
  const W = Math.min(720, Math.max(280, $('#lineupStage').clientWidth - 32));
  const narrow = W < 520;
  const labelW = narrow ? 70 : 104;
  const fw = narrow ? 9 : 12, fh = fw * 2.2, lineGap = 3;
  const cx = W / 2;
  const perLine = Math.min(25, Math.max(1, Math.floor((W / 2 - labelW / 2 - 8) / fw)));
  const key = `${S.city}-${S.year}-${W}`;
  const doAnim = (animate || key !== lastLineupKey) && !reduceMotion.matches;
  lastLineupKey = key;

  let y = 34, out = '', count = 0;
  out += `<text class="lu-side" x="2" y="18" data-sex="Male">&larr; MEN <tspan class="lu-side__n">${sexK0[0]}</tspan></text>
    <text class="lu-side" x="${W - 2}" y="18" text-anchor="end" data-sex="Female"><tspan class="lu-side__n">${sexK0[1]}</tspan> WOMEN &rarr;</text>`;
  [...AGE_GROUPS.keys()].reverse().forEach((ai) => {
    const m = groups.find((g) => g.ai === ai && g.sex === 'Male').k;
    const f = groups.find((g) => g.ai === ai && g.sex === 'Female').k;
    const lines = Math.max(1, Math.ceil(m / perLine), Math.ceil(f / perLine));
    const bandH = lines * (fh + lineGap) + 12;
    out += `<rect class="lu-hit" data-age="${ai}" x="0" y="${y}" width="${W}" height="${bandH}"/>`;
    out += `<line class="lu-floor" x1="0" x2="${W}" y1="${y + bandH - 3}" y2="${y + bandH - 3}"/>`;
    const place = (n, sex) => {
      for (let k = 0; k < n; k++, count++) {
        const line = Math.floor(k / perLine), pos = k % perLine;
        const fx = sex === 'Male' ? cx - labelW / 2 - 4 - (pos + 1) * fw : cx + labelW / 2 + 4 + pos * fw;
        const fy = y + bandH - 6 - (line + 1) * (fh + lineGap) + lineGap;
        out += `<use href="#fig-${sex === 'Male' ? 'male' : 'female'}" x="${fx}" y="${fy}" width="${fw - 1}" height="${fh}"
          class="fig${doAnim ? ' fig-in' : ''}" data-age="${ai}" data-sex="${sex}" style="color:var(--age-${ai});animation-delay:${(4 - ai) * 90 + pos * 14}ms"/>`;
      }
    };
    place(m, 'Male');
    place(f, 'Female');
    const ly = y + bandH / 2;
    out += `<rect class="lu-tag" x="${cx - labelW / 2 + 3}" y="${ly - 17}" width="${labelW - 6}" height="32" rx="5" style="--c:var(--age-${ai})"/>
      <text class="lu-age" x="${cx}" y="${ly - 2}" text-anchor="middle">${AGE_LABEL[AGE_GROUPS[ai]].replace(' and over', '+')}</text>
      <text class="lu-k" x="${cx}" y="${ly + 11}" text-anchor="middle">${ageK0[ai] === 0 && groups.some((g) => g.ai === ai && g.n > 0) ? '&lt;1' : ageK0[ai]} of 100</text>`;
    y += bandH;
  });
  const svg = $('#lineupSvg');
  svg.setAttribute('viewBox', `0 0 ${W} ${y + 4}`);
  svg.setAttribute('height', y + 4);
  svg.innerHTML = out;
  svg.dataset.total = count; // always 100

  $('#placard').innerHTML = `<span>CITY <b>${S.city.toUpperCase()}</b></span><span>YEAR <b>${S.year}</b></span><span>PEOPLE ARRESTED <b>${fmtIN(total)}</b></span><span>1 FIGURE &asymp; ${fmtIN(total / 100)} people</span>` +
    `<span class="placard__src">${simulated ? 'ESTIMATED FROM STATE TRENDS' : 'NCRB, CRIME IN INDIA 2020'}</span>`;

  // legends
  const ageK = AGE_GROUPS.map((_, ai) => groups.filter((g) => g.ai === ai).reduce((s, g) => s + g.k, 0));
  const ageN = AGE_GROUPS.map((_, ai) => groups.filter((g) => g.ai === ai).reduce((s, g) => s + g.n, 0));
  const sexK = SEXES.map((s) => groups.filter((g) => g.sex === s).reduce((a, g) => a + g.k, 0));
  const sexN = SEXES.map((s) => groups.filter((g) => g.sex === s).reduce((a, g) => a + g.n, 0));
  const countText = (k, n) => (k === 0 ? (n > 0 ? `fewer than 1 in 100 <span class="fine">(${fmtIN(n)} people)</span>` : 'none recorded')
    : `<b>${k}</b> of 100 <span class="fine">(${fmtIN(n)} people)</span>`);

  $('#ageLegend').innerHTML = `<span class="legend__title">Age group, people arrested</span>` + AGE_GROUPS.map((a, ai) =>
    `<button type="button" class="lrow" data-kind="age" data-val="${ai}"><span class="sw" style="background:var(--age-${ai})"></span><span>${AGE_LABEL[a]}</span><span class="lrow__count">${countText(ageK[ai], ageN[ai])}</span></button>`).join('');
  $('#sexLegend').innerHTML = `<span class="legend__title">Sex</span>` + SEXES.map((s, si) =>
    `<button type="button" class="lrow" data-kind="sex" data-val="${s}"><svg viewBox="0 0 20 44" aria-hidden="true" style="color:var(--ink-2)"><use href="#fig-${si ? 'female' : 'male'}"/></svg><span>${si ? 'Women' : 'Men'}</span><span class="lrow__count">${countText(sexK[si], sexN[si])}</span></button>`).join('');

  // sentence
  let top = 0;
  ageK.forEach((k, ai) => { if (k > ageK[top]) top = ai; });
  const phrase = (k, n, what) => (k === 0 ? (n > 0 ? `fewer than 1 was ${what.one}` : `none were ${what.many}`) : `<b>${k}</b> ${k === 1 ? `was ${what.one}` : `were ${what.many}`}`);
  const sentence = `Of every 100 people arrested in ${S.city} in ${S.year}, <b>${ageK[top]}</b> were aged ${AGE_LABEL[AGE_GROUPS[top]]}, ` +
    `${phrase(sexK[1], sexN[1], { one: 'a woman', many: 'women' })}, and ${phrase(ageK[0], ageN[0], { one: 'under 18', many: 'under 18' })}.`;
  $('#lineupSentence').innerHTML = sentence;
  applyFocus();
}

function applyFocus() {
  const f = S.focus;
  document.querySelectorAll('#lineupSvg .fig').forEach((el) => {
    const match = !f || (f.kind === 'age' ? el.dataset.age === String(f.val) : el.dataset.sex === f.val);
    el.classList.toggle('faded', !match);
  });
  document.querySelectorAll('.lrow').forEach((b) => {
    b.classList.toggle('is-on', !!f && b.dataset.kind === f.kind && b.dataset.val === String(f.val));
    b.setAttribute('aria-pressed', !!f && S.focusLocked && b.dataset.kind === f.kind && b.dataset.val === String(f.val));
  });
}
function bindLegendFocus() {
  const wrap = $('.lineup-legends');
  const pick = (b) => ({ kind: b.dataset.kind, val: b.dataset.val });
  wrap.addEventListener('pointerover', (e) => { const b = e.target.closest('.lrow'); if (b && !S.focusLocked) { S.focus = pick(b); applyFocus(); } });
  wrap.addEventListener('pointerleave', () => { if (!S.focusLocked) { S.focus = null; applyFocus(); } });
  wrap.addEventListener('focusin', (e) => { const b = e.target.closest('.lrow'); if (b && !S.focusLocked) { S.focus = pick(b); applyFocus(); } });
  wrap.addEventListener('focusout', () => { if (!S.focusLocked) { S.focus = null; applyFocus(); } });
  // hovering a row of the pyramid highlights that age; the MEN / WOMEN headings highlight a sex
  const svg = $('#lineupSvg');
  svg.addEventListener('pointerover', (e) => {
    if (S.focusLocked) return;
    const t = e.target.closest('[data-age], .lu-side');
    if (!t) return;
    S.focus = t.classList.contains('lu-side') ? { kind: 'sex', val: t.dataset.sex } : { kind: 'age', val: t.dataset.age };
    applyFocus();
  });
  svg.addEventListener('pointerleave', () => { if (!S.focusLocked) { S.focus = null; applyFocus(); } });
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('.lrow');
    if (!b) return;
    const p = pick(b);
    const same = S.focusLocked && S.focus && S.focus.kind === p.kind && S.focus.val === p.val;
    S.focusLocked = !same;
    S.focus = same ? null : p;
    applyFocus();
  });
}

/* ---------- EXHIBIT D: wave ---------- */
function highlighted() {
  if (S.preset === 'story') return STORY[S.year];
  if (S.preset === 'top') return [...S.data.states].sort((a, b) => b.cases[S.year] - a.cases[S.year]).slice(0, 6).map((d) => d.abbr);
  return PRESETS[S.preset];
}
function renderWave() {
  $('#waveCaption').textContent = WAVE_CAPTIONS[S.year];
  const box = $('#waveBox');
  const W = Math.max(300, box.clientWidth - 8);
  const narrow = W < 600;
  const H = narrow ? 440 : 520;
  const m = { l: 50, r: narrow ? 64 : 150, t: 40, b: 16 };
  const xs = YEARS.map((_, i) => m.l + (i * (W - m.l - m.r)) / 2);
  const MAX = 900000; // fixed axis across all years (Tamil Nadu 2020 = 8,91,700)
  const y = (v) => m.t + (1 - v / MAX) * (H - m.t - m.b);
  const hi = new Set(highlighted());
  const hover = S.hoverState;
  const yi = YEARS.indexOf(S.year);
  const bandW = Math.min(70, (W - m.l - m.r) / 3);

  let g = `<rect class="w-band" x="${xs[yi] - bandW / 2}" y="${m.t - 30}" width="${bandW}" height="${H - m.t + 30 - m.b + 6}" rx="6"/>`;
  for (let v = 0; v <= MAX; v += 200000) {
    g += `<line class="w-grid" x1="${m.l}" x2="${W - m.r + 10}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="w-axis" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? '0' : `${v / 1e5}L`}</text>`;
  }
  g += YEARS.map((yr, i) => `<text class="w-year ${yr === S.year ? 'is-current' : ''}" x="${xs[i]}" y="${m.t - 12}" text-anchor="middle">${yr}</text>`).join('');

  const path = (d) => YEARS.map((yr, i) => `${i ? 'L' : 'M'}${xs[i]},${y(d.cases[yr])}`).join('');
  const order = [...S.data.states].sort((a, b) => (hi.has(a.abbr) - hi.has(b.abbr)) || (a.abbr === hover) - (b.abbr === hover));
  g += order.map((d) => `<path class="w-line ${hi.has(d.abbr) ? 'is-hi' : ''} ${d.abbr === hover ? 'is-hover' : ''}" d="${path(d)}"/>`).join('');

  // dots on the current year for highlighted + hover
  const shown = S.data.states.filter((d) => hi.has(d.abbr) || d.abbr === hover);
  g += shown.map((d) => `<circle class="w-dot ${d.abbr === hover ? 'is-hover' : ''}" cx="${xs[yi]}" cy="${y(d.cases[S.year])}" r="4.5"/>`).join('');

  // right-end labels with simple collision avoidance
  const labels = shown.map((d) => ({ d, y: y(d.cases[2022]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;
  const overflow = labels.length ? labels[labels.length - 1].y - (H - m.b) : 0;
  if (overflow > 0) labels.forEach((l) => (l.y -= overflow));
  g += labels.map((l) => `<text class="w-label ${l.d.abbr === hover ? 'is-hover' : ''}" x="${xs[2] + 8}" y="${l.y + 4}">${narrow ? l.d.abbr : l.d.state}</text>`).join('');

  // invisible fat hit lines
  g += S.data.states.map((d) => `<path class="w-hit" data-abbr="${d.abbr}" d="${path(d)}"><title>${d.state}</title></path>`).join('');

  const svg = $('#waveSvg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('height', H);
  svg.innerHTML = g;
}
function bindWave() {
  const svg = $('#waveSvg');
  const tip = $('#waveTip');
  const box = $('#waveBox');
  const show = (e, abbr) => {
    const d = S.data.states.find((s) => s.abbr === abbr);
    if (S.hoverState !== abbr) { S.hoverState = abbr; renderWave(); }
    const ch2122 = pctChange(d.cases[2020], d.cases[2022]);
    tip.innerHTML = `<b>${d.state}</b><table>${YEARS.map((yr) => `<tr><td>${yr}</td><td>${fmtIN(d.cases[yr])} cases</td></tr>`).join('')}
      <tr><td>2020&rarr;22</td><td>${ch2122 > 0 ? '+' : ''}${ch2122.toFixed(0)}%</td></tr></table>`;
    tip.hidden = false;
    const r = box.getBoundingClientRect();
    let x = e.clientX - r.left + 14, yy = e.clientY - r.top + 14;
    if (x + 190 > r.width) x = e.clientX - r.left - 200;
    if (yy + 110 > r.height) yy = e.clientY - r.top - 120;
    tip.style.left = `${Math.max(4, x)}px`;
    tip.style.top = `${Math.max(4, yy)}px`;
  };
  svg.addEventListener('pointermove', (e) => { const p = e.target.closest('.w-hit'); if (p) show(e, p.dataset.abbr); });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; S.hoverState = null; renderWave(); });
  svg.addEventListener('click', (e) => {
    const p = e.target.closest('.w-hit');
    if (!p) return;
    show(e, p.dataset.abbr);
    S.selState = p.dataset.abbr;
    renderMap();
    renderDossier();
  });
}

/* ---------- init ---------- */
async function init() {
  try {
    S.data = await loadData();
  } catch (err) {
    const l = $('#loading');
    l.classList.add('is-error');
    l.textContent = `Could not open the data files. Run the page through a local server (start.bat), not by double-clicking index.html. (${err.message})`;
    return;
  }
  $('#loading').remove();

  $('#yearTabs').innerHTML = YEARS.map((y) => `<button type="button" role="radio" data-year="${y}">${y}</button>`).join('');
  syncers.push(radioGroup($('#yearTabs'), 'year', () => S.year, (y) => { stopPlay(); setYear(y); }));
  syncers.push(radioGroup($('#metricToggle'), 'metric', () => S.metric, (m) => { S.metric = m; syncers.forEach((f) => f()); renderMap(); }));
  syncers.push(radioGroup($('#presets'), 'preset', () => S.preset, (p) => { S.preset = p; syncers.forEach((f) => f()); renderWave(); }));
  $('#playBtn').addEventListener('click', togglePlay);
  $('#playBtn').setAttribute('aria-pressed', 'false');

  buildTiles();
  buildChips();
  bindLegendFocus();
  bindWave();

  $('#dossier').addEventListener('click', (e) => {
    const b = e.target.closest('.city-btn');
    if (!b) return;
    S.city = b.dataset.city;
    syncers.forEach((f) => f());
    renderLineup(true);
    $('#lineup').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  });

  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { renderWave(); renderChips(); renderLineup(false); renderDossier(); }, 150);
  });
  darkQuery.addEventListener('change', () => renderDossier());

  setYear(S.year);
  startClock();
}

init();
