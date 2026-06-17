/** Eventos de impacto em restaurantes (esportes, cultura, etc.) — curadoria manual. */
const EVENTS = [
  {
    date: '2026-06-11',
    name: 'Copa do Mundo 2026 — Abertura',
    type: 'evento',
    impact: 'positive',
    category: 'futebol',
    note: 'Início do torneio; maior audiência em bares e restaurantes.',
  },
  {
    date: '2026-06-13',
    name: 'Brasil × Marrocos (Copa 2026)',
    type: 'evento',
    impact: 'positive',
    category: 'futebol',
    note: 'Estreia da Seleção Brasileira no Grupo C.',
  },
  {
    date: '2026-06-19',
    name: 'Brasil × Haiti (Copa 2026)',
    type: 'evento',
    impact: 'positive',
    category: 'futebol',
    note: '2º jogo do Brasil na fase de grupos.',
  },
  {
    date: '2026-06-24',
    name: 'Escócia × Brasil (Copa 2026)',
    type: 'evento',
    impact: 'positive',
    category: 'futebol',
    note: '3º jogo do Brasil na fase de grupos.',
  },
  {
    date: '2026-07-04',
    name: 'Copa do Mundo 2026 — Oitavas de final',
    type: 'evento',
    impact: 'positive',
    category: 'futebol',
    note: 'Rodada eliminatória; possível jogo do Brasil.',
  },
  {
    date: '2026-07-19',
    name: 'Final da Copa do Mundo 2026',
    type: 'evento',
    impact: 'positive',
    category: 'futebol',
    note: 'Grande pico de público em estabelecimentos com transmissão.',
  },
  {
    date: '2026-02-16',
    name: 'Carnaval 2026 — Segunda-feira',
    type: 'evento',
    impact: 'mixed',
    category: 'cultura',
    note: 'Alta movimentação em algumas regiões; fechamentos em outras.',
  },
  {
    date: '2026-02-17',
    name: 'Carnaval 2026 — Terça-feira',
    type: 'evento',
    impact: 'mixed',
    category: 'cultura',
    note: 'Pico do feriado de Carnaval.',
  },
];

function getEventsBetween(startYmd, endYmd) {
  return EVENTS.filter((e) => e.date >= startYmd && e.date <= endYmd);
}

module.exports = { EVENTS, getEventsBetween };
