const { connect, toObjectIds } = require('./mongo');
const {
  TZ,
  parsePeriod,
  getPreviousPeriod,
  buildPreviousPeriodMeta,
  buildPeriodIndex,
  buildMonthIndex,
  fillPeriodArray,
  fillMonthArray,
  emptyPeriodArray,
  emptyMonthArray,
  formatPeriodLabel,
  monthGroup,
} = require('./dates');
const { getVenuesByIds } = require('./venuesService');
const {
  aggregateOrigins,
  aggregateWaitlistOrigins,
  aggregateDetailedOrigins,
  originsToPercent,
  ORIGIN_LABELS,
  WAITLIST_ORIGIN_LABELS,
  mapOriginLabel,
} = require('./origins');

const venueMatch = (venueIds) => ({
  venue: { $in: toObjectIds(venueIds) },
});

const dateGroup = (field) => ({
  $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TZ },
});

/** Status de reserva no MongoDB */
const RES_SEATED = 'Seated';
const RES_NOSHOW = 'Canceled';
const resOpenMatch = (base) => ({ ...base, status: { $nin: [RES_SEATED, RES_NOSHOW] } });

async function countByVenue(db, collection, venueIds, start, end, dateField) {
  if (!venueIds.length) return {};
  const match = { ...venueMatch(venueIds), [dateField]: { $gte: start, $lt: end } };
  const rows = await db.collection(collection).aggregate([
    { $match: match },
    { $group: { _id: '$venue', count: { $sum: 1 } } },
  ]).toArray();
  const map = {};
  for (const r of rows) map[r._id.toString()] = r.count;
  return map;
}

async function aggregateReservations(db, venueIds, start, end, indexByYmd, indexByYm) {
  const dayCount = Object.keys(indexByYmd).length;
  const monthCount = indexByYm ? Object.keys(indexByYm).length : 0;
  const empty = {
    byDay: emptyPeriodArray(dayCount),
    seated: emptyPeriodArray(dayCount),
    noshow: emptyPeriodArray(dayCount),
    abertas: emptyPeriodArray(dayCount),
    pessoas: emptyPeriodArray(dayCount),
    noshowRate: emptyPeriodArray(dayCount),
    noshowRateConcluidas: emptyPeriodArray(dayCount),
    origins: {},
    originsDetail: [],
    byMonth: emptyMonthArray(monthCount),
    seatedMonth: emptyMonthArray(monthCount),
    noshowMonth: emptyMonthArray(monthCount),
    abertasMonth: emptyMonthArray(monthCount),
    originMonth: { w: emptyMonthArray(monthCount), t: emptyMonthArray(monthCount), g: emptyMonthArray(monthCount), c: emptyMonthArray(monthCount) },
    porStatus: {},
    total: 0,
    pessoasTotal: 0,
  };
  if (!venueIds.length) return empty;

  const match = { ...venueMatch(venueIds), reservationDay: { $gte: start, $lt: end } };

  const monthGroupField = monthGroup('reservationDay');

  const [byDay, seated, noshow, abertas, pessoas, origins, originsDetail, byMonth, seatedMonth, noshowMonth, abertasMonth, originMonthRows, statusRows] = await Promise.all([
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: { ...match, status: RES_SEATED } },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: { ...match, status: RES_NOSHOW } },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: resOpenMatch(match) },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: '$origin.label', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: '$origin.label', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: monthGroupField, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: { ...match, status: RES_SEATED } },
      { $group: { _id: monthGroupField, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: { ...match, status: RES_NOSHOW } },
      { $group: { _id: monthGroupField, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: resOpenMatch(match) },
      { $group: { _id: monthGroupField, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: { ym: monthGroupField, origin: '$origin.label' }, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray(),
  ]);

  const reservas = fillPeriodArray(byDay, indexByYmd);
  const sr = fillPeriodArray(seated, indexByYmd);
  const nr = fillPeriodArray(noshow, indexByYmd);
  const ar = fillPeriodArray(abertas, indexByYmd);
  const pessoasArr = fillPeriodArray(pessoas, indexByYmd);
  const nsr = reservas.map((t, i) => (t ? parseFloat(((nr[i] / t) * 100).toFixed(1)) : 0));
  const nsrConc = reservas.map((_, i) => {
    const concluded = sr[i] + nr[i];
    return concluded ? parseFloat(((nr[i] / concluded) * 100).toFixed(1)) : 0;
  });

  const porStatus = {};
  for (const row of statusRows) porStatus[row._id || 'Unknown'] = row.count;

  const originMonth = {
    w: emptyMonthArray(monthCount),
    t: emptyMonthArray(monthCount),
    g: emptyMonthArray(monthCount),
    c: emptyMonthArray(monthCount),
  };
  for (const row of originMonthRows) {
    const idx = indexByYm[row._id.ym];
    if (idx === undefined) continue;
    const cat = mapOriginLabel(row._id.origin);
    if (cat === 'Widget') originMonth.w[idx] += row.count;
    else if (cat === 'Telefone') originMonth.t[idx] += row.count;
    else if (cat === 'Google') originMonth.g[idx] += row.count;
    else originMonth.c[idx] += row.count;
  }

  return {
    byDay: reservas,
    seated: sr,
    noshow: nr,
    abertas: ar,
    pessoas: pessoasArr,
    noshowRate: nsr,
    noshowRateConcluidas: nsrConc,
    porStatus,
    origins: aggregateOrigins(origins),
    originsDetail: aggregateDetailedOrigins(originsDetail),
    byMonth: fillMonthArray(byMonth, indexByYm),
    seatedMonth: fillMonthArray(seatedMonth, indexByYm),
    noshowMonth: fillMonthArray(noshowMonth, indexByYm),
    abertasMonth: fillMonthArray(abertasMonth, indexByYm),
    originMonth,
    total: reservas.reduce((a, b) => a + b, 0),
    pessoasTotal: pessoasArr.reduce((a, b) => a + b, 0),
  };
}

async function aggregateWaitlists(db, venueIds, start, end, indexByYmd, indexByYm) {
  const dayCount = Object.keys(indexByYmd).length;
  const monthCount = indexByYm ? Object.keys(indexByYm).length : 0;
  const empty = {
    byDay: emptyPeriodArray(dayCount),
    seated: emptyPeriodArray(dayCount),
    noshow: emptyPeriodArray(dayCount),
    tempo: emptyPeriodArray(dayCount),
    pessoas: emptyPeriodArray(dayCount),
    pessoasSeated: emptyPeriodArray(dayCount),
    hora: Array(24).fill(0),
    origins: {},
    originsDetail: [],
    byMonth: emptyMonthArray(monthCount),
    seatedMonth: emptyMonthArray(monthCount),
    noshowMonth: emptyMonthArray(monthCount),
    total: 0,
    pessoasTotal: 0,
    pessoasSeatedTotal: 0,
  };
  if (!venueIds.length) return empty;

  const match = { ...venueMatch(venueIds), created_at: { $gte: start, $lt: end } };
  const seatedMatch = { ...match, seatedAt: { $exists: true, $ne: null } };
  const noshowMatch = {
    ...match,
    canceledAt: { $exists: true, $ne: null },
    $or: [{ seatedAt: { $exists: false } }, { seatedAt: null }],
  };
  const monthGroupField = monthGroup('created_at');

  const [byDay, seated, noshow, tempo, hora, pessoas, pessoasSeated, origins, originsDetail, byMonth, seatedMonth, noshowMonth] = await Promise.all([
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: dateGroup('created_at'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: seatedMatch },
      { $group: { _id: dateGroup('created_at'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: noshowMatch },
      { $group: { _id: dateGroup('created_at'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: { ...seatedMatch, waitingTime: { $gt: 0 } } },
      { $group: { _id: dateGroup('created_at'), avg: { $avg: '$waitingTime' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: { $hour: { date: '$created_at', timezone: TZ } }, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: dateGroup('created_at'), count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: seatedMatch },
      { $group: { _id: dateGroup('created_at'), count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: '$origin.label', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: '$origin.label', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: monthGroupField, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: seatedMatch },
      { $group: { _id: monthGroupField, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: noshowMatch },
      { $group: { _id: monthGroupField, count: { $sum: 1 } } },
    ]).toArray(),
  ]);

  const horaArr = Array(24).fill(0);
  for (const row of hora) horaArr[row._id] = row.count;

  const tempoRows = tempo.map((r) => ({ _id: r._id, count: Math.round(r.avg || 0) }));
  const pessoasArr = fillPeriodArray(pessoas, indexByYmd);
  const pessoasSeatedArr = fillPeriodArray(pessoasSeated, indexByYmd);

  return {
    byDay: fillPeriodArray(byDay, indexByYmd),
    seated: fillPeriodArray(seated, indexByYmd),
    noshow: fillPeriodArray(noshow, indexByYmd),
    tempo: fillPeriodArray(tempoRows, indexByYmd, 'count'),
    pessoas: pessoasArr,
    pessoasSeated: pessoasSeatedArr,
    hora: horaArr,
    origins: aggregateWaitlistOrigins(origins),
    originsDetail: aggregateDetailedOrigins(originsDetail),
    byMonth: fillMonthArray(byMonth, indexByYm),
    seatedMonth: fillMonthArray(seatedMonth, indexByYm),
    noshowMonth: fillMonthArray(noshowMonth, indexByYm),
    total: fillPeriodArray(byDay, indexByYmd).reduce((a, b) => a + b, 0),
    pessoasTotal: pessoasArr.reduce((a, b) => a + b, 0),
    pessoasSeatedTotal: pessoasSeatedArr.reduce((a, b) => a + b, 0),
  };
}

async function buildVenueRanking(db, venues, start, end, pStart, pEnd, venueIds) {
  const idSet = new Set(venueIds);
  const filtered = venues.filter((v) => idSet.has(v.id));
  const ids = filtered.map((v) => v.id);
  const [res, resP, wl, wlP] = await Promise.all([
    countByVenue(db, 'Reservations', ids, start, end, 'reservationDay'),
    countByVenue(db, 'Reservations', ids, pStart, pEnd, 'reservationDay'),
    countByVenue(db, 'Waitlists', ids, start, end, 'created_at'),
    countByVenue(db, 'Waitlists', ids, pStart, pEnd, 'created_at'),
  ]);

  return filtered.map((venue) => ({
    id: venue.id,
    nome: venue.nome,
    grupo: venue.grupoLabel || null,
    res: res[venue.id] || 0,
    res_p: resP[venue.id] || 0,
    fila: wl[venue.id] || 0,
    fila_p: wlP[venue.id] || 0,
  }));
}

async function buildCanalPorVenue(db, venues, start, end, venueIds) {
  const idSet = new Set(venueIds);
  const filtered = venues.filter((v) => idSet.has(v.id));
  const ids = filtered.map((v) => v.id);
  const result = { labels: [], w: [], t: [], g: [], c: [] };
  if (!ids.length) return result;

  const rows = await db.collection('Reservations').aggregate([
    {
      $match: {
        ...venueMatch(ids),
        reservationDay: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: { venue: '$venue', origin: '$origin.label' },
        count: { $sum: 1 },
      },
    },
  ]).toArray();

  const byVenue = {};
  for (const row of rows) {
    const vid = row._id.venue.toString();
    if (!byVenue[vid]) byVenue[vid] = { Widget: 0, Telefone: 0, Google: 0, Parceiros: 0 };
    const cat = mapOriginLabel(row._id.origin);
    byVenue[vid][cat] += row.count;
  }

  for (const venue of filtered) {
    const counts = byVenue[venue.id] || { Widget: 0, Telefone: 0, Google: 0, Parceiros: 0 };
    const pcts = originsToPercent(counts);
    result.labels.push(venue.nome);
    result.w.push(pcts[0]);
    result.t.push(pcts[1]);
    result.g.push(pcts[2]);
    result.c.push(pcts[3]);
  }

  return result;
}

async function buildPeriodData(db, venueIds, period, prevPeriod) {
  const { start, end, labels, indexByYmd, dayCount, inicio, fim } = period;
  const { start: pStart, end: pEnd } = prevPeriod;
  const periodoAnterior = buildPreviousPeriodMeta(start, end);
  const { indexByYmd: prevIndex } = buildPeriodIndex(pStart, pEnd);
  const { labels: mesLabels, indexByYm, monthCount } = buildMonthIndex(start, end);
  const { indexByYm: prevIndexYm } = buildMonthIndex(pStart, pEnd);

  const venues = await getVenuesByIds(venueIds);

  const [res, resPrev, wl, wlPrev, unidades, canal] = await Promise.all([
    aggregateReservations(db, venueIds, start, end, indexByYmd, indexByYm),
    aggregateReservations(db, venueIds, pStart, pEnd, prevIndex, prevIndexYm),
    aggregateWaitlists(db, venueIds, start, end, indexByYmd, indexByYm),
    aggregateWaitlists(db, venueIds, pStart, pEnd, prevIndex, prevIndexYm),
    buildVenueRanking(db, venues, start, end, pStart, pEnd, venueIds),
    buildCanalPorVenue(db, venues, start, end, venueIds),
  ]);

  return {
    labels,
    dayCount,
    mesLabels,
    monthCount,
    reservas: res.byDay,
    res_p: resPrev.byDay,
    fila: wl.byDay,
    fil_p: wlPrev.byDay,
    sr: res.seated,
    sr_p: resPrev.seated,
    nr: res.noshow,
    nr_p: resPrev.noshow,
    ar: res.abertas,
    ar_p: resPrev.abertas,
    sf: wl.seated,
    sf_p: wlPrev.seated,
    nf: wl.noshow,
    tempo: wl.tempo,
    tem_p: wlPrev.tempo,
    pessoas: res.pessoas,
    pes_p: resPrev.pessoas,
    filaPessoas: wl.pessoas,
    filaPessoas_p: wlPrev.pessoas,
    filaPessoasSentadas: wl.pessoasSeated,
    hora: wl.hora,
    hor_p: wlPrev.hora,
    nsr: res.noshowRate,
    nsr_p: resPrev.noshowRate,
    nsr_conc: res.noshowRateConcluidas,
    nsr_conc_p: resPrev.noshowRateConcluidas,
    res_mes: res.byMonth,
    res_mes_p: resPrev.byMonth,
    fila_mes: wl.byMonth,
    fila_mes_p: wlPrev.byMonth,
    res_mes_sr: res.seatedMonth,
    res_mes_nr: res.noshowMonth,
    res_mes_ar: res.abertasMonth,
    fila_mes_sf: wl.seatedMonth,
    fila_mes_nf: wl.noshowMonth,
    res_mes_origem: res.originMonth,
    unidades,
    origem: {
      labels: ORIGIN_LABELS,
      a: originsToPercent(res.origins),
      p: originsToPercent(resPrev.origins),
      counts: res.origins,
      countsPrev: resPrev.origins,
    },
    origemFila: {
      labels: WAITLIST_ORIGIN_LABELS,
      a: originsToPercent(wl.origins, WAITLIST_ORIGIN_LABELS),
      p: originsToPercent(wlPrev.origins, WAITLIST_ORIGIN_LABELS),
      counts: wl.origins,
      countsPrev: wlPrev.origins,
    },
    origemDetalhe: {
      reservas: res.originsDetail,
      fila: wl.originsDetail,
    },
    totais: {
      reservas: res.total,
      reservasPessoas: res.pessoasTotal,
      reservasSentadas: res.seated.reduce((a, b) => a + b, 0),
      reservasNoshow: res.noshow.reduce((a, b) => a + b, 0),
      reservasAbertas: res.abertas.reduce((a, b) => a + b, 0),
      reservasPorStatus: res.porStatus,
      fila: wl.total,
      filaPessoas: wl.pessoasTotal,
      filaPessoasSentadas: wl.pessoasSeatedTotal,
    },
    canal,
    periodo: {
      inicio,
      fim,
      label: formatPeriodLabel(inicio, fim),
      dayCount,
      inicioISO: start.toISOString(),
      fimISO: end.toISOString(),
    },
    periodoAnterior,
  };
}

function formatVenueLabel(venues) {
  if (!venues.length) return 'Nenhuma venue';
  if (venues.length === 1) return venues[0].nome;
  if (venues.length <= 3) return venues.map((v) => v.nome).join(', ');
  return `${venues.length} venues selecionadas`;
}

async function getDashboard(inicio, fim, venueIds = []) {
  const db = await connect();
  const ids = [...new Set((venueIds || []).filter(Boolean))];
  if (!ids.length) {
    throw new Error('Selecione ao menos uma venue.');
  }
  const period = parsePeriod(inicio, fim);
  const prevPeriod = getPreviousPeriod(period.start, period.end);
  const venues = await getVenuesByIds(ids);
  const data = await buildPeriodData(db, ids, period, prevPeriod);

  return {
    ...data,
    meta: {
      inicio: period.inicio,
      fim: period.fim,
      venues: venues.map((v) => ({ id: v.id, nome: v.nome })),
      venueIds: ids,
      venueNome: formatVenueLabel(venues),
      fonte: 'MongoDB tagme',
      timezone: 'America/Sao_Paulo',
      atualizadoEm: new Date().toISOString(),
    },
  };
}

module.exports = { getDashboard };
