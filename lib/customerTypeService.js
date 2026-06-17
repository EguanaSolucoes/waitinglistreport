const { toObjectIds } = require('./mongo');
const { TZ } = require('./dates');

const venueMatch = (venueIds) => ({
  venue: { $in: toObjectIds(venueIds) },
});

const dateGroup = (field) => ({
  $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TZ },
});

function emptyPeriodArray(length) {
  return Array(length).fill(0);
}

function mapKey(customer, venue) {
  return `${customer.toString()}_${venue.toString()}`;
}

/**
 * Primeira visita do cliente na unidade (dia civil BRT).
 * Considera apenas clientes com ocorrência entre periodStart e periodEnd.
 */
async function buildFirstVisitMap(db, venueIds, collection, dateField, periodStart, periodEnd) {
  if (!venueIds.length) return new Map();

  const activeCustomers = await db.collection(collection).distinct('customer', {
    ...venueMatch(venueIds),
    [dateField]: { $gte: periodStart, $lt: periodEnd },
    customer: { $exists: true, $ne: null },
  });

  if (!activeCustomers.length) return new Map();

  const rows = await db.collection(collection).aggregate([
    {
      $match: {
        ...venueMatch(venueIds),
        customer: { $in: activeCustomers },
      },
    },
    {
      $group: {
        _id: { c: '$customer', v: '$venue' },
        firstYmd: { $min: dateGroup(dateField) },
      },
    },
  ], { allowDiskUse: true }).toArray();

  const map = new Map();
  for (const row of rows) {
    map.set(mapKey(row._id.c, row._id.v), row.firstYmd);
  }
  return map;
}

/**
 * Classifica cada ocorrência no período:
 * - primeira: dia da visita = primeiro dia do cliente na unidade
 * - recorrente: dia posterior ao primeiro dia na unidade (cliente corriqueiro)
 */
async function aggregateCustomerType(db, venueIds, start, end, indexByYmd, collection, dateField, firstMap) {
  const dayCount = Object.keys(indexByYmd).length;
  const empty = {
    primeira: emptyPeriodArray(dayCount),
    recorrente: emptyPeriodArray(dayCount),
    primeiraPes: emptyPeriodArray(dayCount),
    recorrentePes: emptyPeriodArray(dayCount),
    totalPrimeira: 0,
    totalRecorrente: 0,
    totalPrimeiraPes: 0,
    totalRecorrentePes: 0,
  };
  if (!venueIds.length) return empty;

  const primeira = emptyPeriodArray(dayCount);
  const recorrente = emptyPeriodArray(dayCount);
  const primeiraPes = emptyPeriodArray(dayCount);
  const recorrentePes = emptyPeriodArray(dayCount);

  const cursor = db.collection(collection).aggregate([
    {
      $match: {
        ...venueMatch(venueIds),
        [dateField]: { $gte: start, $lt: end },
        customer: { $exists: true, $ne: null },
      },
    },
    {
      $project: {
        customer: 1,
        venue: 1,
        partySize: 1,
        ymd: dateGroup(dateField),
      },
    },
  ]);

  for await (const doc of cursor) {
    const idx = indexByYmd[doc.ymd];
    if (idx === undefined) continue;
    const firstYmd = firstMap.get(mapKey(doc.customer, doc.venue));
    const pes = doc.partySize || 0;
    const isPrimeira = !firstYmd || doc.ymd === firstYmd;
    if (isPrimeira) {
      primeira[idx] += 1;
      primeiraPes[idx] += pes;
    } else {
      recorrente[idx] += 1;
      recorrentePes[idx] += pes;
    }
  }

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  return {
    primeira,
    recorrente,
    primeiraPes,
    recorrentePes,
    totalPrimeira: sum(primeira),
    totalRecorrente: sum(recorrente),
    totalPrimeiraPes: sum(primeiraPes),
    totalRecorrentePes: sum(recorrentePes),
  };
}

module.exports = {
  buildFirstVisitMap,
  aggregateCustomerType,
};
