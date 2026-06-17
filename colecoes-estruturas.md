# MongoDB `tagme` — Estruturas de Dados

Campos e tipos inferidos de **documentos reais** amostrados no cluster. Complementa [`colecoes.md`](./colecoes.md).

- **Database:** `tagme`
- **Exportado em:** 2026-06-16T22:38:13.837Z
- **Venue amostra Impettus:** `681cca16acba6866d6420b63`
- **Exemplos JSON completos:** [`colecoes-exemplos.json`](./colecoes-exemplos.json)

### Convenções

| Tipo | Significado |
|------|-------------|
| `ObjectId` | Referência MongoDB (24 hex) |
| `Date` | Data/hora UTC |
| `array<T>` | Lista de valores do tipo T |
| `object` | Subdocumento aninhado |

No JSON de exemplo: `{ "$oid": "..." }` = ObjectId; `{ "$date": "..." }` = Date.

---

## `Reservations`
> Usada no dashboard BI

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `confirmationPeriodStart` | Date | — | — |
| `created_at` | Date | — | Data de criação |
| `customer` | ObjectId | `Customers._id` | — |
| `google` | object | — | — |
| `google.wallet` | array<any> | — | — |
| `logs` | array<object> | — | — |
| `note` | string | — | — |
| `origin` | object | — | — |
| `origin.app` | ObjectId | — | — |
| `origin.label` | string | — | Canal de origem (Widget, Phone, Restaurant…) |
| `origin._id` | ObjectId | — | — |
| `partySize` | number | — | Número de pessoas |
| `paymentOrigin` | string | — | — |
| `preOrderedItems` | array<any> | — | — |
| `preOrderedItemsSnapshot` | array<any> | — | — |
| `redemptions` | array<any> | — | — |
| `reservationDay` | Date | — | Dia da reserva (agrupamento BI) |
| `reservationTime` | string | — | Horário da reserva |
| `rsvp` | boolean | — | — |
| `section` | ObjectId | — | — |
| `shoppingCart` | array<any> | — | — |
| `status` | string | — | Status operacional |
| `tags` | array<any> | — | — |
| `type` | string | — | Tipo de evento ou registro |
| `updated_at` | Date | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `voucher` | string | — | — |
| `rsvpEmailSentAt` | Date | — | — |
| `cancelReason` | string | — | — |
| `canceledAt` | Date | — | Data/hora de cancelamento |

Exemplo JSON: ver chave `collections.Reservations.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Waitlists`
> Usada no dashboard BI

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `arrivedAt` | Date | — | — |
| `basicCustomer` | object | — | — |
| `basicCustomer._id` | ObjectId | — | — |
| `basicCustomer.name` | string | — | — |
| `basicCustomer.lastName` | string | — | — |
| `basicCustomer.email` | string | — | — |
| `basicCustomer.phone` | string | — | — |
| `created_at` | Date | — | Data de criação |
| `customer` | ObjectId | `Customers._id` | — |
| `customerTags` | array<any> | — | — |
| `estimatedTime` | Date | — | — |
| `logs` | array<object> | — | — |
| `mode` | string | — | — |
| `origin` | object | — | — |
| `origin.label` | string | — | Canal de origem (Widget, Phone, Restaurant…) |
| `origin._id` | ObjectId | — | — |
| `partySize` | number | — | Número de pessoas |
| `redemptions` | array<any> | — | — |
| `status` | string | — | Status operacional |
| `updated_at` | Date | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `waitingTime` | number | — | Tempo de espera em minutos |
| `priority` | boolean | — | — |
| `attention` | boolean | — | — |
| `notifiedAt` | Date | — | — |
| `cancelReason` | string | — | — |
| `canceledAt` | Date | — | Data/hora de cancelamento |

Exemplo JSON: ver chave `collections.Waitlists.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `WalkIns`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `created_at` | Date | — | Data de criação |
| `customer` | ObjectId | `Customers._id` | — |
| `note` | string | — | — |
| `origin` | object | — | — |
| `origin.label` | string | — | Canal de origem (Widget, Phone, Restaurant…) |
| `partySize` | number | — | Número de pessoas |
| `redemptions` | array<any> | — | — |
| `seatedAt` | Date | — | Data/hora em que sentou |
| `updated_at` | Date | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |

Exemplo JSON: ver chave `collections.WalkIns.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Venues`
> Usada no dashboard BI

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `allowedUsers` | array<ObjectId> | — | — |
| `benefits` | array<object> | — | — |
| `channels` | array<ObjectId> | — | — |
| `created_at` | Date | — | Data de criação |
| `disabled` | boolean | — | — |
| `emailUnsubscribe` | array<any> | — | — |
| `enableGoogleIndexing` | boolean | — | — |
| `features` | array<object> | — | — |
| `focalPoints` | array<ObjectId> | — | — |
| `has` | object | — | — |
| `has.bradesco` | boolean | — | — |
| `has.digitalMenu` | boolean | — | — |
| `has.itau` | boolean | — | — |
| `has.reservation` | boolean | — | — |
| `has.waitlist` | boolean | — | — |
| `has.newWaitlist` | boolean | — | — |
| `has.walkIn` | boolean | — | — |
| `has.widgetMenu` | boolean | — | — |
| `has.payment` | boolean | — | — |
| `has.brasilSaborSp` | boolean | — | — |
| `has.festivalDeLaTapa` | boolean | — | — |
| `has.tastingMenu` | boolean | — | — |
| `has.settimanaItaliana` | boolean | — | — |
| `integrations` | array<any> | — | — |
| `liveMenuPro` | boolean | — | — |
| `location` | array<number> | — | — |
| `log` | array<object> | — | — |
| `loyaltySettings` | object | — | — |
| `loyaltySettings.prizes` | array<any> | — | — |
| `menu` | array<ObjectId> | — | — |
| `msisdnUnsubscribe` | array<any> | — | — |
| `name` | object | — | — |
| `name.pt` | string | — | — |
| `name.en` | string | — | — |
| `name.fr` | string | — | — |
| `name.es` | string | — | — |
| `operationHours` | array<object> | — | — |
| `permissions` | object | — | — |
| `permissions.waitlist` | array<any> | — | — |
| `phone` | array<object> | — | — |
| `search` | array<string> | — | — |
| `slug` | string | — | Identificador textual único |
| `staff` | array<any> | — | — |
| `tags` | array<any> | — | — |
| `updated_at` | Date | — | — |
| `address` | ObjectId | — | — |
| `cnpj` | string | — | — |
| `descript` | object | — | — |
| `descript.pt` | string | — | — |
| `descript.en` | string | — | — |
| `descript.fr` | string | — | — |
| `descript.es` | string | — | — |
| `email` | string | — | — |
| `googleId` | null | — | — |
| `hiredServices` | object | — | — |
| `hiredServices.bradesco` | boolean | — | — |
| `hiredServices.digitalMenu` | boolean | — | — |
| `hiredServices.itau` | boolean | — | — |
| `hiredServices.reservation` | boolean | — | — |
| `hiredServices.waitlist` | boolean | — | — |
| `hiredServices.widgetMenu` | boolean | — | — |
| `hiredServices.brasilSaborSp` | boolean | — | — |
| `hiredServices.festivalDeLaTapa` | boolean | — | — |
| `hiredServices.settimanaItaliana` | boolean | — | — |
| `hiredServices.loginJourney` | boolean | — | — |
| `images` | object | — | — |
| `michelinId` | null | — | — |
| `priceRange` | number | — | — |
| `serviceTax` | number | — | — |
| `shortName` | object | — | — |
| `shortName.pt` | string | — | — |
| `shortName.en` | string | — | — |
| `shortName.fr` | string | — | — |
| `shortName.es` | string | — | — |
| `site` | null | — | — |
| `socialAnalytics` | object | — | — |
| `socialAnalytics.googleAnalytics` | null | — | — |
| `socialAnalytics.googleGTM` | null | — | — |

Exemplo JSON: ver chave `collections.Venues.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Logs`
> Views LiveMenu (legado)

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `origin` | string | — | — |
| `type` | string | — | Tipo de evento ou registro |
| `user` | ObjectId | `Users._id` | — |
| `device` | string | — | — |
| `location` | array<number> | — | — |
| `details` | object | — | — |
| `details.page` | string | — | — |
| `created_at` | Date | — | Data de criação |
| `__v` | number | — | — |

Exemplo JSON: ver chave `collections.Logs.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `LiveMenu`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `pro` | boolean | — | — |
| `settings` | object | — | — |
| `settings.callWaiter` | boolean | — | — |
| `settings.driveThru` | boolean | — | — |
| `settings.pdvIntegration` | boolean | — | — |
| `__v` | number | — | — |
| `created_at` | Date | — | Data de criação |
| `updated_at` | Date | — | — |

Exemplo JSON: ver chave `collections.LiveMenu.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Customers`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `name` | string | — | — |
| `lastName` | string | — | — |
| `phone` | string | — | — |
| `email` | string | — | — |
| `created_at` | Date | — | Data de criação |
| `verificationCodes` | array<any> | — | — |
| `disabled` | boolean | — | — |
| `search` | array<any> | — | — |
| `macAddress` | array<any> | — | — |
| `venues` | array<ObjectId> | — | — |
| `updated_at` | Date | — | — |

Exemplo JSON: ver chave `collections.Customers.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Users`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `updated_at` | Date | — | — |
| `disabled` | boolean | — | — |
| `email` | string | — | — |
| `avatarUrl` | string | — | — |
| `password` | string | — | — |
| `username` | string | — | — |
| `name` | string | — | — |
| `created_at` | Date | — | Data de criação |
| `details` | object | — | — |
| `details.gender` | string | — | — |
| `details.backingId` | string | — | — |
| `details.originalCreatedAt` | Date | — | — |
| `details.emailVerified` | boolean | — | — |
| `role` | string | — | — |
| `__v` | number | — | — |
| `search` | array<string> | — | — |

Exemplo JSON: ver chave `collections.Users.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `ProductUserTrackEvent`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `productUserId` | string | `ProductUsersUM._id` | — |
| `eventType` | string | — | — |
| `eventBody` | object | — | — |
| `eventBody.firstName` | string | — | — |
| `eventBody.lastName` | string | — | — |
| `eventBody.phone` | string | — | — |
| `eventBody.email` | string | — | — |
| `eventBody.birthday` | string | — | — |
| `eventBody.productName` | string | — | — |
| `deleted` | boolean | — | — |
| `createdAt` | Date | — | — |
| `updatedAt` | Date | — | — |
| `__v` | number | — | — |

Exemplo JSON: ver chave `collections.ProductUserTrackEvent.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `ProductUsersUM`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `enabled` | boolean | — | — |
| `firstName` | string | — | — |
| `lastName` | string | — | — |
| `email` | object | — | — |
| `email.contact` | string | — | — |
| `email.validated` | boolean | — | — |
| `email.createdAt` | Date | — | — |
| `email.updatedAt` | Date | — | — |
| `phone` | object | — | — |
| `phone.contact` | string | — | — |
| `phone.validated` | boolean | — | — |
| `phone.createdAt` | Date | — | — |
| `phone.updatedAt` | Date | — | — |
| `productName` | string | — | — |
| `deleted` | boolean | — | — |
| `createdAt` | Date | — | — |
| `updatedAt` | Date | — | — |
| `__v` | number | — | — |
| `gender` | string | — | — |
| `birthdate` | Date | — | — |

Exemplo JSON: ver chave `collections.ProductUsersUM.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Menus`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `updated_at` | Date | — | — |
| `slug` | string | — | Identificador textual único |
| `backingId` | string | — | — |
| `created_at` | Date | — | Data de criação |
| `currency` | string | — | — |
| `descript` | object | — | — |
| `descript.es` | string | — | — |
| `descript.fr` | string | — | — |
| `descript.en` | string | — | — |
| `descript.pt` | string | — | — |
| `name` | object | — | — |
| `name.es` | string | — | — |
| `name.fr` | string | — | — |
| `name.en` | string | — | — |
| `name.pt` | string | — | — |
| `__v` | number | — | — |
| `contentType` | string | — | — |
| `venues` | array<ObjectId> | — | — |
| `type` | string | — | Tipo de evento ou registro |

Exemplo JSON: ver chave `collections.Menus.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `MenuItems`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `updated_at` | Date | — | — |
| `slug` | string | — | Identificador textual único |
| `backingId` | string | — | — |
| `disabled` | boolean | — | — |
| `price` | number | — | — |
| `product` | ObjectId | — | — |
| `type` | string | — | Tipo de evento ou registro |
| `details` | object | — | — |
| `details.quantity` | number | — | — |
| `details.priceFix` | array<string> | — | — |
| `productPairing` | array<any> | — | — |
| `featurePairing` | array<any> | — | — |
| `tags` | array<any> | — | — |
| `created_at` | Date | — | Data de criação |
| `descript` | object | — | — |
| `descript.es` | string | — | — |
| `descript.fr` | string | — | — |
| `descript.en` | string | — | — |
| `descript.pt` | string | — | — |
| `name` | object | — | — |
| `name.es` | string | — | — |
| `name.fr` | string | — | — |
| `name.en` | string | — | — |
| `name.pt` | string | — | — |
| `__v` | number | — | — |
| `options` | array<object> | — | — |
| `owner` | ObjectId | — | — |
| `menuOrder` | null | — | — |

Exemplo JSON: ver chave `collections.MenuItems.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Orders`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `created_at` | Date | — | Data de criação |
| `customer` | ObjectId | `Customers._id` | — |
| `logs` | array<object> | — | — |
| `payments` | array<ObjectId> | — | — |
| `receivedAt` | Date | — | — |
| `shipping` | object | — | — |
| `shipping.priceInCents` | number | — | — |
| `shipping.vendor` | object | — | — |
| `shipping.vendor.name` | string | — | — |
| `shipping.address` | object | — | — |
| `shipping.address._id` | ObjectId | — | — |
| `shipping.address.zip` | string | — | — |
| `shipping.address.address1` | string | — | — |
| `shipping.address.number` | string | — | — |
| `shipping.address.address2` | string | — | — |
| `shipping.address.reference` | string | — | — |
| `shipping.address.neighborhood` | string | — | — |
| `shipping.address.city` | string | — | — |
| `shipping.address.state` | string | — | — |
| `shipping.address.country` | string | — | — |
| `shipping.pricingType` | string | — | — |
| `shoppingCart` | object | — | — |
| `shoppingCart.priceInCents` | number | — | — |
| `shoppingCart.items` | array<object> | — | — |
| `status` | string | — | Status operacional |
| `type` | string | — | Tipo de evento ou registro |
| `updated_at` | Date | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `acceptedAt` | Date | — | — |
| `outForDeliveryAt` | Date | — | — |
| `deliveredAt` | Date | — | — |

Exemplo JSON: ver chave `collections.Orders.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Payments`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `reservation` | ObjectId | `Reservations._id` | — |
| `updated_at` | Date | — | — |
| `billValue` | number | — | — |
| `status` | string | — | Status operacional |
| `__v` | number | — | — |
| `orders` | array<any> | — | — |
| `redePayEvents` | array<any> | — | — |
| `created_at` | Date | — | Data de criação |

Exemplo JSON: ver chave `collections.Payments.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Notifications`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `customer` | ObjectId | `Customers._id` | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `status` | string | — | Status operacional |
| `sentAt` | Date | — | — |
| `type` | string | — | Tipo de evento ou registro |
| `response` | object | — | — |
| `response.statusMessage` | string | — | — |
| `response.statusCode` | number | — | — |
| `data` | object | — | Payload do relatório (estrutura variável) |
| `reservation` | ObjectId | `Reservations._id` | — |
| `created_at` | Date | — | Data de criação |
| `updated_at` | Date | — | — |
| `__v` | number | — | — |

Exemplo JSON: ver chave `collections.Notifications.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Channels`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `created_at` | Date | — | Data de criação |
| `dateRanges` | array<object> | — | — |
| `slug` | string | — | Identificador textual único |
| `label` | string | — | — |
| `updated_at` | Date | — | — |

Exemplo JSON: ver chave `collections.Channels.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Vouchers`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `voucher` | string | — | — |
| `__v` | number | — | — |
| `endDate` | Date | — | — |
| `exceptHolidays` | boolean | — | — |
| `exceptWeekends` | boolean | — | — |
| `logs` | array<object> | — | — |
| `name` | string | — | — |
| `origin` | string | — | — |
| `prize` | object | — | — |
| `prize.name` | object | — | — |
| `prize.name.pt` | string | — | — |
| `prize.description` | object | — | — |
| `prize.description.pt` | string | — | — |
| `prize.conditions` | string | — | — |
| `prize.type` | string | — | Tipo de evento ou registro |
| `prize.value` | number | — | — |
| `prize.quantity` | number | — | — |
| `repeatAmount` | number | — | — |
| `updated_at` | Date | — | — |
| `useCount` | number | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `startDate` | Date | — | — |

Exemplo JSON: ver chave `collections.Vouchers.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Redemptions`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `created_at` | Date | — | Data de criação |
| `statusDate` | Date | — | — |
| `status` | string | — | Status operacional |
| `quantity` | number | — | — |
| `voucher` | string | — | — |
| `customer` | object | — | — |
| `customer.phone` | string | — | — |
| `customer.email` | string | — | — |
| `customer.name` | string | — | — |
| `idGoPoints` | string | — | — |
| `segment` | string | — | — |
| `prize` | ObjectId | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `updated_at` | Date | — | — |
| `environment` | string | — | — |

Exemplo JSON: ver chave `collections.Redemptions.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `WaitlistSettings`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `averageTimes` | array<object> | — | — |
| `basicCustomerInput` | boolean | — | — |
| `clockMode` | string | — | — |
| `created_at` | Date | — | Data de criação |
| `customerTabs` | object | — | — |
| `customerTabs.enabled` | boolean | — | — |
| `customerTagGroups` | array<any> | — | — |
| `delayTolerance` | number | — | — |
| `disabled` | boolean | — | — |
| `disabledBradesco` | boolean | — | — |
| `disabledSmsSendingByDefault` | boolean | — | — |
| `hiddenCustomerPosition` | boolean | — | — |
| `hostessClockMode` | string | — | — |
| `logs` | array<object> | — | — |
| `maxWaitingTime` | number | — | — |
| `mode` | string | — | — |
| `operationMode` | string | — | — |
| `partySizes` | array<object> | — | — |
| `sections` | array<any> | — | — |
| `supervisoryPassword` | object | — | — |
| `supervisoryPassword.enabled` | boolean | — | — |
| `updated_at` | Date | — | — |
| `useCustomerTags` | boolean | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `partySizesWidget` | object | — | — |
| `partySizesWidget.min` | number | — | — |
| `partySizesWidget.max` | number | — | — |
| `partySizesWidget._id` | ObjectId | — | — |

Exemplo JSON: ver chave `collections.WaitlistSettings.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `ReservationStatus`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `reservationDay` | string | — | Dia da reserva (agrupamento BI) |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `__v` | number | — | — |
| `created_at` | Date | — | Data de criação |
| `minReservationAntecedence` | number | — | — |
| `reservationAntecedence` | number | — | — |
| `sections` | array<object> | — | — |
| `updated_at` | Date | — | — |

Exemplo JSON: ver chave `collections.ReservationStatus.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `ReservationSeats`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `updated_at` | Date | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `reservationAntecedence` | number | — | — |
| `minReservationAntecedence` | number | — | — |
| `delayTolerance` | number | — | — |
| `reservationInterval` | number | — | — |
| `rsvpAntecedence` | number | — | — |
| `created_at` | Date | — | Data de criação |
| `disabled` | boolean | — | — |
| `disabledAutoRsvpEmailing` | boolean | — | — |
| `venueSections` | array<object> | — | — |
| `sectionSchedules` | array<object> | — | — |
| `bookingApps` | array<object> | — | — |
| `hiddenNoteEmailsSentToCustomer` | boolean | — | — |
| `__v` | number | — | — |

Exemplo JSON: ver chave `collections.ReservationSeats.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `ReservationsDashboardDays`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `__v` | number | — | — |
| `created_at` | Date | — | Data de criação |
| `reservationDay` | string | — | Dia da reserva (agrupamento BI) |
| `sections` | array<object> | — | — |
| `updated_at` | Date | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |

Exemplo JSON: ver chave `collections.ReservationsDashboardDays.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `AvailabilitiesDay`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `day` | Date | — | — |
| `origin` | object | — | — |
| `origin.label` | string | — | Canal de origem (Widget, Phone, Restaurant…) |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `__v` | number | — | — |
| `availability` | object | — | — |
| `availability.availabilities` | array<object> | — | — |
| `availability.noShowFeeConfig` | object | — | — |
| `availability.noShowFeeConfig.maxCancellationTimeDay` | string | — | — |
| `availability.noShowFeeConfig.maxCancellationTime` | string | — | — |
| `availability.widgetGroupReservations` | object | — | — |
| `availability.widgetGroupReservations.enabled` | boolean | — | — |
| `availability.details` | string | — | — |
| `availability.app` | string | — | — |
| `availability.delayTolerance` | number | — | — |
| `availability.maxDaysAntecedence` | number | — | — |
| `availability.minAntecedence` | number | — | — |
| `availability.available` | boolean | — | — |
| `availability.serverTime` | string | — | — |
| `created_at` | Date | — | Data de criação |
| `updated_at` | Date | — | — |

Exemplo JSON: ver chave `collections.AvailabilitiesDay.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Reports`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `date_begin` | Date | — | — |
| `date_end` | Date | — | — |
| `name` | string | — | — |
| `origin` | string | — | — |
| `updated_at` | Date | — | — |
| `data` | object | — | Payload do relatório (estrutura variável) |
| `__v` | number | — | — |
| `created_at` | Date | — | Data de criação |

Exemplo JSON: ver chave `collections.Reports.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `CrmDashboards`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `user` | ObjectId | `Users._id` | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `__v` | number | — | — |
| `endDate` | Date | — | — |
| `selected` | array<ObjectId> | — | — |
| `startDate` | Date | — | — |

Exemplo JSON: ver chave `collections.CrmDashboards.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `Apps`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `created_at` | Date | — | Data de criação |
| `label` | string | — | — |
| `venue` | ObjectId | `Venues._id` | Unidade / restaurante |
| `switches` | object | — | — |
| `switches.hiddenMenuItemsPrices` | boolean | — | — |
| `switches.hasReservations` | boolean | — | — |
| `switches.hasWaitlist` | boolean | — | — |
| `switches.hiddenDisabledMenuItems` | boolean | — | — |
| `switches.hiddenMenuItemsDetails` | boolean | — | — |
| `switches.hiddenMenuItemsReviews` | boolean | — | — |
| `style` | object | — | — |
| `style.logoUrl` | string | — | — |
| `mobileCovers` | array<object> | — | — |
| `siteCovers` | array<object> | — | — |
| `mosaicTitle` | object | — | — |
| `mosaicTitle.title` | string | — | — |
| `mosaicTitle.subtitle` | string | — | — |
| `mosaicButtons` | array<object> | — | — |
| `__v` | number | — | — |
| `updated_at` | Date | — | — |

Exemplo JSON: ver chave `collections.Apps.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `bi_reservation_venue`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `loyaltySettings` | number | — | — |
| `nom_restaurante` | string | — | — |
| `venue_id` | ObjectId | — | — |
| `origin` | object | — | — |
| `origin.label` | string | — | Canal de origem (Widget, Phone, Restaurant…) |
| `reservationDay` | Date | — | Dia da reserva (agrupamento BI) |
| `reservationTime` | Date | — | Horário da reserva |
| `status` | string | — | Status operacional |
| `updated_at` | Date | — | — |
| `turno` | string | — | — |

Exemplo JSON: ver chave `collections.bi_reservation_venue.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `bi_waitlist_venue`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `loyaltySettings` | number | — | — |
| `nom_restaurante` | string | — | — |
| `venue_id` | ObjectId | — | — |
| `arrivedAt` | string | — | — |
| `created_at` | Date | — | Data de criação |
| `status` | string | — | Status operacional |
| `updated_at` | Date | — | — |
| `time` | Date | — | — |
| `turno` | string | — | — |

Exemplo JSON: ver chave `collections.bi_waitlist_venue.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `bi_walkIns_venue`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `loyaltySettings` | number | — | — |
| `nom_restaurante` | string | — | — |
| `venue_id` | ObjectId | — | — |
| `seatedAt` | string | — | Data/hora em que sentou |
| `updated_at` | Date | — | — |
| `time` | Date | — | — |
| `turno` | string | — | — |

Exemplo JSON: ver chave `collections.bi_walkIns_venue.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `bi_reservationStatus_venue`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `loyaltySettings` | number | — | — |
| `nom_restaurante` | string | — | — |
| `venue_id` | ObjectId | — | — |
| `schedules` | array<object> | — | — |
| `reservationDay` | string | — | Dia da reserva (agrupamento BI) |
| `updated_at` | Date | — | — |

Exemplo JSON: ver chave `collections.bi_reservationStatus_venue.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `bi_venues`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `venue_id` | ObjectId | — | — |
| `created_at` | Date | — | Data de criação |
| `loyaltySettings` | number | — | — |
| `nom_restaurante` | string | — | — |
| `updated_at` | Date | — | — |

Exemplo JSON: ver chave `collections.bi_venues.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `bi_customer_venue`

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `_id` | ObjectId | — | Chave primária |
| `loyaltyActiveEvents` | array<object> | — | — |
| `venue_id` | ObjectId | — | — |
| `name` | string | — | — |
| `created_at` | Date | — | Data de criação |
| `updated_at` | Date | — | — |
| `customer_id` | ObjectId | — | — |
| `loyaltySettings` | object | — | — |
| `loyaltySettings.eventsQtyToRedeem` | number | — | — |
| `nom_restaurante` | string | — | — |

Exemplo JSON: ver chave `collections.bi_customer_venue.example` em [colecoes-exemplos.json](./colecoes-exemplos.json).

---

## `NewWaitlists`

*Coleção vazia (0 documentos). Sem amostra no cluster.*

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| — | — | — | Não utilizada |

---

## `WaitlistsCMPArrived`

Subconjunto de filas com chegada confirmada (CMP). Estrutura análoga a `Waitlists`.

| Campo | Tipo | Referência | Uso BI |
|-------|------|------------|--------|
| `venue` | ObjectId | `Venues._id` | Unidade |
| `created_at` | Date | — | Entrada na fila |
| `arrivedAt` | Date | — | Chegada confirmada |
| `seatedAt` | Date | — | Sentado |
| `canceledAt` | Date | — | Cancelado |
| `partySize` | number | — | Pessoas |
| `customer` | ObjectId | `Customers._id` | Cliente |
| `basicCustomer` | object | — | Dados mínimos do cliente |
| `origin.label` | string | — | Origem |
| `status` | string | — | Status operacional |

*Sem amostra Impettus no export; campos baseados em coleções irmãs.*

---


*Gerado por `node scripts/export-schemas.js` — reexporte após mudanças no MongoDB.*