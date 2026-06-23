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
  formatYmdFromDate,
  ymdToStart,
  ymdEndInclusive,
  monthGroup,
} = require('./dates');
const { getVenuesByIds } = require('./venuesService');
const { buildFirstVisitMap, aggregateCustomerType, aggregateCustomerTypeByVenue } = require('./customerTypeService');
const {
  aggregateOrigins,
  aggregateWaitlistOrigins,
  aggregateDetailedOrigins,
  originsToPercent,
  ORIGIN_LABELS,
  WAITLIST_ORIGIN_LABELS,
  mapOriginLabel,
  aggregateOriginsPessoas,
  aggregateWaitlistOriginsPessoas,
} = require('./origins');

const venueMatch = (venueIds) => ({
  venue: { $in: toObjectIds(venueIds) },
});

const dateGroup = (field) => ({
  $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TZ },
});

const reservationHourExpr = {
  $cond: {
    if: { $eq: [{ $type: '$reservationTime' }, 'string'] },
    then: { $toInt: { $arrayElemAt: [{ $split: ['$reservationTime', ':'] }, 0] } },
    else: { $hour: { date: '$reservationTime', timezone: TZ } },
  },
};

/** Minutos de espera: usa waitingTime quando > 0, senão seatedAt − created_at */
const waitMinutesExpr = {
  $let: {
    vars: {
      fromDiff: {
        $cond: {
          if: { $and: [{ $ne: ['$seatedAt', null] }, { $ne: ['$created_at', null] }] },
          then: {
            $divide: [
              { $subtract: [{ $toDate: '$seatedAt' }, { $toDate: '$created_at' }] },
              60000,
            ],
          },
          else: null,
        },
      },
    },
    in: {
      $cond: {
        if: { $gt: ['$waitingTime', 0] },
        then: '$waitingTime',
        else: '$$fromDiff',
      },
    },
  },
};

function fillHoraArrays(rows) {
  const hora = Array(24).fill(0);
  const horaPessoas = Array(24).fill(0);
  for (const row of rows) {
    const h = row._id;
    if (h >= 0 && h <= 23) {
      hora[h] = row.count;
      horaPessoas[h] = row.pessoas || 0;
    }
  }
  return { hora, horaPessoas };
}

/** MongoDB $dayOfWeek: 1=Dom … 7=Sáb → índice Seg(0)…Dom(6) */
const MONGO_DOW_TO_IDX = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 1: 6 };
const WEEKDAY_TO_IDX = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };

function emptyHoraHeatmap() {
  return Array.from({ length: 7 }, () => Array(24).fill(0));
}

function countDowInPeriod(indexByYmd) {
  const counts = Array(7).fill(0);
  for (const ymd of Object.keys(indexByYmd)) {
    const d = ymdToStart(ymd);
    d.setUTCHours(15);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(d);
    const idx = WEEKDAY_TO_IDX[weekday];
    if (idx !== undefined) counts[idx]++;
  }
  return counts;
}

function fillHoraHeatmap(rows, indexByYmd) {
  const dowCounts = countDowInPeriod(indexByYmd);
  const totals = emptyHoraHeatmap();
  for (const row of rows) {
    const mongoDow = row._id?.dow ?? row._id;
    const h = row._id?.hour;
    if (h == null || h < 0 || h > 23) continue;
    const idx = MONGO_DOW_TO_IDX[mongoDow];
    if (idx === undefined) continue;
    totals[idx][h] += row.count || 0;
  }
  return totals.map((hours, dowIdx) => {
    const n = dowCounts[dowIdx] || 0;
    return hours.map((v) => (n ? Math.round((v / n) * 10) / 10 : 0));
  });
}

const horaDowGroupCreatedAt = {
  dow: { $dayOfWeek: { date: '$created_at', timezone: TZ } },
  hour: { $hour: { date: '$created_at', timezone: TZ } },
};

const horaDowGroupReservation = {
  dow: { $dayOfWeek: { date: '$reservationDay', timezone: TZ } },
  hour: '$resHour',
};

/** Status de reserva no MongoDB */
const RES_SEATED = 'Seated';
const RES_NOSHOW = 'Canceled';
const resOpenMatch = (base) => ({ ...base, status: { $nin: [RES_SEATED, RES_NOSHOW] } });

/** Walk-ins ativos — exclui registros com deletedAt (alinhado ao export Excel do Manager). */
function walkInActiveClause() {
  return { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] };
}

function walkInMatch(venueIds, start, end) {
  return {
    ...venueMatch(venueIds),
    created_at: { $gte: start, $lt: end },
    ...walkInActiveClause(),
  };
}

async function countByVenueMatch(db, collection, venueIds, start, end, dateField, extraMatch = {}) {
  if (!venueIds.length) return {};
  const match = { ...venueMatch(venueIds), [dateField]: { $gte: start, $lt: end }, ...extraMatch };
  if (collection === 'WalkIns') Object.assign(match, walkInActiveClause());
  const rows = await db.collection(collection).aggregate([
    { $match: match },
    { $group: { _id: '$venue', count: { $sum: 1 } } },
  ]).toArray();
  const map = {};
  for (const r of rows) map[r._id.toString()] = r.count;
  return map;
}

async function sumPessoasByVenueMatch(db, collection, venueIds, start, end, dateField, extraMatch = {}) {
  if (!venueIds.length) return {};
  const match = { ...venueMatch(venueIds), [dateField]: { $gte: start, $lt: end }, ...extraMatch };
  if (collection === 'WalkIns') Object.assign(match, walkInActiveClause());
  const rows = await db.collection(collection).aggregate([
    { $match: match },
    { $group: { _id: '$venue', count: { $sum: '$partySize' } } },
  ]).toArray();
  const map = {};
  for (const r of rows) map[r._id.toString()] = r.count;
  return map;
}

async function countPessoasByVenue(db, collection, venueIds, start, end, dateField) {
  if (!venueIds.length) return {};
  const match = { ...venueMatch(venueIds), [dateField]: { $gte: start, $lt: end } };
  const rows = await db.collection(collection).aggregate([
    { $match: match },
    { $group: { _id: '$venue', count: { $sum: '$partySize' } } },
  ]).toArray();
  const map = {};
  for (const r of rows) map[r._id.toString()] = r.count;
  return map;
}

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

async function avgTempoByVenue(db, venueIds, start, end) {
  const tempo = {};
  const seated = {};
  if (!venueIds.length) return { tempo, seated };

  const seatedMatch = {
    ...venueMatch(venueIds),
    created_at: { $gte: start, $lt: end },
    seatedAt: { $exists: true, $ne: null },
  };
  const rows = await db.collection('Waitlists').aggregate([
    { $match: seatedMatch },
    { $addFields: { waitMin: waitMinutesExpr } },
    { $match: { waitMin: { $gt: 0, $lte: 720 } } },
    { $group: { _id: '$venue', avg: { $avg: '$waitMin' }, count: { $sum: 1 } } },
  ]).toArray();
  for (const row of rows) {
    const id = row._id.toString();
    tempo[id] = Math.round(row.avg || 0);
    seated[id] = row.count || 0;
  }
  return { tempo, seated };
}

async function sumResPessoas(db, match) {
  const rows = await db.collection('Reservations').aggregate([
    { $match: match },
    { $group: { _id: null, n: { $sum: '$partySize' } } },
  ]).toArray();
  return rows[0]?.n || 0;
}

const FUTURE_DAYS = 30;

/** Reservas com reservationDay de hoje até +30 dias (BRT) */
async function aggregateFutureReservations(db, venueIds) {
  const empty = {
    total: 0,
    pessoasTotal: 0,
    seated: 0,
    seatedPessoas: 0,
    noshow: 0,
    noshowPessoas: 0,
    abertas: 0,
    abertasPessoas: 0,
    inicio: '',
    fim: '',
    label: '',
    labels: [],
    abertasByDay: [],
    abertasPessoasByDay: [],
    abertasByDayPrev: [],
    abertasPessoasByDayPrev: [],
    periodoAnterior: { label: '', labels: [] },
  };
  if (!venueIds.length) return empty;

  const inicio = formatYmdFromDate(new Date());
  const start = ymdToStart(inicio);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + FUTURE_DAYS);
  const fim = ymdEndInclusive(end);

  const { labels, indexByYmd } = buildPeriodIndex(start, end);

  const prevEnd = new Date(start);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - FUTURE_DAYS);
  const { labels: prevLabels, indexByYmd: prevIndexByYmd } = buildPeriodIndex(prevStart, prevEnd);
  const prevInicio = formatYmdFromDate(prevStart);
  const prevFim = ymdEndInclusive(prevEnd);

  const match = { ...venueMatch(venueIds), reservationDay: { $gte: start, $lt: end } };
  const prevMatch = { ...venueMatch(venueIds), reservationDay: { $gte: prevStart, $lt: prevEnd } };
  const seatedMatch = { ...match, status: RES_SEATED };
  const noshowMatch = { ...match, status: RES_NOSHOW };
  const abertasMatch = resOpenMatch(match);
  const abertasPrevMatch = resOpenMatch(prevMatch);

  const [
    total,
    pessoasTotal,
    seated,
    seatedPessoas,
    noshow,
    noshowPessoas,
    abertas,
    abertasPessoas,
    abertasByDayRows,
    abertasPessoasByDayRows,
    abertasByDayPrevRows,
    abertasPessoasByDayPrevRows,
  ] = await Promise.all([
    db.collection('Reservations').countDocuments(match),
    sumResPessoas(db, match),
    db.collection('Reservations').countDocuments(seatedMatch),
    sumResPessoas(db, seatedMatch),
    db.collection('Reservations').countDocuments(noshowMatch),
    sumResPessoas(db, noshowMatch),
    db.collection('Reservations').countDocuments(abertasMatch),
    sumResPessoas(db, abertasMatch),
    db.collection('Reservations').aggregate([
      { $match: abertasMatch },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: abertasMatch },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: abertasPrevMatch },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: abertasPrevMatch },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: '$partySize' } } },
    ]).toArray(),
  ]);

  return {
    total,
    pessoasTotal,
    seated,
    seatedPessoas,
    noshow,
    noshowPessoas,
    abertas,
    abertasPessoas,
    inicio,
    fim,
    label: formatPeriodLabel(inicio, fim),
    labels,
    abertasByDay: fillPeriodArray(abertasByDayRows, indexByYmd),
    abertasPessoasByDay: fillPeriodArray(abertasPessoasByDayRows, indexByYmd),
    abertasByDayPrev: fillPeriodArray(abertasByDayPrevRows, prevIndexByYmd),
    abertasPessoasByDayPrev: fillPeriodArray(abertasPessoasByDayPrevRows, prevIndexByYmd),
    periodoAnterior: {
      label: formatPeriodLabel(prevInicio, prevFim),
      labels: prevLabels,
    },
  };
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
    seatedPessoas: emptyPeriodArray(dayCount),
    noshowPessoas: emptyPeriodArray(dayCount),
    abertasPessoas: emptyPeriodArray(dayCount),
    noshowRate: emptyPeriodArray(dayCount),
    noshowRateConcluidas: emptyPeriodArray(dayCount),
    origins: {},
    originsPessoas: {},
    originsDetail: [],
    byMonth: emptyMonthArray(monthCount),
    seatedMonth: emptyMonthArray(monthCount),
    noshowMonth: emptyMonthArray(monthCount),
    abertasMonth: emptyMonthArray(monthCount),
    pessoasMonth: emptyMonthArray(monthCount),
    seatedMonthPessoas: emptyMonthArray(monthCount),
    noshowMonthPessoas: emptyMonthArray(monthCount),
    abertasMonthPessoas: emptyMonthArray(monthCount),
    originMonth: { w: emptyMonthArray(monthCount), t: emptyMonthArray(monthCount), g: emptyMonthArray(monthCount), c: emptyMonthArray(monthCount) },
    porStatus: {},
    total: 0,
    pessoasTotal: 0,
    seatedPessoasTotal: 0,
    noshowPessoasTotal: 0,
    abertasPessoasTotal: 0,
    hora: Array(24).fill(0),
    horaPessoas: Array(24).fill(0),
    horaHeatmap: emptyHoraHeatmap(),
  };
  if (!venueIds.length) return empty;

  const match = { ...venueMatch(venueIds), reservationDay: { $gte: start, $lt: end } };

  const monthGroupField = monthGroup('reservationDay');

  const [byDay, seated, noshow, abertas, pessoas, seatedPessoas, noshowPessoas, abertasPessoas, horaRows, horaHeatRows, origins, originsDetail, byMonth, seatedMonth, noshowMonth, abertasMonth, pessoasMonth, seatedMonthPessoas, noshowMonthPessoas, abertasMonthPessoas, originMonthRows, statusRows] = await Promise.all([
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
      { $match: { ...match, status: RES_SEATED } },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: { ...match, status: RES_NOSHOW } },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: resOpenMatch(match) },
      { $group: { _id: dateGroup('reservationDay'), count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: { ...match, reservationTime: { $exists: true, $nin: [null, ''] } } },
      { $addFields: { resHour: reservationHourExpr } },
      { $match: { resHour: { $gte: 0, $lte: 23 } } },
      { $group: { _id: '$resHour', count: { $sum: 1 }, pessoas: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: { ...match, reservationTime: { $exists: true, $nin: [null, ''] } } },
      { $addFields: { resHour: reservationHourExpr } },
      { $match: { resHour: { $gte: 0, $lte: 23 } } },
      { $group: { _id: horaDowGroupReservation, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: '$origin.label', count: { $sum: 1 }, pessoas: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: '$origin.label', count: { $sum: 1 }, pessoas: { $sum: '$partySize' } } },
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
      { $group: { _id: monthGroupField, count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: { ...match, status: RES_SEATED } },
      { $group: { _id: monthGroupField, count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: { ...match, status: RES_NOSHOW } },
      { $group: { _id: monthGroupField, count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: resOpenMatch(match) },
      { $group: { _id: monthGroupField, count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: { ym: monthGroupField, origin: '$origin.label' }, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Reservations').aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 }, pessoas: { $sum: '$partySize' } } },
    ]).toArray(),
  ]);

  const reservas = fillPeriodArray(byDay, indexByYmd);
  const sr = fillPeriodArray(seated, indexByYmd);
  const nr = fillPeriodArray(noshow, indexByYmd);
  const ar = fillPeriodArray(abertas, indexByYmd);
  const pessoasArr = fillPeriodArray(pessoas, indexByYmd);
  const srPes = fillPeriodArray(seatedPessoas, indexByYmd);
  const nrPes = fillPeriodArray(noshowPessoas, indexByYmd);
  const arPes = fillPeriodArray(abertasPessoas, indexByYmd);
  const nsr = reservas.map((t, i) => (t ? parseFloat(((nr[i] / t) * 100).toFixed(1)) : 0));
  const nsrConc = reservas.map((_, i) => {
    const concluded = sr[i] + nr[i];
    return concluded ? parseFloat(((nr[i] / concluded) * 100).toFixed(1)) : 0;
  });

  const porStatus = {};
  const porStatusPessoas = {};
  for (const row of statusRows) {
    porStatus[row._id || 'Unknown'] = row.count;
    porStatusPessoas[row._id || 'Unknown'] = row.pessoas || 0;
  }

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
    else if (cat === 'Manual') originMonth.t[idx] += row.count;
    else if (cat === 'Google') originMonth.g[idx] += row.count;
    else originMonth.c[idx] += row.count;
  }

  const { hora: horaArr, horaPessoas: horaPessoasArr } = fillHoraArrays(horaRows);

  return {
    byDay: reservas,
    seated: sr,
    noshow: nr,
    abertas: ar,
    pessoas: pessoasArr,
    seatedPessoas: srPes,
    noshowPessoas: nrPes,
    abertasPessoas: arPes,
    noshowRate: nsr,
    noshowRateConcluidas: nsrConc,
    porStatus,
    porStatusPessoas,
    origins: aggregateOrigins(origins),
    originsPessoas: aggregateOriginsPessoas(origins),
    originsDetail: aggregateDetailedOrigins(originsDetail),
    byMonth: fillMonthArray(byMonth, indexByYm),
    seatedMonth: fillMonthArray(seatedMonth, indexByYm),
    noshowMonth: fillMonthArray(noshowMonth, indexByYm),
    abertasMonth: fillMonthArray(abertasMonth, indexByYm),
    pessoasMonth: fillMonthArray(pessoasMonth, indexByYm),
    seatedMonthPessoas: fillMonthArray(seatedMonthPessoas, indexByYm),
    noshowMonthPessoas: fillMonthArray(noshowMonthPessoas, indexByYm),
    abertasMonthPessoas: fillMonthArray(abertasMonthPessoas, indexByYm),
    originMonth,
    total: reservas.reduce((a, b) => a + b, 0),
    pessoasTotal: pessoasArr.reduce((a, b) => a + b, 0),
    seatedPessoasTotal: srPes.reduce((a, b) => a + b, 0),
    noshowPessoasTotal: nrPes.reduce((a, b) => a + b, 0),
    abertasPessoasTotal: arPes.reduce((a, b) => a + b, 0),
    hora: horaArr,
    horaPessoas: horaPessoasArr,
    horaHeatmap: fillHoraHeatmap(horaHeatRows, indexByYmd),
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
    pessoasNoshow: emptyPeriodArray(dayCount),
    hora: Array(24).fill(0),
    horaHeatmap: emptyHoraHeatmap(),
    origins: {},
    originsPessoas: {},
    originsDetail: [],
    byMonth: emptyMonthArray(monthCount),
    seatedMonth: emptyMonthArray(monthCount),
    noshowMonth: emptyMonthArray(monthCount),
    pessoasMonth: emptyMonthArray(monthCount),
    seatedMonthPessoas: emptyMonthArray(monthCount),
    noshowMonthPessoas: emptyMonthArray(monthCount),
    tempoMonth: emptyMonthArray(monthCount),
    porStatus: {},
    porStatusPessoas: {},
    total: 0,
    pessoasTotal: 0,
    pessoasSeatedTotal: 0,
    pessoasNoshowTotal: 0,
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

  const [byDay, seated, noshow, tempo, hora, horaHeat, pessoas, pessoasSeated, pessoasNoshow, origins, originsDetail, byMonth, seatedMonth, noshowMonth, pessoasMonth, seatedMonthPessoas, noshowMonthPessoas, tempoMonth, statusRows] = await Promise.all([
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
      { $match: seatedMatch },
      { $addFields: { waitMin: waitMinutesExpr } },
      { $match: { waitMin: { $gt: 0, $lte: 720 } } },
      { $group: { _id: dateGroup('created_at'), avg: { $avg: '$waitMin' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: { $hour: { date: '$created_at', timezone: TZ } }, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: horaDowGroupCreatedAt, count: { $sum: 1 } } },
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
      { $match: noshowMatch },
      { $group: { _id: dateGroup('created_at'), count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: '$origin.label', count: { $sum: 1 }, pessoas: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: '$origin.label', count: { $sum: 1 }, pessoas: { $sum: '$partySize' } } },
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
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: monthGroupField, count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: seatedMatch },
      { $group: { _id: monthGroupField, count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: noshowMatch },
      { $group: { _id: monthGroupField, count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: seatedMatch },
      { $addFields: { waitMin: waitMinutesExpr } },
      { $match: { waitMin: { $gt: 0, $lte: 720 } } },
      { $group: { _id: monthGroupField, avg: { $avg: '$waitMin' } } },
    ]).toArray(),
    db.collection('Waitlists').aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 }, pessoas: { $sum: '$partySize' } } },
    ]).toArray(),
  ]);

  const porStatus = {};
  const porStatusPessoas = {};
  for (const row of statusRows) {
    porStatus[row._id || 'Unknown'] = row.count;
    porStatusPessoas[row._id || 'Unknown'] = row.pessoas || 0;
  }

  const horaArr = Array(24).fill(0);
  for (const row of hora) horaArr[row._id] = row.count;

  const tempoRows = tempo.map((r) => ({ _id: r._id, count: Math.round(r.avg || 0) }));
  const tempoMonthRows = tempoMonth.map((r) => ({ _id: r._id, count: Math.round(r.avg || 0) }));
  const pessoasArr = fillPeriodArray(pessoas, indexByYmd);
  const pessoasSeatedArr = fillPeriodArray(pessoasSeated, indexByYmd);
  const pessoasNoshowArr = fillPeriodArray(pessoasNoshow, indexByYmd);

  return {
    byDay: fillPeriodArray(byDay, indexByYmd),
    seated: fillPeriodArray(seated, indexByYmd),
    noshow: fillPeriodArray(noshow, indexByYmd),
    tempo: fillPeriodArray(tempoRows, indexByYmd, 'count'),
    pessoas: pessoasArr,
    pessoasSeated: pessoasSeatedArr,
    pessoasNoshow: pessoasNoshowArr,
    hora: horaArr,
    horaHeatmap: fillHoraHeatmap(horaHeat, indexByYmd),
    origins: aggregateWaitlistOrigins(origins),
    originsPessoas: aggregateWaitlistOriginsPessoas(origins),
    originsDetail: aggregateDetailedOrigins(originsDetail),
    byMonth: fillMonthArray(byMonth, indexByYm),
    seatedMonth: fillMonthArray(seatedMonth, indexByYm),
    noshowMonth: fillMonthArray(noshowMonth, indexByYm),
    pessoasMonth: fillMonthArray(pessoasMonth, indexByYm),
    seatedMonthPessoas: fillMonthArray(seatedMonthPessoas, indexByYm),
    noshowMonthPessoas: fillMonthArray(noshowMonthPessoas, indexByYm),
    tempoMonth: fillMonthArray(tempoMonthRows, indexByYm, 'count'),
    porStatus,
    porStatusPessoas,
    total: fillPeriodArray(byDay, indexByYmd).reduce((a, b) => a + b, 0),
    pessoasTotal: pessoasArr.reduce((a, b) => a + b, 0),
    pessoasSeatedTotal: pessoasSeatedArr.reduce((a, b) => a + b, 0),
    pessoasNoshowTotal: pessoasNoshowArr.reduce((a, b) => a + b, 0),
  };
}

async function aggregateWalkIns(db, venueIds, start, end, indexByYmd) {
  const dayCount = Object.keys(indexByYmd).length;
  const empty = {
    byDay: emptyPeriodArray(dayCount),
    pessoas: emptyPeriodArray(dayCount),
    hora: Array(24).fill(0),
    horaHeatmap: emptyHoraHeatmap(),
    total: 0,
    pessoasTotal: 0,
  };
  if (!venueIds.length) return empty;

  const match = walkInMatch(venueIds, start, end);

  const [byDay, pessoas, hora, horaHeat] = await Promise.all([
    db.collection('WalkIns').aggregate([
      { $match: match },
      { $group: { _id: dateGroup('created_at'), count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('WalkIns').aggregate([
      { $match: match },
      { $group: { _id: dateGroup('created_at'), count: { $sum: '$partySize' } } },
    ]).toArray(),
    db.collection('WalkIns').aggregate([
      { $match: match },
      { $group: { _id: { $hour: { date: '$created_at', timezone: TZ } }, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('WalkIns').aggregate([
      { $match: match },
      { $group: { _id: horaDowGroupCreatedAt, count: { $sum: 1 } } },
    ]).toArray(),
  ]);

  const byDayArr = fillPeriodArray(byDay, indexByYmd);
  const pessoasArr = fillPeriodArray(pessoas, indexByYmd);
  const horaArr = Array(24).fill(0);
  for (const row of hora) horaArr[row._id] = row.count;

  return {
    byDay: byDayArr,
    pessoas: pessoasArr,
    hora: horaArr,
    horaHeatmap: fillHoraHeatmap(horaHeat, indexByYmd),
    total: byDayArr.reduce((a, b) => a + b, 0),
    pessoasTotal: pessoasArr.reduce((a, b) => a + b, 0),
  };
}

async function buildVenueRanking(db, venues, start, end, pStart, pEnd, venueIds, resRecorrenteByVenue = {}) {
  const idSet = new Set(venueIds);
  const filtered = venues.filter((v) => idSet.has(v.id));
  const ids = filtered.map((v) => v.id);
  const wlSeatedExtra = { seatedAt: { $exists: true, $ne: null } };
  const wlNoshowExtra = {
    canceledAt: { $exists: true, $ne: null },
    $or: [{ seatedAt: { $exists: false } }, { seatedAt: null }],
  };
  const [
    res, resP, resPes, resPesP, wl, wlP, wlPes, wlPesP, tempoCur, tempoPrev,
    resSr, resAr, resNr, resSrPes, resArPes,
    wlSf, wlNf, wlSfPes,
    resSrP, resArP, resNrP, wlSfP, wlNfP,
  ] = await Promise.all([
    countByVenue(db, 'Reservations', ids, start, end, 'reservationDay'),
    countByVenue(db, 'Reservations', ids, pStart, pEnd, 'reservationDay'),
    countPessoasByVenue(db, 'Reservations', ids, start, end, 'reservationDay'),
    countPessoasByVenue(db, 'Reservations', ids, pStart, pEnd, 'reservationDay'),
    countByVenue(db, 'Waitlists', ids, start, end, 'created_at'),
    countByVenue(db, 'Waitlists', ids, pStart, pEnd, 'created_at'),
    countPessoasByVenue(db, 'Waitlists', ids, start, end, 'created_at'),
    countPessoasByVenue(db, 'Waitlists', ids, pStart, pEnd, 'created_at'),
    avgTempoByVenue(db, ids, start, end),
    avgTempoByVenue(db, ids, pStart, pEnd),
    countByVenueMatch(db, 'Reservations', ids, start, end, 'reservationDay', { status: RES_SEATED }),
    countByVenueMatch(db, 'Reservations', ids, start, end, 'reservationDay', { status: { $nin: [RES_SEATED, RES_NOSHOW] } }),
    countByVenueMatch(db, 'Reservations', ids, start, end, 'reservationDay', { status: RES_NOSHOW }),
    sumPessoasByVenueMatch(db, 'Reservations', ids, start, end, 'reservationDay', { status: RES_SEATED }),
    sumPessoasByVenueMatch(db, 'Reservations', ids, start, end, 'reservationDay', { status: { $nin: [RES_SEATED, RES_NOSHOW] } }),
    countByVenueMatch(db, 'Waitlists', ids, start, end, 'created_at', wlSeatedExtra),
    countByVenueMatch(db, 'Waitlists', ids, start, end, 'created_at', wlNoshowExtra),
    sumPessoasByVenueMatch(db, 'Waitlists', ids, start, end, 'created_at', wlSeatedExtra),
    countByVenueMatch(db, 'Reservations', ids, pStart, pEnd, 'reservationDay', { status: RES_SEATED }),
    countByVenueMatch(db, 'Reservations', ids, pStart, pEnd, 'reservationDay', { status: { $nin: [RES_SEATED, RES_NOSHOW] } }),
    countByVenueMatch(db, 'Reservations', ids, pStart, pEnd, 'reservationDay', { status: RES_NOSHOW }),
    countByVenueMatch(db, 'Waitlists', ids, pStart, pEnd, 'created_at', wlSeatedExtra),
    countByVenueMatch(db, 'Waitlists', ids, pStart, pEnd, 'created_at', wlNoshowExtra),
  ]);

  return filtered.map((venue) => {
    const id = venue.id;
    const resTotal = res[id] || 0;
    const filaTotal = wl[id] || 0;
    const sr = resSr[id] || 0;
    const ar = resAr[id] || 0;
    const nr = resNr[id] || 0;
    const sf = wlSf[id] || 0;
    const nf = wlNf[id] || 0;
    const srP = resSrP[id] || 0;
    const arP = resArP[id] || 0;
    const nrP = resNrP[id] || 0;
    const sfP = wlSfP[id] || 0;
    const nfP = wlNfP[id] || 0;
    const filaTotalP = wlP[id] || 0;
    const abertoFila = Math.max(0, filaTotal - sf - nf);
    const fluxoRes = sr + ar;
    const fluxoResP = srP + arP;
    const fluxoFila = sf + abertoFila;
    const rec = resRecorrenteByVenue[id] || { primeira: 0, recorrente: 0 };
    const recTotal = rec.primeira + rec.recorrente;
    const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);

    return {
      id,
      nome: venue.nome,
      grupo: venue.grupoLabel || null,
      res: resTotal,
      res_p: resP[id] || 0,
      res_pes: resPes[id] || 0,
      res_pes_p: resPesP[id] || 0,
      fila: filaTotal,
      fila_p: wlP[id] || 0,
      fila_pes: wlPes[id] || 0,
      fila_pes_p: wlPesP[id] || 0,
      tempo: tempoCur.tempo[id] || 0,
      tempo_p: tempoPrev.tempo[id] || 0,
      tempo_sf: tempoCur.seated[id] || 0,
      res_sr: sr,
      res_ar: ar,
      res_nr: nr,
      res_sr_pes: resSrPes[id] || 0,
      res_ar_pes: resArPes[id] || 0,
      fila_sf: sf,
      fila_nf: nf,
      fila_aberto: abertoFila,
      fila_sf_pes: wlSfPes[id] || 0,
      fluxo_res: fluxoRes,
      fluxo_fila: fluxoFila,
      taxa_ocupacao: pct(sr, fluxoRes),
      taxa_ocupacao_p: pct(srP, fluxoResP),
      taxa_noshow_res: pct(nr, sr + nr),
      taxa_noshow_res_p: pct(nrP, srP + nrP),
      taxa_atendimento_fila: pct(sf, filaTotal),
      taxa_atendimento_fila_p: pct(sfP, filaTotalP),
      taxa_noshow_fila: pct(nf, filaTotal),
      taxa_noshow_fila_p: pct(nfP, filaTotalP),
      pct_recorrente: pct(rec.recorrente, recTotal),
      recorrente: rec.recorrente,
      primeira: rec.primeira,
    };
  });
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
    if (!byVenue[vid]) byVenue[vid] = { Widget: 0, Manual: 0, Google: 0, Parceiros: 0 };
    const cat = mapOriginLabel(row._id.origin);
    byVenue[vid][cat] += row.count;
  }

  for (const venue of filtered) {
    const counts = byVenue[venue.id] || { Widget: 0, Manual: 0, Google: 0, Parceiros: 0 };
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

  const [res, resPrev, wl, wlPrev, wi, wiPrev, resFuturo, canal, resFirstMap, wlFirstMap] = await Promise.all([
    aggregateReservations(db, venueIds, start, end, indexByYmd, indexByYm),
    aggregateReservations(db, venueIds, pStart, pEnd, prevIndex, prevIndexYm),
    aggregateWaitlists(db, venueIds, start, end, indexByYmd, indexByYm),
    aggregateWaitlists(db, venueIds, pStart, pEnd, prevIndex, prevIndexYm),
    aggregateWalkIns(db, venueIds, start, end, indexByYmd),
    aggregateWalkIns(db, venueIds, pStart, pEnd, prevIndex),
    aggregateFutureReservations(db, venueIds),
    buildCanalPorVenue(db, venues, start, end, venueIds),
    buildFirstVisitMap(db, venueIds, 'Reservations', 'reservationDay', pStart, end),
    buildFirstVisitMap(db, venueIds, 'Waitlists', 'created_at', pStart, end),
  ]);

  const [clienteRes, clienteResPrev, clienteFila, clienteFilaPrev, resRecorrenteByVenue] = await Promise.all([
    aggregateCustomerType(db, venueIds, start, end, indexByYmd, 'Reservations', 'reservationDay', resFirstMap),
    aggregateCustomerType(db, venueIds, pStart, pEnd, prevIndex, 'Reservations', 'reservationDay', resFirstMap),
    aggregateCustomerType(db, venueIds, start, end, indexByYmd, 'Waitlists', 'created_at', wlFirstMap),
    aggregateCustomerType(db, venueIds, pStart, pEnd, prevIndex, 'Waitlists', 'created_at', wlFirstMap),
    aggregateCustomerTypeByVenue(db, venueIds, start, end, 'Reservations', 'reservationDay', resFirstMap),
  ]);

  const unidades = await buildVenueRanking(
    db, venues, start, end, pStart, pEnd, venueIds, resRecorrenteByVenue,
  );

  const resFluxoRes = res.seated.reduce((a, b) => a + b, 0) + res.abertas.reduce((a, b) => a + b, 0);
  const resFluxoPes = res.seatedPessoasTotal + res.abertasPessoasTotal;
  const filaSfTotal = wl.seated.reduce((a, b) => a + b, 0);
  const filaNfTotal = wl.noshow.reduce((a, b) => a + b, 0);
  const filaAbertoTotal = Math.max(0, wl.total - filaSfTotal - filaNfTotal);
  const filaFluxoRes = filaSfTotal + filaAbertoTotal;
  const filaAbertoPes = Math.max(0, wl.pessoasTotal - wl.pessoasSeatedTotal - wl.pessoasNoshowTotal);
  const filaFluxoPes = wl.pessoasSeatedTotal + filaAbertoPes;

  return {
    labels,
    dayCount,
    mesLabels,
    monthCount,
    reservas: res.byDay,
    res_p: resPrev.byDay,
    fila: wl.byDay,
    fil_p: wlPrev.byDay,
    walkin: wi.byDay,
    walkin_p: wiPrev.byDay,
    walkinPessoas: wi.pessoas,
    walkinPessoas_p: wiPrev.pessoas,
    walkin_hora: wi.hora,
    walkin_hor_p: wiPrev.hora,
    walkin_hora_heat: wi.horaHeatmap,
    resFuturo,
    sr: res.seated,
    sr_p: resPrev.seated,
    sr_pes: res.seatedPessoas,
    sr_pes_p: resPrev.seatedPessoas,
    nr: res.noshow,
    nr_p: resPrev.noshow,
    nr_pes: res.noshowPessoas,
    nr_pes_p: resPrev.noshowPessoas,
    ar: res.abertas,
    ar_p: resPrev.abertas,
    ar_pes: res.abertasPessoas,
    ar_pes_p: resPrev.abertasPessoas,
    sf: wl.seated,
    sf_p: wlPrev.seated,
    nf: wl.noshow,
    nf_p: wlPrev.noshow,
    nf_pes: wl.pessoasNoshow,
    nf_pes_p: wlPrev.pessoasNoshow,
    res_porStatus: res.porStatus,
    res_porStatus_p: resPrev.porStatus,
    res_porStatus_pes: res.porStatusPessoas,
    res_porStatus_pes_p: resPrev.porStatusPessoas,
    fila_porStatus: wl.porStatus,
    fila_porStatus_p: wlPrev.porStatus,
    fila_porStatus_pes: wl.porStatusPessoas,
    fila_porStatus_pes_p: wlPrev.porStatusPessoas,
    tempo: wl.tempo,
    tem_p: wlPrev.tempo,
    pessoas: res.pessoas,
    pes_p: resPrev.pessoas,
    filaPessoas: wl.pessoas,
    filaPessoas_p: wlPrev.pessoas,
    filaPessoasSentadas: wl.pessoasSeated,
    filaPessoasSentadas_p: wlPrev.pessoasSeated,
    filaPessoasNoshow: wl.pessoasNoshow,
    filaPessoasNoshow_p: wlPrev.pessoasNoshow,
    hora: wl.hora,
    hor_p: wlPrev.hora,
    hora_heat: wl.horaHeatmap,
    res_hora: res.hora,
    res_hor_p: resPrev.hora,
    res_hora_heat: res.horaHeatmap,
    res_hora_pessoas: res.horaPessoas,
    res_hora_pessoas_p: resPrev.horaPessoas,
    nsr: res.noshowRate,
    nsr_p: resPrev.noshowRate,
    nsr_conc: res.noshowRateConcluidas,
    nsr_conc_p: resPrev.noshowRateConcluidas,
    res_mes: res.byMonth,
    res_mes_p: resPrev.byMonth,
    res_mes_pessoas: res.pessoasMonth,
    res_mes_pessoas_p: resPrev.pessoasMonth,
    fila_mes: wl.byMonth,
    fila_mes_p: wlPrev.byMonth,
    fila_mes_pessoas: wl.pessoasMonth,
    fila_mes_pessoas_p: wlPrev.pessoasMonth,
    res_mes_sr: res.seatedMonth,
    res_mes_sr_pes: res.seatedMonthPessoas,
    res_mes_nr: res.noshowMonth,
    res_mes_nr_pes: res.noshowMonthPessoas,
    res_mes_ar: res.abertasMonth,
    res_mes_ar_pes: res.abertasMonthPessoas,
    fila_mes_sf: wl.seatedMonth,
    fila_mes_sf_pes: wl.seatedMonthPessoas,
    fila_mes_nf: wl.noshowMonth,
    fila_mes_nf_pes: wl.noshowMonthPessoas,
    fila_mes_tempo: wl.tempoMonth,
    fila_mes_tempo_p: wlPrev.tempoMonth,
    res_mes_origem: res.originMonth,
    unidades,
    origem: {
      labels: ORIGIN_LABELS,
      a: originsToPercent(res.origins),
      p: originsToPercent(resPrev.origins),
      counts: res.origins,
      countsPrev: resPrev.origins,
      pessoas: res.originsPessoas,
      pessoasPrev: resPrev.originsPessoas,
    },
    origemFila: {
      labels: WAITLIST_ORIGIN_LABELS,
      a: originsToPercent(wl.origins, WAITLIST_ORIGIN_LABELS),
      p: originsToPercent(wlPrev.origins, WAITLIST_ORIGIN_LABELS),
      counts: wl.origins,
      countsPrev: wlPrev.origins,
      pessoas: wl.originsPessoas,
      pessoasPrev: wlPrev.originsPessoas,
    },
    origemDetalhe: {
      reservas: res.originsDetail,
      fila: wl.originsDetail,
    },
    clienteRes: {
      primeira: clienteRes.primeira,
      recorrente: clienteRes.recorrente,
      primeiraPes: clienteRes.primeiraPes,
      recorrentePes: clienteRes.recorrentePes,
    },
    clienteRes_p: {
      primeira: clienteResPrev.primeira,
      recorrente: clienteResPrev.recorrente,
      primeiraPes: clienteResPrev.primeiraPes,
      recorrentePes: clienteResPrev.recorrentePes,
    },
    clienteFila: {
      primeira: clienteFila.primeira,
      recorrente: clienteFila.recorrente,
      primeiraPes: clienteFila.primeiraPes,
      recorrentePes: clienteFila.recorrentePes,
    },
    clienteFila_p: {
      primeira: clienteFilaPrev.primeira,
      recorrente: clienteFilaPrev.recorrente,
      primeiraPes: clienteFilaPrev.primeiraPes,
      recorrentePes: clienteFilaPrev.recorrentePes,
    },
    totais: {
      reservas: res.total,
      reservasPessoas: res.pessoasTotal,
      reservasSentadas: res.seated.reduce((a, b) => a + b, 0),
      reservasSentadasPessoas: res.seatedPessoasTotal,
      reservasNoshow: res.noshow.reduce((a, b) => a + b, 0),
      reservasNoshowPessoas: res.noshowPessoasTotal,
      reservasAbertas: res.abertas.reduce((a, b) => a + b, 0),
      reservasAbertasPessoas: res.abertasPessoasTotal,
      reservasFuturas: resFuturo.total,
      reservasFuturasPessoas: resFuturo.pessoasTotal,
      reservasPorStatus: res.porStatus,
      reservasPorStatusPessoas: res.porStatusPessoas,
      filaPorStatus: wl.porStatus,
      filaPorStatusPessoas: wl.porStatusPessoas,
      fila: wl.total,
      filaPessoas: wl.pessoasTotal,
      filaPessoasSentadas: wl.pessoasSeatedTotal,
      filaPessoasNoshow: wl.pessoasNoshowTotal,
      walkins: wi.total,
      walkinsPessoas: wi.pessoasTotal,
      clienteResPrimeira: clienteRes.totalPrimeira,
      clienteResRecorrente: clienteRes.totalRecorrente,
      clienteResPrimeiraPes: clienteRes.totalPrimeiraPes,
      clienteResRecorrentePes: clienteRes.totalRecorrentePes,
      clienteFilaPrimeira: clienteFila.totalPrimeira,
      clienteFilaRecorrente: clienteFila.totalRecorrente,
      clienteFilaPrimeiraPes: clienteFila.totalPrimeiraPes,
      clienteFilaRecorrentePes: clienteFila.totalRecorrentePes,
      fluxoTotal: {
        reservas: resFluxoRes,
        reservasPessoas: resFluxoPes,
        fila: filaFluxoRes,
        filaPessoas: filaFluxoPes,
        passantes: wi.total,
        passantesPessoas: wi.pessoasTotal,
        totalPessoas: resFluxoPes + filaFluxoPes + wi.pessoasTotal,
      },
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
  if (!venues.length) return 'Nenhuma loja';
  if (venues.length === 1) return venues[0].nome;
  if (venues.length <= 3) return venues.map((v) => v.nome).join(', ');
  return `${venues.length} lojas selecionadas`;
}

async function getDashboard(inicio, fim, venueIds = []) {
  const db = await connect();
  const ids = [...new Set((venueIds || []).filter(Boolean))];
  if (!ids.length) {
    throw new Error('Selecione ao menos uma loja.');
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
