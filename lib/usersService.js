const { ObjectId } = require('mongodb');
const { connect } = require('./mongo');
const { baseVenueQuery } = require('./venuesService');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const db = await connect();
  const regex = new RegExp(`^${escapeRegex(normalized)}$`, 'i');
  return db.collection('Users').findOne({
    disabled: { $ne: true },
    $or: [{ email: regex }, { username: regex }],
  });
}

async function getAllowedVenueIds(userId) {
  if (!userId) return [];
  let uid;
  try {
    uid = new ObjectId(String(userId));
  } catch {
    return [];
  }

  const db = await connect();

  const docs = await db.collection('Venues')
    .find(baseVenueQuery({ allowedUsers: uid }))
    .project({ _id: 1 })
    .toArray();

  return docs.map((doc) => doc._id.toString());
}

function mapUserProfile(doc) {
  if (!doc) return null;
  return {
    userId: doc._id.toString(),
    email: normalizeEmail(doc.email || doc.username || ''),
    name: String(doc.name || doc.email || 'Usuário').trim(),
    role: doc.role || null,
  };
}

async function findUserById(userId) {
  if (!userId) return null;
  let oid;
  try {
    oid = new ObjectId(String(userId));
  } catch {
    return null;
  }
  const db = await connect();
  return db.collection('Users').findOne({
    _id: oid,
    disabled: { $ne: true },
  });
}

async function resolveUserSessionById(userId) {
  const user = await findUserById(userId);
  if (!user) return null;
  const profile = mapUserProfile(user);
  const venueIds = await getAllowedVenueIds(profile.userId);
  return { ...profile, venueIds };
}

async function resolveUserSession(email) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const profile = mapUserProfile(user);
  const venueIds = await getAllowedVenueIds(profile.userId);
  return { ...profile, venueIds };
}

module.exports = {
  findUserByEmail,
  findUserById,
  getAllowedVenueIds,
  mapUserProfile,
  resolveUserSession,
  resolveUserSessionById,
};
