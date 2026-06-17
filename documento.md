# Impettus BI — Reservas & Fila de Espera

Documentação do projeto que conecta o dashboard `dashboard_restaurante_bi.html` ao MongoDB da Tagme (cluster `tagmeprodnew6.wjrdk.mongodb.net`, database `tagme`).

---

## Visão geral

| Camada | Tecnologia | Função |
|--------|------------|--------|
| Frontend | HTML + Vue 3 + Axios + Chart.js (CDN) | Dashboard interativo com filtros de período e unidade |
| Backend | Node.js + Express | API REST que agrega dados do MongoDB |
| Dados | MongoDB Atlas (`tagme`) | Reservas, filas, logs de pageview |

### Como executar

```bash
cd /apps/2026/relatorioswhitelist
npm install
npm start          # sobe API na porta 3847 (ou PORT do .env)
```

- **API:** http://localhost:3847/api/dashboard
- **Dashboard:** http://localhost:3847/dashboard_restaurante_bi.html

### Variáveis de ambiente (`.env`)

| Variável | Descrição |
|----------|-----------|
| `MONGODB_URI` | Connection string MongoDB Atlas |
| `MONGODB_DATABASE` | Nome do database (`tagme`) |
| `PORT` | Porta do servidor (padrão: `3847`) |

---

## Arquitetura

```
┌─────────────────────────────┐
│  dashboard_restaurante_bi   │
│  Vue 3 + Axios + Chart.js   │
└──────────────┬──────────────┘
               │ GET /api/dashboard?inicio=&fim=&unidade=
               ▼
┌─────────────────────────────┐
│  server.js (Express)        │
│  lib/dashboardService.js    │
└──────────────┬──────────────┘
               │ aggregations
               ▼
┌─────────────────────────────┐
│  MongoDB tagme              │
│  Reservations, Waitlists,   │
│  Logs, Venues               │
└─────────────────────────────┘
```

---

## Coleções MongoDB utilizadas

### `Reservations` (~17M documentos)

Fonte principal de **reservas**.

| Campo | Uso no dashboard |
|-------|------------------|
| `venue` | Filtro por unidade (ObjectId) |
| `reservationDay` | Agrupamento por dia da semana |
| `partySize` | Total de pessoas |
| `status` | `Seated` → sentados; `Canceled` → no-show |
| `origin.label` | Canal de origem (Widget, Phone, Google…) |
| `seatedAt` / `canceledAt` | Confirmação de status |

**Status observados:** `Seated`, `Canceled`, `New`, `Confirmed`, `Overbook`, `Pending`.

**Origens frequentes:** `Reservation Widget`, `Phone`, `whatsapp`, `Bradesco`, `google`.

### `Waitlists` (~35M documentos)

Fonte principal da **fila de espera**.

| Campo | Uso no dashboard |
|-------|------------------|
| `venue` | Filtro por unidade |
| `created_at` | Data/hora de entrada na fila |
| `partySize` | Tamanho do grupo |
| `seatedAt` | Cliente sentado (atendido) |
| `canceledAt` | Cancelamento / desistência |
| `waitingTime` | Tempo de espera em minutos |
| `status` | `green`, `red`, `orange` (cor operacional) |
| `cancelReason` | Motivo do cancelamento |

**Regras de negócio aplicadas:**
- **Sentado (fila):** `seatedAt` preenchido
- **No-show (fila):** `canceledAt` preenchido e sem `seatedAt`
- **Tempo médio:** média de `waitingTime` onde houve `seatedAt`

### `Logs`

Fonte de **views LiveMenu** (`type: 'pageView'`).

| Campo | Uso |
|-------|-----|
| `venue` | Unidade |
| `type` | Filtrar `pageView` |
| `created_at` | Período |
| `origin` | Ex.: `Menu Personnalite` |

> **Nota:** Para as unidades Impettus monitoradas, não há registros recentes de `pageView` em `Logs`. O gráfico de views pode aparecer zerado até que o tracking seja reativado ou outra fonte seja integrada.

### `Venues`

Cadastro de restaurantes. Usado para mapear nomes → `_id`.

### Coleções BI legadas (não usadas diretamente)

| Coleção | Observação |
|---------|------------|
| `bi_reservation_venue` | View denormalizada; dados antigos (~2016–2022) |
| `bi_waitlist_venue` | Idem |
| `bi_venues` | Catálogo de venues para BI legado |
| `NewWaitlists` | Vazia (0 documentos) |
| `ReservationsDashboardDays` | Configuração de seções por dia, não métricas |

---

## Mapeamento de unidades Impettus → Venues

| Filtro dashboard | Nome | Venue IDs (`Venues._id`) |
|------------------|------|--------------------------|
| `mane` | Mané | `681cca16…` Copacabana, `681a3f85…` Niterói, `681a08bd…` Macaé, `681cca2e…` Búzios |
| `dheaven` | D'Heaven | `5fa16a98…` D'Heaven, `68d1ac0d…` D'Heaven São Paulo |
| `moma` | Moma Osteria | `62600ec3…` Itaim, `62601dab…` Pinheiros, `66b6276a…` Jardins |
| `ciatc` | CIATC | **Não encontrado** no MongoDB |
| `todas` | Toda a Rede | União de todas as unidades acima |

Configuração em `lib/units.js`.

---

## API REST

### `GET /api/health`

Retorna `{ ok: true, ts }`.

### `GET /api/unidades`

Lista unidades disponíveis para o filtro.

### `GET /api/venues`

Lista as venues da rede Impettus (coleção `Venues`), agrupadas por marca:

```json
{
  "venues": [{ "id": "...", "nome": "Mané Copacabana", "grupo": "mane", "grupoLabel": "Mané" }],
  "grupos": [{ "id": "mane", "label": "Mané", "venues": [...] }]
}
```

### `GET /api/dashboard?inicio=2026-06-01&fim=2026-06-16&venue=62600ec3b6a45b0012602f61`

Parâmetros:
- `inicio`: data inicial `YYYY-MM-DD` (inclusiva)
- `fim`: data final `YYYY-MM-DD` (inclusiva)
- `venue`: ID da venue (`Venues._id`). Omitir = **toda a rede** (9 venues)

Se `inicio`/`fim` omitidos, usa os **últimos 7 dias**. Período máximo: **90 dias**.

O comparativo "anterior" usa um período de **mesma duração** imediatamente antes de `inicio`.

Resposta (estrutura compatível com o dashboard original):

```json
{
  "labels": ["01/06", "02/06"],
  "dayCount": 16,
  "reservas": [],
  "res_p": [],
  "fila": [],
  "fil_p": [],
  "views": [],
  "vie_p": [],
  "sr": [],
  "sr_p": [],
  "nr": [],
  "nr_p": [],
  "sf": [],
  "sf_p": [],
  "nf": [],
  "tempo": [],
  "tem_p": [],
  "pessoas": [],
  "pes_p": [],
  "hora": [],
  "hor_p": [],
  "nsr": [],
  "nsr_p": [],
  "unidades": [
    { "nome": "Mané", "res": 0, "res_p": 0, "fila": 0, "fila_p": 0, "views": 0, "views_p": 0 }
  ],
  "origem": { "labels": ["Widget","Telefone","Google","Parceiros"], "a": [], "p": [] },
  "canal": { "labels": [], "w": [], "t": [], "g": [], "c": [] },
  "meta": { "inicio": "2026-06-01", "fim": "2026-06-16", "unidade": "todas", "fonte": "MongoDB tagme", "atualizadoEm": "..." }
}
```

`labels` = eixo X dos gráficos diários (dd/mm). Arrays têm `dayCount` posições (uma por dia do período).
`hora` / `hor_p` = 24 posições (0h–23h).

---

## Mapeamento de canais (origem)

| Canal dashboard | Labels MongoDB (`origin.label`) |
|-----------------|--------------------------------|
| Widget | `Reservation Widget`, `Widget` |
| Telefone | `Phone`, `presencial`, `telefone` |
| Google | contém `google` |
| Parceiros | Demais (Bradesco, whatsapp, instagram…) |

Implementado em `lib/origins.js`.

---

## Estrutura de arquivos

```
relatorioswhitelist/
├── .env                      # Credenciais MongoDB (não versionar)
├── .gitignore
├── documento.md              # Este arquivo
├── dashboard_restaurante_bi.html
├── server.js                 # Entry point Express
├── package.json
└── lib/
    ├── mongo.js              # Conexão MongoDB
    ├── units.js              # Mapeamento unidades → venue IDs
    ├── dates.js              # Semanas e timezone BRT
    ├── origins.js            # Agrupamento de canais
    └── dashboardService.js   # Agregações e montagem do payload
```

---

## Indicadores do dashboard × origem dos dados

| Indicador / gráfico | Coleção | Lógica |
|---------------------|---------|--------|
| Total Reservas | `Reservations` | Count por `reservationDay` |
| Sentados (reserva) | `Reservations` | `status === 'Seated'` |
| No-Show (reserva) | `Reservations` | `status === 'Canceled'` |
| Taxa No-Show % | calculado | `nr / reservas * 100` |
| Fila de Espera | `Waitlists` | Count por `created_at` |
| Sentados (fila) | `Waitlists` | `seatedAt` presente |
| No-Show (fila) | `Waitlists` | `canceledAt` sem `seatedAt` |
| Tempo médio fila | `Waitlists` | `avg(waitingTime)` com `seatedAt` |
| Pico por hora | `Waitlists` | Count por hora de `created_at` |
| Views LiveMenu | `Logs` | `type === 'pageView'` |
| Origem das reservas | `Reservations` | `origin.label` agrupado |
| Canal por unidade | `Reservations` | Origem % por venue group |
| Ranking unidades | ambas | Totais período vs período anterior |

---

## Limitações conhecidas

1. **CIATC** — restaurante referenciado no dashboard mock, mas sem venue correspondente no MongoDB. Retorna zeros até cadastro.
2. **Views LiveMenu** — coleção `Logs` sem `pageView` recente para unidades Impettus; gráfico pode ficar vazio.
3. **Performance** — `Waitlists` tem ~35M docs; agregações usam índices em `venue` + data quando disponíveis. Semanas isoladas são aceitáveis (~2–5s).
4. **No-show reservas** — usa `Canceled` como proxy; reservas `New`/`Confirmed` não comparecidas não entram como no-show.
5. **Mané fila** — poucos waitlists recentes nas unidades Mané (maior volume em reservas).

---

## Próximos passos sugeridos

- [ ] Cadastrar venue CIATC e adicionar ID em `lib/units.js`
- [ ] Criar índices compostos: `{ venue: 1, reservationDay: 1 }`, `{ venue: 1, created_at: 1 }`
- [ ] Integrar fonte alternativa de views (ex.: analytics LiveMenu)
- [ ] Cache Redis para agregações semanais
- [ ] Autenticação no dashboard (JWT / sessão gestor)

---

*Gerado em 16/06/2026 — projeto relatorioswhitelist*
