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

const DETAILED_PARTNER_LABELS = [
  'BB Gastronomia',
  'Menu Bradesco',
  'Menu Personnalité (Itaú)',
  'LATAM',
  'Unicred',
  'Esfera',
  'PicPay',
  'Foodster',
  'Outros',
];

const DETAILED_PARTNER_MATCHERS = [
  { label: 'BB Gastronomia', patterns: ['bb gastronomia', 'bb_gastronomia', 'bbgastronomia'] },
  { label: 'Menu Bradesco', patterns: ['menu bradesco', 'bradesco'] },
  {
    label: 'Menu Personnalité (Itaú)',
    patterns: ['menu personnalite', 'menu personnalité', 'menuperson', 'personnalite', 'personnalité'],
  },
  { label: 'LATAM', patterns: ['latam'] },
  { label: 'Unicred', patterns: ['unicred'] },
  { label: 'Esfera', patterns: ['esfera'] },
  { label: 'PicPay', patterns: ['picpay', 'pic pay'] },
  { label: 'Foodster', patterns: ['foodster'] },
];

function normalizeOriginText(label = '') {
  return String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isNonPartnerChannel(label = '') {
  const l = normalizeOriginText(label);
  if (!l) return true;
  if (l.includes('widget') || l === 'reservation widget') return true;
  if (l.includes('phone') || l === 'telefone' || l === 'presencial' || l === 'manual') return true;
  if (l.includes('google')) return true;
  if (l === 'waitlist' || l.includes('fila nativa') || l === 'restaurant') return true;
  return false;
}

/** Mapeia origin.label bruto para parceiro canônico em Origens detalhado (null = canal, não parceiro). */
function mapDetailedPartnerLabel(label = '') {
  if (isNonPartnerChannel(label)) return null;
  const l = normalizeOriginText(label);
  for (const { label: partnerLabel, patterns } of DETAILED_PARTNER_MATCHERS) {
    if (patterns.some((p) => l.includes(p))) return partnerLabel;
  }
  return 'Outros';
}

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
  const byLabel = {};
  for (const row of rows) {
    if (!row._id) continue;
    const mapped = mapDetailedPartnerLabel(row._id);
    if (!mapped) continue;
    if (!byLabel[mapped]) {
      byLabel[mapped] = { label: mapped, count: 0, pessoas: 0 };
    }
    byLabel[mapped].count += row.count;
    byLabel[mapped].pessoas += row.pessoas || 0;
  }

  const entries = Object.values(byLabel).filter((e) => e.count > 0);
  entries.sort((a, b) => {
    if (a.label === 'Outros') return 1;
    if (b.label === 'Outros') return -1;
    return b.count - a.count;
  });

  const limited = entries.slice(0, limit);
  const total = limited.reduce((s, r) => s + r.count, 0) || 1;
  return limited.map((r) => ({
    label: r.label,
    count: r.count,
    pessoas: r.pessoas,
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
  mapDetailedPartnerLabel,
  DETAILED_PARTNER_LABELS,
  ORIGIN_LABELS,
  WAITLIST_ORIGIN_LABELS,
  originsToPercent,
  aggregateOrigins,
  aggregateWaitlistOrigins,
  aggregateDetailedOrigins,
  aggregateOriginsPessoas,
  aggregateWaitlistOriginsPessoas,
};
