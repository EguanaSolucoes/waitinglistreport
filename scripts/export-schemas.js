#!/usr/bin/env node
/**
 * Exporta estrutura de campos + exemplo JSON por coleção.
 * Uso: node scripts/export-schemas.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { connect, toObjectIds } = require('../lib/mongo');
const { searchVenues } = require('../lib/venuesService');

const OUT_JSON = path.join(__dirname, '..', 'colecoes-exemplos.json');
const OUT_MD = path.join(__dirname, '..', 'colecoes-estruturas.md');

function typeOf(v) {
  if (v == null) return 'null';
  if (Array.isArray(v)) {
    const inner = v.length ? typeOf(v[0]) : 'any';
    return `array<${inner}>`;
  }
  if (v instanceof Date) return 'Date';
  if (v && v._bsontype === 'ObjectId') return 'ObjectId';
  if (typeof v === 'object') return 'object';
  return typeof v;
}

function flattenSchema(obj, prefix = '', depth = 0, maxDepth = 2, maxFields = 80) {
  const rows = [];
  if (!obj || typeof obj !== 'object' || obj instanceof Date || obj._bsontype === 'ObjectId') {
    return rows;
  }
  if (rows.length >= maxFields) return rows;
  for (const [k, v] of Object.entries(obj)) {
    if (rows.length >= maxFields) break;
    const fieldPath = prefix ? `${prefix}.${k}` : k;
    if (k === '_id' && !prefix) {
      rows.push({ field: '_id', type: 'ObjectId', ref: null, bi: 'Chave primária' });
      continue;
    }
    // Relatórios materializados: não expandir blob data
    if (fieldPath === 'data' || fieldPath.startsWith('data.')) {
      rows.push({ field: fieldPath, type: typeOf(v), ref: null, bi: 'Payload do relatório (estrutura variável)' });
      continue;
    }
    const t = typeOf(v);
    const ref = inferRef(fieldPath, t);
    if (t === 'object' && depth < maxDepth) {
      rows.push({ field: fieldPath, type: 'object', ref, bi: describeField(fieldPath) });
      rows.push(...flattenSchema(v, fieldPath, depth + 1, maxDepth, maxFields - rows.length));
    } else {
      rows.push({ field: fieldPath, type: t, ref, bi: describeField(fieldPath) });
    }
  }
  return rows;
}

function inferRef(fieldPath, type) {
  if (type !== 'ObjectId' && !fieldPath.endsWith('Id')) return null;
  const map = {
    venue: 'Venues._id',
    customer: 'Customers._id',
    user: 'Users._id',
    menu: 'Menus._id',
    reservation: 'Reservations._id',
    voucher: 'Vouchers._id',
    productUserId: 'ProductUsersUM._id',
    venueId: 'Venues._id (string hex)',
  };
  const last = fieldPath.split('.').pop();
  return map[last] || null;
}

function describeField(fieldPath) {
  const d = {
    venue: 'Unidade / restaurante',
    'origin.label': 'Canal de origem (Widget, Phone, Restaurant…)',
    reservationDay: 'Dia da reserva (agrupamento BI)',
    reservationTime: 'Horário da reserva',
    partySize: 'Número de pessoas',
    status: 'Status operacional',
    created_at: 'Data de criação',
    seatedAt: 'Data/hora em que sentou',
    canceledAt: 'Data/hora de cancelamento',
    waitingTime: 'Tempo de espera em minutos',
    type: 'Tipo de evento ou registro',
    slug: 'Identificador textual único',
  };
  return d[fieldPath] || d[fieldPath.split('.').pop()] || null;
}

function sanitize(doc, maxChars = 12000) {
  const json = JSON.stringify(
    doc,
    (k, v) => {
      if (v && v._bsontype === 'ObjectId') return { $oid: String(v) };
      if (v instanceof Date) return { $date: v.toISOString() };
      return v;
    },
    2,
  );
  if (json.length <= maxChars) return JSON.parse(json);
  return {
    _truncated: true,
    _sizeChars: json.length,
    _note: 'Exemplo completo omitido por tamanho; ver campos em colecoes-estruturas.md',
  };
}

const IMPETTUS_IDS = []; // preenchido em main()

function buildCollections(OIDS, V0) {
  const LIVE_MENU_VENUE = IMPETTUS_IDS.find((id) => id.startsWith('62600')) || IMPETTUS_IDS[0] || V0;
  return [
    { name: 'Reservations', filter: { venue: V0 }, hint: 'Usada no dashboard BI' },
    { name: 'Waitlists', filter: { venue: V0 }, hint: 'Usada no dashboard BI' },
    { name: 'WalkIns', filter: { venue: { $in: OIDS } } },
    { name: 'Venues', filter: { _id: V0 }, hint: 'Usada no dashboard BI' },
    { name: 'Logs', filter: { type: 'pageView' }, hint: 'Views LiveMenu (legado)' },
    { name: 'LiveMenu', filter: { venue: toObjectIds([LIVE_MENU_VENUE])[0] } },
    { name: 'Customers', filter: {} },
    { name: 'Users', filter: {} },
    { name: 'ProductUserTrackEvent', filter: {} },
    { name: 'ProductUsersUM', filter: {} },
    { name: 'Menus', filter: {} },
    { name: 'MenuItems', filter: {} },
    { name: 'Orders', filter: {} },
    { name: 'Payments', filter: {} },
    { name: 'Notifications', filter: {} },
    { name: 'Channels', filter: {} },
    { name: 'Vouchers', filter: {} },
    { name: 'Redemptions', filter: {} },
    { name: 'WaitlistSettings', filter: { venue: V0 } },
    { name: 'ReservationStatus', filter: { venue: V0 } },
    { name: 'ReservationSeats', filter: {} },
    { name: 'ReservationsDashboardDays', filter: { venue: { $in: OIDS } } },
    { name: 'AvailabilitiesDay', filter: {} },
    { name: 'Reports', filter: {} },
    { name: 'CrmDashboards', filter: { venue: { $in: OIDS } } },
    { name: 'bi_reservation_venue', filter: {} },
    { name: 'bi_waitlist_venue', filter: {} },
    { name: 'bi_venues', filter: {} },
    { name: 'bi_walkIns_venue', filter: {} },
    { name: 'bi_reservationStatus_venue', filter: {} },
    { name: 'bi_customer_venue', filter: {} },
    { name: 'Apps', filter: {} },
    { name: 'NewWaitlists', filter: {} },
    { name: 'WaitlistsCMPArrived', filter: { venue: V0 } },
  ];
}

async function main() {
  const venues = await searchVenues('Mané', 20);
  if (!venues.length) throw new Error('Nenhuma venue encontrada para exportação de schemas.');
  const ids = venues.map((v) => v.id);
  IMPETTUS_IDS.push(...ids);
  const OIDS = toObjectIds(ids);
  const V0 = OIDS[0];
  const COLLECTIONS = buildCollections(OIDS, V0);
  const db = await connect();
  const exportedAt = new Date().toISOString();
  const meta = {
    database: process.env.MONGODB_DATABASE || 'tagme',
    exportedAt,
    impettusVenueSample: String(V0),
    note: 'ObjectId em JSON aparece como { "$oid": "..." }. Date como { "$date": "..." }.',
  };
  const collections = {};

  for (const spec of COLLECTIONS) {
    const { name, filter, hint } = spec;
    try {
      const doc = await db.collection(name).findOne(filter, { maxTimeMS: 25000 });
      if (!doc) {
        collections[name] = { found: false, hint: hint || null };
        console.log(`skip ${name}`);
        continue;
      }
      collections[name] = {
        found: true,
        hint: hint || null,
        fields: flattenSchema(doc),
        example: sanitize(doc),
      };
      console.log(`ok ${name} (${collections[name].fields.length} campos)`);
    } catch (err) {
      collections[name] = { found: false, error: err.message, hint: hint || null };
      console.log(`err ${name}: ${err.message}`);
    }
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify({ meta, collections }, null, 2));
  fs.writeFileSync(OUT_MD, buildMarkdown({ meta, collections }));
  console.log(`\n→ ${OUT_JSON}`);
  console.log(`→ ${OUT_MD}`);
}

function buildMarkdown({ meta, collections }) {
  const lines = [
    '# MongoDB `tagme` — Estruturas de Dados',
    '',
    'Campos e tipos inferidos de **documentos reais** amostrados no cluster. Complementa [`colecoes.md`](./colecoes.md).',
    '',
    `- **Database:** \`${meta.database}\``,
    `- **Exportado em:** ${meta.exportedAt}`,
    `- **Venue amostra Impettus:** \`${meta.impettusVenueSample}\``,
    `- **Exemplos JSON completos:** [\`colecoes-exemplos.json\`](./colecoes-exemplos.json)`,
    '',
    '### Convenções',
    '',
    '| Tipo | Significado |',
    '|------|-------------|',
    '| `ObjectId` | Referência MongoDB (24 hex) |',
    '| `Date` | Data/hora UTC |',
    '| `array<T>` | Lista de valores do tipo T |',
    '| `object` | Subdocumento aninhado |',
    '',
    'No JSON de exemplo: `{ "$oid": "..." }` = ObjectId; `{ "$date": "..." }` = Date.',
    '',
    '---',
    '',
  ];

  const order = [
  'Reservations', 'Waitlists', 'WalkIns', 'Venues', 'Logs', 'LiveMenu',
  'Customers', 'Users', 'ProductUserTrackEvent', 'ProductUsersUM',
  'Menus', 'MenuItems', 'Orders', 'Payments', 'Notifications',
  'Channels', 'Vouchers', 'Redemptions',
  'WaitlistSettings', 'ReservationStatus', 'ReservationSeats', 'ReservationsDashboardDays', 'AvailabilitiesDay',
  'Reports', 'CrmDashboards', 'Apps',
  'bi_reservation_venue', 'bi_waitlist_venue', 'bi_walkIns_venue', 'bi_reservationStatus_venue', 'bi_venues', 'bi_customer_venue',
  'NewWaitlists', 'WaitlistsCMPArrived',
  ];

  for (const name of order) {
    const c = collections[name];
    if (!c) continue;
    lines.push(`## \`${name}\``);
    if (c.hint) lines.push(`> ${c.hint}`);
  if (!c.found) {
      lines.push('', c.error ? `*Sem amostra: ${c.error}*` : '*Sem documento encontrado com o filtro usado.*', '', '---', '');
      continue;
    }
    lines.push('', '| Campo | Tipo | Referência | Uso BI |', '|-------|------|------------|--------|');
    for (const f of c.fields) {
      lines.push(`| \`${f.field}\` | ${f.type} | ${f.ref ? `\`${f.ref}\`` : '—'} | ${f.bi || '—'} |`);
    }
    lines.push('', `Exemplo JSON: ver chave \`collections.${name}.example\` em [colecoes-exemplos.json](./colecoes-exemplos.json).`, '', '---', '');
  }

  lines.push('', '*Gerado por `node scripts/export-schemas.js`*');
  return lines.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
