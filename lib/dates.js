const TZ = 'America/Sao_Paulo';
const MAX_PERIOD_DAYS = 90;

/** YYYY-MM-DD em BRT → Date UTC (início do dia BRT = 03:00 UTC) */
function ymdToStart(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

/** YYYY-MM-DD → fim exclusivo (dia seguinte 03:00 UTC) */
function ymdToEndExclusive(ymd) {
  const start = ymdToStart(ymd);
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

function formatYmdFromDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatLabelDdMm(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/** Monta labels e índice por data para um intervalo [start, end) */
function buildPeriodIndex(start, end) {
  const labels = [];
  const indexByYmd = {};
  const cur = new Date(start);
  let i = 0;
  while (cur < end) {
    const ymd = formatYmdFromDate(cur);
    labels.push(formatLabelDdMm(ymd));
    indexByYmd[ymd] = i++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return { labels, indexByYmd, dayCount: labels.length };
}

function emptyPeriodArray(dayCount) {
  return Array(dayCount).fill(0);
}

function fillPeriodArray(rows, indexByYmd, valueKey = 'count') {
  const dayCount = Object.keys(indexByYmd).length;
  const arr = emptyPeriodArray(dayCount);
  for (const row of rows) {
    const idx = indexByYmd[row._id];
    if (idx !== undefined) arr[idx] = row[valueKey] ?? 0;
  }
  return arr;
}

/** Período anterior com mesma duração */
function getPreviousPeriod(start, end) {
  const ms = end.getTime() - start.getTime();
  const pEnd = new Date(start.getTime());
  const pStart = new Date(start.getTime() - ms);
  return { start: pStart, end: pEnd };
}

/** Último dia inclusivo de um intervalo [start, end) */
function ymdEndInclusive(exclusiveEnd) {
  const d = new Date(exclusiveEnd);
  d.setUTCDate(d.getUTCDate() - 1);
  return formatYmdFromDate(d);
}

/** Metadados do período anterior (mesma quantidade de dias) */
function buildPreviousPeriodMeta(start, end) {
  const { start: pStart, end: pEnd } = getPreviousPeriod(start, end);
  const inicio = formatYmdFromDate(pStart);
  const fim = ymdEndInclusive(pEnd);
  const { labels, dayCount } = buildPeriodIndex(pStart, pEnd);
  return {
    inicio,
    fim,
    label: formatPeriodLabel(inicio, fim),
    labels,
    dayCount,
    inicioISO: pStart.toISOString(),
    fimISO: pEnd.toISOString(),
  };
}

function parsePeriod(inicio, fim) {
  if (!inicio || !fim) {
    return getDefaultPeriod();
  }
  const start = ymdToStart(inicio);
  const end = ymdToEndExclusive(fim);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error('Período inválido. Use inicio e fim no formato YYYY-MM-DD.');
  }
  const { labels, indexByYmd, dayCount } = buildPeriodIndex(start, end);
  if (dayCount > MAX_PERIOD_DAYS) {
    throw new Error(`Período máximo de ${MAX_PERIOD_DAYS} dias.`);
  }
  return { start, end, inicio, fim, labels, indexByYmd, dayCount };
}

function getDefaultPeriod() {
  const now = new Date();
  const fim = formatYmdFromDate(now);
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const inicio = formatYmdFromDate(startDate);
  return parsePeriod(inicio, fim);
}

function formatPeriodLabel(inicio, fim) {
  const [yi, mi, di] = inicio.split('-');
  const [yf, mf, df] = fim.split('-');
  return `${di}/${mi}/${yi} → ${df}/${mf}/${yf}`;
}

function formatLabelMmYyyy(ym) {
  const [y, m] = ym.split('-');
  return `${m}/${y}`;
}

/** Índice mensal (YYYY-MM) para intervalo [start, end) em BRT */
function buildMonthIndex(start, end) {
  const labels = [];
  const indexByYm = {};
  const startYm = formatYmdFromDate(start).slice(0, 7);
  const [sy, sm] = startYm.split('-').map(Number);
  let year = sy;
  let month = sm;
  let i = 0;
  while (true) {
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    const monthStart = ymdToStart(`${ym}-01`);
    if (monthStart >= end) break;
    labels.push(formatLabelMmYyyy(ym));
    indexByYm[ym] = i++;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { labels, indexByYm, monthCount: labels.length };
}

function emptyMonthArray(monthCount) {
  return Array(monthCount).fill(0);
}

function fillMonthArray(rows, indexByYm, valueKey = 'count') {
  const monthCount = Object.keys(indexByYm).length;
  const arr = emptyMonthArray(monthCount);
  for (const row of rows) {
    const idx = indexByYm[row._id];
    if (idx !== undefined) arr[idx] = row[valueKey] ?? 0;
  }
  return arr;
}

function monthGroup(field) {
  return {
    $dateToString: { format: '%Y-%m', date: `$${field}`, timezone: TZ },
  };
}

module.exports = {
  TZ,
  MAX_PERIOD_DAYS,
  ymdToStart,
  ymdToEndExclusive,
  buildPeriodIndex,
  buildMonthIndex,
  emptyPeriodArray,
  emptyMonthArray,
  fillPeriodArray,
  fillMonthArray,
  getPreviousPeriod,
  buildPreviousPeriodMeta,
  ymdEndInclusive,
  parsePeriod,
  getDefaultPeriod,
  formatPeriodLabel,
  formatYmdFromDate,
  formatLabelMmYyyy,
  monthGroup,
};
