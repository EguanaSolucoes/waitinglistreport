const { connect, toObjectIds } = require('./mongo');
const { parsePeriod, fillPeriodArray, TZ, formatPeriodLabel } = require('./dates');
const { getVenuesByIds, getVenuesWithGeo } = require('./venuesService');
const { getHolidaysBetween } = require('./holidaysService');
const { getEventsBetween } = require('./eventsCatalog');
const {
  fetchVenuesDailyWeather,
  weatherLabel,
  RAIN_MM_THRESHOLD,
  VERY_RAIN_MM_THRESHOLD,
  buildPerVenueGeoDescription,
} = require('./weatherService');

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
  if (day.veryRainyVenues?.length) {
    parts.push(day.veryRainyVenues.map((v) => `${v.venueName}: dia muito chuvoso (${v.weather.precipMm} mm)`).join(' · '));
  } else if (day.rainyVenues?.length) {
    parts.push(day.rainyVenues.map((v) => `${v.venueName}: chuva (${v.weather.precipMm} mm)`).join(' · '));
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

function buildVenueWeatherForDay(venueGeos, weatherByVenueId, ymd) {
  return venueGeos.map((venue) => {
    const bucket = weatherByVenueId[venue.id];
    if (!bucket || bucket.error) {
      return {
        venueId: venue.id,
        venueName: venue.nome,
        hasGeo: venue.hasGeo,
        weather: null,
        error: bucket?.error || (venue.hasGeo ? null : 'Sem coordenada'),
      };
    }
    const raw = bucket[ymd] || null;
    const weather = raw
      ? { ...raw, label: weatherLabel(raw.weatherCode) }
      : null;
    return { venueId: venue.id, venueName: venue.nome, hasGeo: venue.hasGeo, weather, error: null };
  });
}

function summarizeDayWeather(venueWeather) {
  const rainyVenues = venueWeather.filter((v) => v.weather?.isRainy);
  const veryRainyVenues = venueWeather.filter((v) => v.weather?.isVeryRainy);
  const precipValues = venueWeather.map((v) => v.weather?.precipMm ?? 0);
  const maxPrecip = precipValues.length ? Math.max(...precipValues) : 0;
  const maxVenue = venueWeather.find((v) => v.weather?.precipMm === maxPrecip) || null;
  const tempValues = venueWeather.map((v) => v.weather?.tempMaxC).filter((t) => t != null);
  const maxTemp = tempValues.length ? Math.max(...tempValues) : null;
  return {
    precipMm: round1(maxPrecip),
    isRainy: rainyVenues.length > 0,
    isVeryRainy: veryRainyVenues.length > 0,
    rainyVenueCount: rainyVenues.length,
    veryRainyVenueCount: veryRainyVenues.length,
    label: maxVenue?.weather?.label || null,
    tempMaxC: maxTemp != null ? round1(maxTemp) : null,
    venueWeather,
    rainyVenues,
    veryRainyVenues,
  };
}

async function getContextAnalysis(inicio, fim, venueIds) {
  const ids = [...new Set((venueIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('Selecione ao menos uma loja.');

  const period = parsePeriod(inicio, fim);
  const { start, end, labels, indexByYmd, dayCount, inicio: ini, fim: fin } = period;
  const ymds = Object.keys(indexByYmd).sort();

  const db = await connect();
  const [metrics, venues, venueGeos, holidays, events] = await Promise.all([
    aggregateDailyMetrics(db, ids, start, end, indexByYmd),
    getVenuesByIds(ids),
    getVenuesWithGeo(ids),
    getHolidaysBetween(ini, fin),
    Promise.resolve(getEventsBetween(ini, fin)),
  ]);

  const venuesWithGeo = venueGeos.filter((v) => v.hasGeo);
  let weatherByVenueId = {};
  const weatherErrors = [];
  try {
    weatherByVenueId = await fetchVenuesDailyWeather(venueGeos, ini, fin);
    for (const [venueId, bucket] of Object.entries(weatherByVenueId)) {
      if (bucket?.error) {
        const venue = venueGeos.find((v) => v.id === venueId);
        weatherErrors.push(`${venue?.nome || venueId}: ${bucket.error}`);
      }
    }
  } catch (err) {
    weatherErrors.push(err.message);
  }

  const venueCountWithGeo = venuesWithGeo.length;
  const venueCountTotal = ids.length;
  const geoDescription = buildPerVenueGeoDescription({ venuesWithGeo, venueCountTotal });

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

    const venueWeather = buildVenueWeatherForDay(venueGeos, weatherByVenueId, ymd);
    const weatherSummary = summarizeDayWeather(venueWeather);
    for (const v of weatherSummary.veryRainyVenues) {
      tags.push({
        type: 'clima',
        name: `${v.venueName} — dia muito chuvoso (${v.weather.precipMm} mm)`,
        impact: 'negative',
        venueId: v.venueId,
        veryRainy: true,
      });
    }
    for (const v of weatherSummary.rainyVenues.filter((rv) => !rv.weather.isVeryRainy)) {
      tags.push({
        type: 'clima',
        name: `${v.venueName} — chuva forte (${v.weather.precipMm} mm)`,
        impact: 'negative',
        venueId: v.venueId,
        veryRainy: false,
      });
    }

    const weekend = isWeekendBrt(ymd);
    if (weekend) {
      tags.push({ type: 'fim_semana', name: 'Fim de semana', impact: 'positive' });
    }

    const isSpecial = tags.some((t) => t.type !== 'fim_semana');

    return {
      ymd,
      label: labels[i],
      weekday: weekdayBrt(ymd),
      reservas: metrics.reservas[i],
      pessoas: metrics.pessoas[i],
      fila: metrics.fila[i],
      filaPessoas: metrics.filaPessoas[i],
      weather: {
        precipMm: weatherSummary.precipMm,
        isRainy: weatherSummary.isRainy,
        isVeryRainy: weatherSummary.isVeryRainy,
        rainyVenueCount: weatherSummary.rainyVenueCount,
        label: weatherSummary.label,
        tempMaxC: weatherSummary.tempMaxC,
      },
      venueWeather: weatherSummary.venueWeather,
      rainyVenues: weatherSummary.rainyVenues,
      veryRainyVenues: weatherSummary.veryRainyVenues,
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
    buildGroupStats(
      days,
      'feriado_comemorativo',
      (d) => d.tags.some((t) => t.type === 'feriado' || t.type === 'comemorativo'),
    ),
    buildGroupStats(days, 'evento', (d) => d.tags.some((t) => t.type === 'evento')),
    buildGroupStats(days, 'chuva', (d) => d.weather?.isRainy),
    buildGroupStats(days, 'fim_semana', (d) => d.isWeekend),
  ].filter((g) => g.dayCount > 0);

  const highlights = [...days]
    .filter((d) => d.isSpecial || d.weather?.isRainy)
    .sort((a, b) => Math.abs(b.deltaReservasPct) - Math.abs(a.deltaReservasPct))
    .slice(0, 12);

  const weatherAlerts = days.flatMap((day) => (
    (day.venueWeather || [])
      .filter((v) => v.weather?.isRainy)
      .map((v) => ({
        ymd: day.ymd,
        label: day.label,
        weekday: day.weekday,
        venueId: v.venueId,
        venueName: v.venueName,
        precipMm: v.weather.precipMm,
        weatherLabel: v.weather.label,
        isVeryRainy: !!v.weather.isVeryRainy,
        message: v.weather.isVeryRainy ? 'dia muito chuvoso' : 'chuva forte',
      }))
  )).sort((a, b) => {
    if (a.isVeryRainy !== b.isVeryRainy) return a.isVeryRainy ? -1 : 1;
    return a.ymd.localeCompare(b.ymd) || a.venueName.localeCompare(b.venueName, 'pt-BR');
  });

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
    weatherAlerts,
    geo: {
      mode: 'per_venue',
      description: geoDescription,
      venueCountWithGeo,
      venueCountTotal,
      venues: venueGeos.map((v) => ({
        id: v.id,
        nome: v.nome,
        hasGeo: v.hasGeo,
        lat: v.hasGeo ? round1(v.lat) : null,
        lon: v.hasGeo ? round1(v.lon) : null,
      })),
    },
    sources: {
      clima: 'Open-Meteo (ERA5) · consulta por loja',
      feriados: 'Nager.Date + datas comemorativas BR',
      eventos: 'Catálogo curado (Copa 2026, Carnaval, etc.)',
      weatherError: weatherErrors.length ? weatherErrors.join(' · ') : null,
      rainThresholdMm: RAIN_MM_THRESHOLD,
      veryRainThresholdMm: VERY_RAIN_MM_THRESHOLD,
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
