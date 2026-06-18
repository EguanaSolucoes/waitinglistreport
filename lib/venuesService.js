const { connect, toObjectIds } = require('./mongo');

const CACHE_TTL_MS = 5 * 60 * 1000;
let groupNodeCache = null;
let groupNodeCacheAt = 0;

function venueName(doc) {
  const n = doc?.name?.pt || doc?.shortName?.pt || doc?.slug || 'Sem nome';
  return String(n).trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadGroupNodeIds(db) {
  // Marca como grupo apenas venues referenciadas como parent por OUTRA unidade.
  // Muitas lojas legadas têm parent === _id (auto-referência) e não são marcas/grupos.
  const rows = await db.collection('Venues').aggregate([
    {
      $match: {
        parent: { $exists: true, $ne: null },
        $expr: { $ne: ['$_id', '$parent'] },
      },
    },
    { $group: { _id: '$parent' } },
  ]).toArray();
  return new Set(rows.map((row) => row._id.toString()));
}

async function getGroupNodeIds(db) {
  if (groupNodeCache && Date.now() - groupNodeCacheAt < CACHE_TTL_MS) return groupNodeCache;
  groupNodeCache = await loadGroupNodeIds(db);
  groupNodeCacheAt = Date.now();
  return groupNodeCache;
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

async function searchVenues(query, limit = 40) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const db = await connect();
  const groupNodeIds = await getGroupNodeIds(db);
  const cap = Math.min(Math.max(Number(limit) || 40, 1), 50);
  const regex = new RegExp(escapeRegex(q), 'i');

  const docs = await db.collection('Venues')
    .find({
      disabled: { $ne: true },
      parent: { $exists: true, $ne: null },
      $or: [
        { 'name.pt': regex },
        { 'shortName.pt': regex },
        { slug: regex },
        { search: regex },
      ],
    })
    .project({ 'name.pt': 1, 'shortName.pt': 1, slug: 1, parent: 1 })
    .limit(cap * 3)
    .toArray();

  const leaves = docs.filter((doc) => !groupNodeIds.has(doc._id.toString())).slice(0, cap);
  if (!leaves.length) return [];

  const parentIds = [...new Set(leaves.map((d) => d.parent?.toString()).filter(Boolean))];
  const parents = parentIds.length
    ? await db.collection('Venues')
      .find({ _id: { $in: toObjectIds(parentIds) } })
      .project({ 'name.pt': 1, 'shortName.pt': 1, slug: 1 })
      .toArray()
    : [];
  const parentLabels = Object.fromEntries(parents.map((p) => [p._id.toString(), venueName(p)]));

  return leaves
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

module.exports = {
  searchVenues,
  getVenuesByIds,
  resolveVenueIds,
  getVenueIds,
  getVenueGeoCentroid,
  venueName,
};
