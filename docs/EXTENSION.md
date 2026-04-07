# Chrome Extension Plan & Progress

**Nombre:** EsriDevs Social Activity  
**Tipo:** Manifest V3 (Chrome, Firefox, Edge)  
**Ubicación en repo:** `/extension/`  
**Issue de referencia:** [#9](https://github.com/hhkaos/esridevs-social-activity/issues/9)

## Decisiones de arquitectura

| Decisión | Opción elegida | Motivo |
|----------|---------------|--------|
| Fuente de datos | opensheet API directa | Sin infraestructura extra |
| Reset del badge | Al abrir el popup | UX intuitivo |
| Repo | Subcarpeta `/extension/` | Compartir lógica con la web app |
| Navegadores | Chrome primario; Firefox + Edge si no complica | MV3 compatible en los tres sin cambios de código |

---

## Estructura de archivos

```
extension/
├── manifest.json          # MV3
├── background.js          # Service worker: alarma, fetch, badge, notifs opcionales
├── popup.html
├── popup.js
├── popup.css
├── options.html           # Página de configuración de filtros
├── options.js
├── options.css
├── lzstring.min.js        # Para codificar URL de "Open feed" (mismo formato que la web app)
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## Storage schema (`chrome.storage.sync`)

```js
{
  refreshIntervalMinutes: 15,
  filters: {
    technologies: [],   // Topics/Products — [] = "All" (sin restricción)
    categories: [],     // Content type
    channels: [],
    authors: [],
    contributors: [],
    languages: []
  },
  lastSeenPublishedAt: null,   // ISO date, se actualiza al abrir el popup
  lastKnownUnreadCount: 0,     // Persiste durante fallos de red
  targetBaseUrl: "https://hhkaos.github.io/esridevs-social-activity/",
  notificationsEnabled: false
}
```

> Arrays vacíos = "All" (sin restricción), igual que la web app.

---

## Permisos (`manifest.json`)

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "alarms", "tabs"],
  "optional_permissions": ["notifications"],
  "host_permissions": ["https://opensheet.elk.sh/*"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "browser_specific_settings": {
    "gecko": { "id": "esridevs-activity@hhkaos.github.io" }
  }
}
```

---

## Fases de implementación

### Fase 1 — Manifest + Background + Badge [x]

**Objetivo:** badge funcional con count total (sin filtros de usuario aún).

**`background.js`:**
- `chrome.runtime.onInstalled` → inicializa storage con defaults, crea alarma (15 min)
- `chrome.alarms.onAlarm` → llama a `refreshBadge()`
- `refreshBadge()`:
  1. Lee `filters` y `lastSeenPublishedAt` de `chrome.storage.sync`
  2. Fetch de `https://opensheet.elk.sh/1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg/Activity`
  3. Filtra: `item.Date > lastSeenPublishedAt` **AND** item coincide con filtros del usuario
  4. `chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })`
  5. Si falla la red: conserva `lastKnownUnreadCount` del storage sin tocar el badge
  6. (Opcional, Fase 5) Si `notificationsEnabled` y `count > prev`: dispara notificación del SO

**Lógica de filtrado del badge:**
- Solo se cuentan como nuevos los items cuya fecha (`Date`) es posterior a `lastSeenPublishedAt` **y** que coinciden con los filtros configurados por el usuario.
- Arrays vacíos en `filters.*` = sin restricción (pasan todos).
- `contributors` se trata como campo multi-valor (split por `,`).

**Tests a crear:**
- Función de filtrado pura: sin filtros → cuenta todos; con filtros → solo los coincidentes
- Comportamiento con red caída: mantiene `lastKnownUnreadCount`

---

### Fase 2 — Popup [x]

**Objetivo:** popup operativo con reset de badge al abrirlo.

**UI:**
```
┌──────────────────────────────┐
│  EsriDevs Activity     ⚙    │
├──────────────────────────────┤
│   🔔  3 new items            │
│   Last refresh: 5 min ago    │
├──────────────────────────────┤
│  [ Open feed →  ]            │
│  [ Refresh now ]             │
└──────────────────────────────┘
```

**`popup.js`:**
- Al abrirse: `lastSeenPublishedAt = new Date().toISOString()`, badge = `''`
- "Open feed" → ver Fase 4 (URL codificada con filtros)
- "Refresh now" → dispara `refreshBadge()` en background, muestra spinner
- ⚙ → `chrome.runtime.openOptionsPage()`

---

### Fase 3 — Options page (filtros + ajustes) [x]

**Objetivo:** filtros persistentes en storage, badge refleja los filtros del usuario.

**Cada campo** (Topics, Content Type, Language, Contributor, Author, Channel):
- Dropdown searchable con **Tom Select** (misma librería que la web app)
- Multi-select con **chips** de los seleccionados (eliminables con ×)
- Sin selección = "All" (placeholder text)
- Opciones cargadas desde la Dropdowns sheet de opensheet en tiempo real

**UI:**
```
Topics:    [🔍 Search...  ▼]  [GIS ×] [Python ×]
Content:   [🔍 Search...  ▼]  (All)
Language:  [🔍 Search...  ▼]  (All)
Author:    [🔍 Search...  ▼]  (All)
Contributor:[🔍 Search...  ▼] (All)
Channel:   [🔍 Search...  ▼]  (All)

Refresh interval:  [15] minutes
Target URL:        [https://hhkaos.github.io/esridevs-social-activity/]

[ ] Enable OS notifications

[ Save settings ]  [ Reset to defaults ]
```

**`options.js`:**
- Carga opciones desde `https://opensheet.elk.sh/.../Dropdowns`
- Lee estado actual de `chrome.storage.sync` y pre-selecciona chips
- Al guardar: `chrome.storage.sync.set(...)` → dispara `refreshBadge()` inmediatamente
- Si se habilita notifications: `chrome.permissions.request({ permissions: ['notifications'] })`

**Tests a crear:**
- Guardar y releer filtros desde storage
- Carga de opciones desde Dropdowns sheet

---

### Fase 4 — "Open feed" con URL codificada [x]

**Objetivo:** al clicar "Open feed", se abre la web app con los filtros del usuario pre-aplicados.

El botón usa el mismo formato LZString que la función `buildShareUrl` de `apply-filters.js`:

```js
// Transforma arrays del storage al formato de flags de la web app
function buildWebAppUrl(settings) {
  const toFlagsObj = (arr) => Object.fromEntries(arr.map(v => [v, 1]));
  const flags = {
    technologies: toFlagsObj(settings.filters.technologies),
    categories:   toFlagsObj(settings.filters.categories),
    channels:     toFlagsObj(settings.filters.channels),
    authors:      toFlagsObj(settings.filters.authors),
    contributors: toFlagsObj(settings.filters.contributors),
    languages:    toFlagsObj(settings.filters.languages),
    dateRange: { from: '', to: '' },
    datePreset: '',
    featuredOnly: false
  };
  const state = { filters: flags, columns: {}, activeTab: 'table' };
  const encoded = LZString.compressToBase64(JSON.stringify(state));
  return `${settings.targetBaseUrl}?state=${encoded}`;
}
```

- Si no hay filtros configurados (todo "All"): abre la web app sin `?state=` (todos los items visibles).

**Tests a crear:**
- `buildWebAppUrl` con filtros → URL decodificable con LZString
- Sin filtros → URL sin `?state=`

---

### Fase 5 — OS Notifications (opcional) [x]

**Objetivo:** el usuario puede activar notificaciones del SO para enterarse de nuevos items sin mirar el badge.

- El permiso `notifications` se solicita solo cuando el usuario lo activa en la options page
- La notificación se dispara en `background.js` cuando `newCount > lastKnownUnreadCount`

```js
chrome.notifications.create('new-items', {
  type: 'basic',
  iconUrl: 'icons/icon48.png',
  title: 'EsriDevs Activity',
  message: `${newCount} new item${newCount > 1 ? 's' : ''} matching your filters`
});
```

- No se repite si el count ya fue notificado (compara con `lastNotifiedCount` en storage)

---

### Fase 6 — Icons + Testing + Publicación [~]

**Iconos** ✅ — `icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`

**Testing completo:**

- [x] Lógica de filtrado del badge — 82 tests en `tests/extension-filter-utils.test.mjs`
- [x] Codificación LZString de la URL — `tests/extension-open-feed-filter-restore.test.mjs`
- [ ] Persistencia en storage (guardar/leer) — sin tests automatizados (requiere chrome API mock)
- [ ] Carga de opciones desde Dropdowns sheet — sin tests automatizados

**Publicación Chrome Web Store:** ✅ Enviado a revisión

1. ~~Cuenta de desarrollador ($5 único pago en payments.google.com)~~
2. ZIP de `/extension/`: `zip -r esri-dev-tracker.zip manifest.json background.js popup.html popup.js popup.css options.html options.js options.css filter-utils.js lzstring.min.js icons/`
3. Assets de store: descripción, screenshots (1280×800 o 640×400), icono promo (440×280)
4. ~~Enviar a revisión → ~3-7 días hábiles~~

**Publicación Firefox AMO** (gratuito) — ⬜ Pendiente:

1. Crear cuenta en addons.mozilla.org
2. Mismo ZIP (el manifest ya tiene `browser_specific_settings.gecko.id`)
3. En "Submit Your Add-on": subir ZIP → esperar firma automática (~24 h)
4. Assets de listing: icono ya incluido en manifest; screenshots 1280×800; descripción
5. ⚠️ Firefox soporta `chrome.*` nativamente — no se necesita polyfill ni cambios de código

**Publicación Edge Add-ons** (gratuito) — ⬜ Pendiente:

1. Cuenta en partner.microsoft.com → registrarse en el programa Edge
2. Mismo ZIP que Chrome (Edge es Chromium-based, compatibilidad total con MV3)
3. Partner Center → "New extension" → subir ZIP → validación automática
4. Assets: icono 300×300 px; screenshots 640×480 o 1280×800 (hasta 10)
5. Certificación: hasta 7 días hábiles

> Firefox y Edge soportan `chrome.*` namespace nativamente — el mismo código funciona en los tres navegadores sin cambios.

---

## Progreso

| Fase | Estado | Notas |
|------|--------|-------|
| 1 — Manifest + Background + Badge | ✅ Completo | `extension/manifest.json`, `extension/filter-utils.js`, `extension/background.js` — 47 tests en `tests/extension-filter-utils.test.mjs` |
| 2 — Popup | ✅ Completo | `extension/popup.html`, `popup.css`, `popup.js`; badge se resetea al abrir. Tests manuales en Chrome. |
| 3 — Options page (filtros) | ✅ Completo | `extension/options.html/css/js`; MultiSelect con chips+búsqueda; 6 campos; guarda en storage. |
| 4 — "Open feed" URL codificada | ✅ Completo | `?state=<lzstring>` pre-aplica los filtros del usuario; `?newItems=<btoa>` lista las URLs nuevas para mostrar pills "New" en la tabla. `lzstring.min.js` incluido en `/extension/`. |
| 5 — OS Notifications (opcional) | ✅ Completo | `background.js` líneas 197-204; permiso opcional en `options.js` con `chrome.permissions.request`. |
| 6 — Icons + Testing + Publicación | 🔄 En progreso | Iconos ✅; tests unitarios ✅ (82 tests); Chrome enviado a revisión ✅; Firefox AMO ⬜; Edge Add-ons ⬜. |
