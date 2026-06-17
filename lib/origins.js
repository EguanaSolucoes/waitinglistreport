/** Agrupa origin.label das reservas nos 4 canais do dashboard */
function mapOriginLabel(label = '') {
  const l = (label || '').toLowerCase();
  if (l.includes('widget') || l === 'widget') return 'Widget';
  if (l.includes('phone') || l === 'telefone' || l === 'presencial') return 'Manual';
  if (l.includes('google')) return 'Google';
  return 'Parceiros';
}

/** Rótulo exibido na UI (Phone, telefone, presencial → Manual) */
function displayOriginLabel(label = '') {
  const l = (label || '').toLowerCase();
  if (l.includes('phone') || l === 'telefone' || l === 'presencial') return 'Manual';
  return label || 'Sem origem';
}

/** Origens da fila conforme documento BI (Waitlist / Widget / Google) */
function mapWaitlistOrigin(label = '') {
  const l = (label || '').toLowerCase();
  if (l.includes('widget')) return 'Widget';
  if (l.includes('google')) return 'Google';
  return 'Waitlist';
}

const ORIGIN_LABELS = ['Widget', 'Manual', 'Google', 'Parceiros'];
const WAITLIST_ORIGIN_LABELS = ['Waitlist', 'Widget', 'Google'];

function originsToPercent(counts, labels = ORIGIN_LABELS) {
  const total = labels.reduce((s, k) => s + (counts[k] || 0), 0) || 1;
  return labels.map((k) => Math.round(((counts[k] || 0) / total) * 100));
}

function aggregateOrigins(rows) {
  const counts = { Widget: 0, Manual: 0, Google: 0, Parceiros: 0 };
  for (const row of rows) {
    const cat = mapOriginLabel(row._id);
    counts[cat] += row.count;
  }
  return counts;
}

function aggregateWaitlistOrigins(rows) {
  const counts = { Waitlist: 0, Widget: 0, Google: 0 };
  for (const row of rows) {
    const cat = mapWaitlistOrigin(row._id);
    counts[cat] += row.count;
  }
  return counts;
}

function aggregateDetailedOrigins(rows, limit = 15) {
  const sorted = [...rows]
    .filter((r) => r._id)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  const total = sorted.reduce((s, r) => s + r.count, 0) || 1;
  return sorted.map((r) => ({
    label: displayOriginLabel(r._id),
    count: r.count,
    pessoas: r.pessoas || 0,
    pct: Math.round((r.count / total) * 100),
  }));
}

function aggregateOriginsPessoas(rows) {
  const counts = { Widget: 0, Manual: 0, Google: 0, Parceiros: 0 };
  for (const row of rows) {
    const cat = mapOriginLabel(row._id);
    counts[cat] += row.pessoas || 0;
  }
  return counts;
}

function aggregateWaitlistOriginsPessoas(rows) {
  const counts = { Waitlist: 0, Widget: 0, Google: 0 };
  for (const row of rows) {
    const cat = mapWaitlistOrigin(row._id);
    counts[cat] += row.pessoas || 0;
  }
  return counts;
}

module.exports = {
  mapOriginLabel,
  displayOriginLabel,
  mapWaitlistOrigin,
  ORIGIN_LABELS,
  WAITLIST_ORIGIN_LABELS,
  originsToPercent,
  aggregateOrigins,
  aggregateWaitlistOrigins,
  aggregateDetailedOrigins,
  aggregateOriginsPessoas,
  aggregateWaitlistOriginsPessoas,
};
