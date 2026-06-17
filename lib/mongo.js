require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

let client;
let db;

async function connect() {
  if (db) return db;
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DATABASE || 'tagme');
  return db;
}

function toObjectIds(ids) {
  return ids.filter(Boolean).map((id) => new ObjectId(id));
}

module.exports = { connect, toObjectIds, getDb: () => db };
