const { connect, toObjectIds } = require('./mongo');
const { parsePeriod, fillPeriodArray, TZ, formatPeriodLabel } = require('./dates');
const { getVenuesByIds, getVenueGeoCentroid } = require('./venuesService');
const { getHolidaysBetween } = require('./holidaysService');
const { getEventsBetween } = require('./eventsCatalog');
const { fetchDailyWeather, weatherLabel, RAIN_MM_THRESHOLD, DEFAULT_GEO, resolveWeatherRegion, buildGeoDescription } = require('./weatherService');

const dateGroup = (field) => ({
  $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TZ },
});

function weekdayBrt(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(noon);
}

function isWeekendBrt(ymd) {
  const wd = weekdayBrt(ymd);
  return wd === 'Sat' || wd === 'Sun';
}

function avg(nums) {
  const valid = nums.filter((n) => n != null && !Number.isNaN(n));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function deltaPct(value, baseline) {
  if (!baseline) return value ? 100 : 0;
  return round1(((value - baseline) / baseline) * 100);
}

async function aggregateDailyMetrics(db, venueIds, start, end, indexByYmd) {
  const match = { venue: { $in: toObjectIds(venueIds) }, reservationDay: { $gte: start, $lt: end } };
  const [resRows, filaRows] = await Promise.all([
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: 1 }, pessoas: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: { venue: { $in: toObjectIds(venueIds) }, created_at: { $gte: start, $lt: end } } },
      { $group: { _id: dateGroup('created_at'), count: { $sum: 1 }, pessoas: { $sum: '$partySize' } } },
    ]).toArray(),
  ]);

  const reservas = fillPeriodArray(resRows, indexByYmd);
  const pessoasRows = resRows.map((r) => ({ _id: r._id, count: r.pessoas }));
  const pessoas = fillPeriodArray(pessoasRows, indexByYmd);
  const fila = fillPeriodArray(filaRows, indexByYmd);
  const filaPessoasRows = filaRows.map((r) => ({ _id: r._id, count: r.pessoas }));
  const filaPessoas = fillPeriodArray(filaPessoasRows, indexByYmd);
  return { reservas, pessoas, fila, filaPessoas };
}

function buildGroupStats(days, groupKey, predicate) {
  const subset = days.filter(predicate);
  const baseline = avg(days.map((d) => d.reservas));
  const baselinePes = avg(days.map((d) => d.pessoas));
  const avgRes = avg(subset.map((d) => d.reservas));
  const avgFila = avg(subset.map((d) => d.fila));
  const avgPes = avg(subset.map((d) => d.pessoas));
  const avgFilaPes = avg(subset.map((d) => d.filaPessoas));
  return {
    key: groupKey,
    dayCount: subset.length,
    avgReservas: round1(avgRes),
    avgPessoas: round1(avgPes),
    avgFila: round1(avgFila),
    avgFilaPessoas: round1(avgFilaPes),
    deltaVsBaselinePct: deltaPct(avgRes, baseline),
    deltaPessoasVsBaselinePct: deltaPct(avgPes, baselinePes),
    baselineAvgReservas: round1(baseline),
    baselineAvgPessoas: round1(baselinePes),
  };
}

function narrativeForDay(day, baseline) {
  const parts = [];
  const delta = deltaPct(day.reservas, baseline);
  if (day.tags.length) {
    parts.push(day.tags.map((t) => t.name).join(' · '));
  }
  if (day.weather?.isRainy) {
    parts.push(`Chuva em ${day.weatherRegion || 'região de referência'}: ${day.weather.precipMm} mm`);
  }
  if (Math.abs(delta) >= 5) {
    parts.push(delta > 0
      ? `${delta}% acima da média do período`
      : `${Math.abs(delta)}% abaixo da média do período`);
  } else {
    parts.push('Próximo da média do período');
  }
  return parts.join(' — ');
}

async function getContextAnalysis(inicio, fim, venueIds) {
  const ids = [...new Set((venueIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('Selecione ao menos uma loja.');

  const period = parsePeriod(inicio, fim);
  const { start, end, labels, indexByYmd, dayCount, inicio: ini, fim: fin } = period;
  const ymds = Object.keys(indexByYmd).sort();

  const db = await connect();
  const [metrics, venues, geo, holidays, events] = await Promise.all([
    aggregateDailyMetrics(db, ids, start, end, indexByYmd),
    getVenuesByIds(ids),
    getVenueGeoCentroid(ids),
    getHolidaysBetween(ini, fin),
    Promise.resolve(getEventsBetween(ini, fin)),
  ]);

  const geoPoint = geo || { lat: DEFAULT_GEO.lat, lon: DEFAULT_GEO.lon };
  const isFallback = !geo;

  let weatherByDay = {};
  let weatherError = null;
  let region = {
    city: DEFAULT_GEO.city,
    state: DEFAULT_GEO.state,
    country: DEFAULT_GEO.country,
    display: DEFAULT_GEO.display,
    shortLabel: DEFAULT_GEO.label,
  };
  try {
    region = await resolveWeatherRegion(geoPoint.lat, geoPoint.lon);
  } catch (err) {
    console.warn('Geocodificação clima:', err.message);
    if (isFallback) region = { ...region };
  }

  try {
    weatherByDay = await fetchDailyWeather(geoPoint.lat, geoPoint.lon, ini, fin);
  } catch (err) {
    weatherError = err.message;
  }

  const venueCountWithGeo = geo?.venueCount || 0;
  const venueCountTotal = ids.length;
  const geoDescription = buildGeoDescription({
    hasVenueGeo: !isFallback,
    venueCountWithGeo,
    venueCountTotal,
    region,
    isFallback,
  });

  const holidayByDate = Object.fromEntries(holidays.map((h) => [h.date, h]));
  const eventsByDate = {};
  for (const ev of events) {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    eventsByDate[ev.date].push(ev);
  }

  const days = ymds.map((ymd, i) => {
    const tags = [];
    const h = holidayByDate[ymd];
    if (h) tags.push({ type: h.type, name: h.name, impact: h.impact });
    for (const ev of eventsByDate[ymd] || []) {
      tags.push({ type: ev.type, name: ev.name, impact: ev.impact, category: ev.category, note: ev.note });
    }
    const weather = weatherByDay[ymd] || null;
    if (weather?.isRainy) {
      tags.push({
        type: 'clima',
        name: `Chuva forte — ${region.shortLabel || region.display} (${weather.precipMm} mm)`,
        impact: 'negative',
      });
    }
    const weekend = isWeekendBrt(ymd);
    if (weekend) {
      tags.push({ type: 'fim_semana', name: 'Fim de semana', impact: 'positive' });
    }

    const isSpecial = tags.some((t) => t.type !== 'fim_semana');
    const wLabel = weather ? weatherLabel(weather.weatherCode) : null;

    return {
      ymd,
      label: labels[i],
      weekday: weekdayBrt(ymd),
      reservas: metrics.reservas[i],
      pessoas: metrics.pessoas[i],
      fila: metrics.fila[i],
      filaPessoas: metrics.filaPessoas[i],
      weather: weather ? { ...weather, label: wLabel } : null,
      weatherRegion: region.shortLabel || region.display,
      tags,
      isSpecial,
      isWeekend: weekend,
    };
  });

  const baselineRes = avg(days.map((d) => d.reservas));
  const baselineFila = avg(days.map((d) => d.fila));

  for (const day of days) {
    day.deltaReservasPct = deltaPct(day.reservas, baselineRes);
    day.deltaFilaPct = deltaPct(day.fila, baselineFila);
    day.narrative = narrativeForDay(day, baselineRes);
  }

  const groups = [
    buildGroupStats(days, 'normal', (d) => !d.isSpecial && !d.isWeekend && !d.weather?.isRainy),
    buildGroupStats(days, 'feriado', (d) => d.tags.some((t) => t.type === 'feriado')),
    buildGroupStats(days, 'comemorativo', (d) => d.tags.some((t) => t.type === 'comemorativo')),
    buildGroupStats(days, 'evento', (d) => d.tags.some((t) => t.type === 'evento')),
    buildGroupStats(days, 'chuva', (d) => d.weather?.isRainy),
    buildGroupStats(days, 'fim_semana', (d) => d.isWeekend),
    buildGroupStats(days, 'especial', (d) => d.isSpecial),
  ].filter((g) => g.dayCount > 0);

  const highlights = [...days]
    .filter((d) => d.isSpecial || d.weather?.isRainy)
    .sort((a, b) => Math.abs(b.deltaReservasPct) - Math.abs(a.deltaReservasPct))
    .slice(0, 12);

  return {
    periodo: {
      inicio: ini,
      fim: fin,
      label: formatPeriodLabel(ini, fin),
      dayCount,
      labels,
    },
    baseline: {
      avgReservas: round1(baselineRes),
      avgFila: round1(baselineFila),
      avgPessoas: round1(avg(days.map((d) => d.pessoas))),
    },
    reservas: metrics.reservas,
    pessoas: metrics.pessoas,
    fila: metrics.fila,
    filaPessoas: metrics.filaPessoas,
    days,
    groups,
    highlights,
    geo: {
      lat: round1(geoPoint.lat),
      lon: round1(geoPoint.lon),
      region,
      shortLabel: region.shortLabel || region.display,
      description: geoDescription,
      source: isFallback ? 'default_fallback' : 'venue_centroid',
      venueCountWithGeo,
      venueCountTotal,
    },
    sources: {
      clima: `Open-Meteo (ERA5) · ${region.display || region.shortLabel}`,
      feriados: 'Nager.Date + datas comemorativas BR',
      eventos: 'Catálogo curado (Copa 2026, Carnaval, etc.)',
      weatherError,
      rainThresholdMm: RAIN_MM_THRESHOLD,
    },
    meta: {
      venues,
      venueIds: ids,
      timezone: TZ,
      atualizadoEm: new Date().toISOString(),
    },
  };
}

module.exports = { getContextAnalysis };
