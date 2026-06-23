const { connect, toObjectIds } = require('./mongo');

function venueName(doc) {
  const n = doc?.name?.pt || doc?.shortName?.pt || doc?.slug || 'Sem nome';
  return String(n).trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function baseVenueQuery(extra = {}) {
  return { disabled: { $ne: true }, ...extra };
}

function mapVenueDoc(doc, parentLabels = {}) {
  const id = doc._id.toString();
  const parentId = doc.parent?.toString() || null;
  return {
    id,
    nome: venueName(doc),
    shortName: doc?.shortName?.pt?.trim() || null,
    slug: doc?.slug || null,
    parentId,
    grupoLabel: parentId ? (parentLabels[parentId] || null) : null,
  };
}

async function searchVenues(query, limit = 40, allowedVenueIds = null) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const db = await connect();
  const cap = Math.min(Math.max(Number(limit) || 40, 1), 50);
  const regex = new RegExp(escapeRegex(q), 'i');
  const allowedSet = allowedVenueIds == null ? null : new Set(allowedVenueIds);

  const docs = await db.collection('Venues')
    .find(baseVenueQuery({
      $or: [
        { 'name.pt': regex },
        { 'name.en': regex },
        { 'shortName.pt': regex },
        { 'shortName.en': regex },
        { slug: regex },
        { search: regex },
      ],
    }))
    .project({ 'name.pt': 1, 'shortName.pt': 1, slug: 1, parent: 1 })
    .limit(cap * 8)
    .toArray();

  let venues = docs;
  if (allowedSet) venues = venues.filter((doc) => allowedSet.has(doc._id.toString()));
  venues = venues.slice(0, cap);
  if (!venues.length) return [];

  const parentIds = [...new Set(venues.map((d) => d.parent?.toString()).filter(Boolean))];
  const parents = parentIds.length
    ? await db.collection('Venues')
      .find({ _id: { $in: toObjectIds(parentIds) } })
      .project({ 'name.pt': 1, 'shortName.pt': 1, slug: 1 })
      .toArray()
    : [];
  const parentLabels = Object.fromEntries(parents.map((p) => [p._id.toString(), venueName(p)]));

  return venues
    .map((doc) => mapVenueDoc(doc, parentLabels))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function getVenuesByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return [];

  const db = await connect();
  const docs = await db.collection('Venues')
    .find({ _id: { $in: toObjectIds(unique) } })
    .project({ 'name.pt': 1, 'shortName.pt': 1, slug: 1, parent: 1 })
    .toArray();

  const parentIds = [...new Set(docs.map((d) => d.parent?.toString()).filter(Boolean))];
  const parents = parentIds.length
    ? await db.collection('Venues')
      .find({ _id: { $in: toObjectIds(parentIds) } })
      .project({ 'name.pt': 1, 'shortName.pt': 1, slug: 1 })
      .toArray()
    : [];
  const parentLabels = Object.fromEntries(parents.map((p) => [p._id.toString(), venueName(p)]));

  const byId = Object.fromEntries(docs.map((d) => [d._id.toString(), mapVenueDoc(d, parentLabels)]));
  return unique.map((id) => byId[id]).filter(Boolean);
}

async function resolveVenueIds(venueIds) {
  return [...new Set((venueIds || []).filter(Boolean))];
}

async function getVenueIds(venueIds) {
  return resolveVenueIds(venueIds);
}

async function listAllVenueIds() {
  const db = await connect();
  const docs = await db.collection('Venues')
    .find(baseVenueQuery())
    .project({ _id: 1 })
    .toArray();
  return docs.map((d) => d._id.toString());
}

async function getVenueGeoCentroid(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return null;

  const db = await connect();
  const docs = await db.collection('Venues')
    .find({ _id: { $in: toObjectIds(unique) } })
    .project({ location: 1 })
    .toArray();

  const points = docs
    .map((d) => d.location)
    .filter((loc) => Array.isArray(loc) && loc.length >= 2 && loc[0] != null && loc[1] != null)
    .map((loc) => ({ lon: loc[0], lat: loc[1] }));

  if (!points.length) return null;

  const sum = points.reduce((a, p) => ({ lat: a.lat + p.lat, lon: a.lon + p.lon }), { lat: 0, lon: 0 });
  return {
    lat: sum.lat / points.length,
    lon: sum.lon / points.length,
    venueCount: points.length,
    totalVenues: unique.length,
  };
}

async function getVenuesWithGeo(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return [];

  const venues = await getVenuesByIds(unique);
  const db = await connect();
  const docs = await db.collection('Venues')
    .find({ _id: { $in: toObjectIds(unique) } })
    .project({ location: 1 })
    .toArray();
  const locById = Object.fromEntries(docs.map((d) => [d._id.toString(), d.location]));

  return venues.map((v) => {
    const loc = locById[v.id];
    const hasGeo = Array.isArray(loc) && loc.length >= 2 && loc[0] != null && loc[1] != null;
    return {
      ...v,
      lon: hasGeo ? loc[0] : null,
      lat: hasGeo ? loc[1] : null,
      hasGeo,
    };
  });
}

module.exports = {
  searchVenues,
  getVenuesByIds,
  getVenuesWithGeo,
  resolveVenueIds,
  getVenueIds,
  listAllVenueIds,
  getVenueGeoCentroid,
  baseVenueQuery,
  venueName,
};
