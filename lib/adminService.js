const { ObjectId } = require('mongodb');
const { connect, toObjectIds } = require('./mongo');
const { getVenuesByIds, venueName, baseVenueQuery } = require('./venuesService');
const { mapUserProfile, getAllowedVenueIds } = require('./usersService');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function buildUserVenueRow(userDoc, venueIds) {
  const user = mapUserProfile(userDoc);
  const venues = venueIds.length ? await getVenuesByIds(venueIds) : [];
  return {
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    venueCount: venues.length,
    venueIds,
    venues: venues.map((v) => ({ id: v.id, nome: v.nome, grupoLabel: v.grupoLabel || null })),
  };
}

async function searchUsersWithVenues(query, limit = 40) {
  const q = String(query || '').trim();
  if (q.length < 2) return { items: [], total: 0, page: 1, hasMore: false };

  const db = await connect();
  const regex = new RegExp(escapeRegex(q), 'i');
  const cap = Math.min(Math.max(Number(limit) || 40, 1), 100);

  const docs = await db.collection('Users')
    .find({
      disabled: { $ne: true },
      $or: [
        { email: regex },
        { username: regex },
        { name: regex },
        { search: regex },
      ],
    })
    .project({ email: 1, username: 1, name: 1, role: 1 })
    .limit(cap)
    .toArray();

  const items = [];
  for (const doc of docs) {
    const venueIds = await getAllowedVenueIds(doc._id.toString());
    items.push(await buildUserVenueRow(doc, venueIds));
  }

  items.sort((a, b) => b.venueCount - a.venueCount || a.name.localeCompare(b.name, 'pt-BR'));
  return { items, total: items.length, page: 1, hasMore: false };
}

async function listUsersWithVenueAccess({ page = 1, limit = 50, venueQ = '' } = {}) {
  const db = await connect();
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const skip = (pageNum - 1) * cap;

  const venueMatch = baseVenueQuery({
    allowedUsers: { $exists: true, $ne: [] },
  });

  const vq = String(venueQ || '').trim();
  if (vq.length >= 2) {
    const regex = new RegExp(escapeRegex(vq), 'i');
    venueMatch.$or = [
      { 'name.pt': regex },
      { 'shortName.pt': regex },
      { slug: regex },
      { search: regex },
    ];
  }

  const rows = await db.collection('Venues').aggregate([
    { $match: venueMatch },
    { $unwind: '$allowedUsers' },
    { $group: { _id: '$allowedUsers', rawVenueIds: { $addToSet: '$_id' } } },
  ]).toArray();

  const ranked = rows
    .filter((row) => row._id)
    .map((row) => {
      const venueIds = row.rawVenueIds.map((id) => id.toString());
      return { userId: row._id.toString(), venueIds, venueCount: venueIds.length };
    })
    .filter((row) => row.venueCount > 0)
    .sort((a, b) => b.venueCount - a.venueCount || a.userId.localeCompare(b.userId));

  const total = ranked.length;
  const slice = ranked.slice(skip, skip + cap);
  if (!slice.length) {
    return { items: [], total, page: pageNum, hasMore: false };
  }

  const userDocs = await db.collection('Users')
    .find({
      _id: { $in: toObjectIds(slice.map((row) => row.userId)) },
      disabled: { $ne: true },
    })
    .project({ email: 1, username: 1, name: 1, role: 1 })
    .toArray();
  const userById = Object.fromEntries(userDocs.map((doc) => [doc._id.toString(), doc]));

  const allVenueIds = [...new Set(slice.flatMap((row) => row.venueIds))];
  const venueDocs = allVenueIds.length
    ? await db.collection('Venues')
      .find({ _id: { $in: toObjectIds(allVenueIds) } })
      .project({ 'name.pt': 1, 'shortName.pt': 1, slug: 1 })
      .toArray()
    : [];
  const venueNameById = Object.fromEntries(
    venueDocs.map((doc) => [doc._id.toString(), venueName(doc)]),
  );

  const items = slice
    .filter((row) => userById[row.userId])
    .map((row) => {
      const user = mapUserProfile(userById[row.userId]);
      const venues = row.venueIds
        .map((id) => ({ id, nome: venueNameById[id] || id }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        venueCount: venues.length,
        venueIds: row.venueIds,
        venues,
      };
    });

  return {
    items,
    total,
    page: pageNum,
    hasMore: skip + items.length < total,
  };
}

async function listUsersWithVenues({ q = '', venueQ = '', page = 1, limit = 50 } = {}) {
  const query = String(q || '').trim();
  if (query.length >= 2) return searchUsersWithVenues(query, limit);
  return listUsersWithVenueAccess({ page, limit, venueQ });
}

module.exports = {
  listUsersWithVenues,
  searchUsersWithVenues,
  listUsersWithVenueAccess,
};
