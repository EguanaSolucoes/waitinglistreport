const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const holidayCache = new Map();

function secondSunday(year, month) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let sundays = 0;
  while (d.getUTCMonth() === month - 1) {
    if (d.getUTCDay() === 0) {
      sundays += 1;
      if (sundays === 2) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

function lastFridayOfMonth(year, month) {
  const d = new Date(Date.UTC(year, month, 0));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Datas comemorativas relevantes para restaurantes (não necessariamente feriado oficial). */
function getCommemorativeDates(year) {
  return [
    { date: `${year}-06-12`, name: 'Dia dos Namorados', type: 'comemorativo', impact: 'positive' },
    { date: secondSunday(year, 5), name: 'Dia das Mães', type: 'comemorativo', impact: 'positive' },
    { date: secondSunday(year, 8), name: 'Dia dos Pais', type: 'comemorativo', impact: 'positive' },
    { date: `${year}-10-12`, name: 'Dia das Crianças', type: 'comemorativo', impact: 'positive' },
    { date: lastFridayOfMonth(year, 11), name: 'Black Friday', type: 'comemorativo', impact: 'mixed' },
    { date: `${year}-12-25`, name: 'Natal', type: 'comemorativo', impact: 'positive' },
    { date: `${year}-12-31`, name: 'Réveillon', type: 'comemorativo', impact: 'positive' },
  ].filter((d) => d.date);
}

async function fetchNationalHolidays(year) {
  const key = String(year);
  const cached = holidayCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/BR`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Feriados ${year}: HTTP ${res.status}`);
  const rows = await res.json();
  const data = rows.map((h) => ({
    date: h.date,
    name: h.localName || h.name,
    type: 'feriado',
    impact: 'mixed',
  }));
  holidayCache.set(key, { at: Date.now(), data });
  return data;
}

async function getHolidaysBetween(startYmd, endYmd) {
  const startYear = Number(startYmd.slice(0, 4));
  const endYear = Number(endYmd.slice(0, 4));
  const years = [];
  for (let y = startYear; y <= endYear; y += 1) years.push(y);

  const nationalByYear = await Promise.all(
    years.map((y) => fetchNationalHolidays(y).catch(() => [])),
  );
  const commemorative = years.flatMap((y) => getCommemorativeDates(y));
  const all = [...nationalByYear.flat(), ...commemorative];
  const seen = new Set();
  return all.filter((h) => {
    if (h.date < startYmd || h.date > endYmd) return false;
    const k = `${h.date}|${h.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

module.exports = { getHolidaysBetween, getCommemorativeDates };
