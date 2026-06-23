const { getDashboard } = require('./dashboardService');
const { searchVenues, listAllVenueIds } = require('./venuesService');

async function resolveAdminVenueIds(venueIds, venueQ) {
  let ids = [...new Set((venueIds || []).filter(Boolean))];
  const q = String(venueQ || '').trim();

  if (q.length >= 2) {
    const found = await searchVenues(q, 500, null);
    const qIds = found.map((v) => v.id);
    if (ids.length) {
      const allowed = new Set(qIds);
      ids = ids.filter((id) => allowed.has(id));
    } else {
      ids = qIds;
    }
  }

  if (!ids.length) {
    ids = await listAllVenueIds();
  }

  return ids;
}

async function getAdminOriginsReport(inicio, fim, { venueIds = [], venueQ = '' } = {}) {
  const ids = await resolveAdminVenueIds(venueIds, venueQ);
  if (!ids.length) {
    const err = new Error('Nenhuma loja encontrada para os critérios informados.');
    err.status = 404;
    throw err;
  }

  const data = await getDashboard(inicio, fim, ids);

  return {
    meta: data.meta,
    periodo: data.periodo,
    periodoAnterior: data.periodoAnterior,
    origem: data.origem,
    origemFila: data.origemFila,
    origemDetalhe: data.origemDetalhe,
    totais: {
      reservas: data.totais?.reservas ?? 0,
      fila: data.totais?.fila ?? 0,
      reservasPessoas: data.totais?.reservasPessoas ?? 0,
      filaPessoas: data.totais?.filaPessoas ?? 0,
    },
    venueCount: ids.length,
    scope: ids.length === 1 ? 'single' : 'multi',
  };
}

module.exports = { getAdminOriginsReport, resolveAdminVenueIds };
