# Gestia RRSS — Estrategia de contenido con IA

**Producto de [Eskala Marketing Digital](https://www.eskaladigital.com/)** — agencia de marketing digital en Murcia. Hecho con 🧡 en Murcia.

Aplicación SaaS para crear estrategias y calendarios de contenido para redes sociales usando inteligencia artificial. Incluye **interfaz adaptable a móvil** y **PWA** (instalable desde el navegador).

## Stack

- **Next.js 16** (App Router, Turbopack en `next dev`)
- **React 18**
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (PostgreSQL + Auth + RLS)
- **OpenAI API** (modelo configurable; por defecto orientado a GPT-4o)
- **Puppeteer** (Chrome sin cabeza en el servidor: miniaturas de las URLs analizadas → Supabase Storage)
- **Zustand** (estado del onboarding)
- **PWA**: `manifest.json`, service worker (`public/sw.js`), iconos y metadatos en el layout raíz

## Estructura del proyecto

```
public/
├── manifest.json            # Manifest PWA (standalone, start_url /dashboard)
├── sw.js                    # Service worker (precarga mínima + red con fallback a caché)
├── portfolio/               # README sobre capturas; imágenes locales solo si usas el script manual
├── favicon.svg
└── icons/                   # icon-192.svg, icon-512.svg (también apple touch)

scripts/
└── screenshot-portfolio.js  # Opcional: regenerar capturas vía CLI (misma lógica que el servidor)

src/
├── app/
│   ├── (auth)/              # Login, Register, Callback
│   ├── (dashboard)/         # Layout principal (barra móvil + contenido)
│   │   ├── dashboard/
│   │   ├── settings/ai/     # Configuración de agentes IA / claves
│   │   └── projects/        # Listado, nuevo, [id] (detalle, onboarding, calendario, estrategia)
│   └── api/
│       ├── analyze-site/
│       ├── analyze-competitors/
│       ├── analyze-brand/     # Identidad de marca (onboarding / tarjeta de marca)
│       ├── generate-strategy/
│       ├── generate-calendar/
│       ├── generate-visual-briefs/  # Brief creativo + prompt IA por post del calendario
│       ├── projects/        # GET, POST, PATCH
│       ├── projects/[id]/   # GET, PATCH, DELETE (p. ej. soft delete)
│       ├── projects/[id]/strategy/
│       ├── settings/ai/
│       └── scrape/
├── components/
│   ├── ui/
│   ├── layout/              # Sidebar responsive (drawer móvil + sidebar escritorio)
│   ├── onboarding/
│   ├── calendar/            # Vista calendario, grid, tabla/lista, editor de post
│   ├── strategy/
│   └── projects/            # Acciones IA, ajustes, marca, listados
├── lib/
│   ├── supabase/            # Client, Server, Middleware, project-queries
│   ├── ai/                  # Cliente LLM, prompts, providers, constants
│   ├── scraping/            # Scraping (fetch + Apify opcional) + screenshots-puppeteer.ts (Storage)
│   └── utils.ts
├── types/
├── store/
├── hooks/
└── middleware.ts            # Auth/sesión (Next puede mostrar aviso middleware → proxy en v16)

supabase/migrations/         # 001 … 011 (ejecutar en orden)
```

## Interfaz responsive

- **Menú de usuario**: en pantallas pequeñas (`< lg`) hay una **barra superior fija** con icono hamburguesa; al pulsarlo se abre un **cajón lateral** con overlay y se cierra al navegar, con Escape o al pulsar fuera. En **escritorio** (`≥ lg`) el menú lateral sigue siendo la columna fija izquierda.
- **Área principal**: padding adaptativo y, en móvil, `padding-top` para no solaparse con la barra superior.
- **Ancho del contenido**: páginas como **inicio (dashboard)**, **listado de proyectos**, **ficha de proyecto** y **ajustes IA** usan `max-w-*` centrado para lectura cómoda. La **vista de calendario** del proyecto **no** fuerza un ancho máximo en PC para que la cuadrícula y la lista aprovechen todo el ancho disponible.

## Calendario (experiencia de uso)

- **Vista cuadrícula**: en **móvil** se muestra un **mes compacto** con el día y pequeños indicadores por tipo de contenido; al seleccionar un día aparece el detalle de las publicaciones. En **tablet/escritorio** se mantiene la cuadrícula semanal ampliada.
- **Vista lista**: cada ítem es una **tarjeta** con una **franja vertical de color** e **icono + etiqueta** del formato (p. ej. Story, Reel, Carrusel) para ver de un vistazo el tipo de publicación; se muestran idea, copy (sin truncar con `pre-wrap`), CTA, objetivo y hashtags cuando existan.
- **Editor de post**: en móvil actúa como **panel inferior** (bottom sheet); en escritorio, **modal centrado**.

## PWA (instalable)

- **`/manifest.json`**: nombre, `short_name`, `start_url` → `/dashboard`, `display: standalone`, colores de tema.
- **`/sw.js`**: instalación con precarga ligera y en `fetch` estrategia **red primero**, guardando en caché respuestas GET del mismo origen cuando son correctas, con **fallback** a caché si la red falla.
- **Registro del service worker** en `src/app/layout.tsx` tras `load`.
- **Metadatos** en el layout: `manifest`, `appleWebApp`, `icons` (favicon SVG e icono Apple).
- En **producción** conviene servir la app por **HTTPS** para que el SW y la instalación PWA funcionen de forma fiable.

## Arquitectura (4 capas)

1. **Datos** → Supabase con RLS por usuario; proyectos pueden archivarse (`deleted_at`, migración 008).
2. **Scraping** → `RealScrapingProvider`: petición HTTP a la web del proyecto; si el texto es insuficiente o falla el fetch, se puede usar **Apify** (Website Content Crawler / búsqueda para competencia) según variables de entorno.
3. **Inteligencia** → Llamadas LLM con prompts alineados al onboarding; en **Config IA** se pueden ajustar agentes y claves de proveedor almacenadas de forma segura (ver migraciones `003`, `005`).
4. **Aplicación** → Next.js App Router (Server Components + Client Components).

## Base de datos (migraciones)

En el SQL Editor de Supabase, ejecuta los archivos **en orden numérico**:

| Archivo | Contenido (resumen) |
|--------|----------------------|
| `001_initial_schema.sql` | Esquema base, RLS, perfiles, proyectos, competidores, estrategias, calendario |
| `002_weekly_format_distribution.sql` | Distribución semanal de formatos |
| `003_ai_agent_configs.sql` | Configuración de agentes IA |
| `004_brand_assets.sql` | Activos de marca |
| `005_provider_api_keys.sql` | Claves de proveedores (servidor) |
| `006_brand_identity_detail.sql` | Detalle identidad de marca |
| `007_strategies_web_site_analysis.sql` | Campos extra en estrategias / análisis web |
| `008_project_soft_delete.sql` | `deleted_at` (papelera) |
| `009_project_monthly_fee.sql` | Cuota mensual del proyecto |
| `010_project_ai_rules.sql` | Reglas IA opcionales por proyecto (`ai_rules`) |
| `011_content_production_specs.sql` | Specs de producción por post del calendario (`production_specs` JSON) |

**Storage:** crea en Supabase un bucket público llamado **`screenshots`** (o déjalo que la primera captura lo intente crear vía service role). Las miniaturas del análisis web se suben ahí.

Alternativa con CLI: `npm run db:migrate` (requiere proyecto Supabase vinculado).

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ejecuta las migraciones del directorio `supabase/migrations/` **en orden** (001 → 011).
3. En **Authentication → Providers**, habilita Email y, si quieres, Google (OAuth).

### 3. Variables de entorno

Copia `.env.example` a `.env.local` y rellena al menos:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo servidor; no exponer al cliente). **Imprescindible** para que, al analizar la web, se suban las capturas al bucket `screenshots`.
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_APP_URL` (p. ej. `http://localhost:3000` en desarrollo)

Opcionales para scraping reforzado y competencia:

- `APIFY_API_TOKEN` (y actores opcionales según comentarios en `.env.example`)
- `FIRECRAWL_API_KEY` (reservado para integraciones; revisa el código actual)

Opcional para capturas:

- `DISABLE_PUPPETEER_SCREENSHOTS=1` — desactiva Puppeteer en `analyze-site` (útil en serverless sin Chrome, p. ej. Vercel estándar). El análisis de texto sigue funcionando.

### 4. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### 5. Build y producción local

```bash
npm run build
npm run start
```

En el host de despliegue (p. ej. Vercel), configura las mismas variables de entorno que en `.env.local` (sin commitear secretos).

## Flujo de uso

1. Registro / inicio de sesión.
2. Crear proyecto → **onboarding** (pasos del formulario); puede incluir análisis de **marca** (`analyze-brand`).
3. En la ficha del proyecto, **Fase 1 — Base**: analizar web → analizar competidores → generar estrategia (botones independientes; el estado del pipeline se refleja en la UI).
4. **Analizar web** además del texto guarda **miniaturas** (Puppeteer) de hasta 3 URLs en el bucket Supabase **`screenshots`** y enlaza `screenshot_url` en cada fila de `scraped_content`. El proceso puede alargarse varios minutos en la primera ejecución (descarga de Chromium, red lenta, etc.). Requiere Node con Chrome embebido (típico en `npm run dev` / `next start` en tu PC o VPS); en muchos despliegues serverless no hay navegador — usa `DISABLE_PUPPETEER_SCREENSHOTS=1` o un host con Node “completo”.
5. **Fase 2 — Calendario**: solo disponible cuando existe estrategia guardada. Primera vez genera el mes actual; si ya hay posts, puedes **añadir** publicaciones al mes o **reemplazar** todo el mes (modal). El calendario puede incluir `production_specs` (slides, duración, tipo de medio) y un paso posterior de **briefs visuales** (`generate-visual-briefs`).
6. Revisar y editar posts en la vista **Calendario** (cuadrícula o lista); exportar según lo que exponga la UI (p. ej. JSON).

Si un paso de IA falla, el proyecto puede pasar a estado **`error`**; al completar de nuevo pasos correctamente (p. ej. calendario generado) puede volver a **`ready`** según la lógica actual de las rutas API.

## API (referencia rápida)

| Ruta | Uso |
|------|-----|
| `POST /api/analyze-site` | Scraping + análisis de negocio |
| `POST /api/analyze-competitors` | Competencia + IA |
| `POST /api/analyze-brand` | Identidad de marca |
| `POST /api/generate-strategy` | Estrategia de contenido |
| `POST /api/generate-calendar` | Calendario (`calendar_mode`: append / replace, etc.) |
| `POST /api/generate-visual-briefs` | Brief creativo + prompt generativo por ítem del calendario |
| `GET/POST/PATCH /api/projects` | Listar activos, crear; `PATCH` también sirve para onboarding y **papelera** (`deleted_at`: ISO string o `null` para restaurar) |
| `PATCH /api/projects/[id]` | Ajustes del proyecto (tono, distribución semanal, cuota, etc.) |
| `DELETE /api/projects/[id]` | Borrado definitivo (si hay `deleted_at`, solo tras archivar en papelera) |
| `PATCH /api/projects/[id]/strategy` | Editar campos de la estrategia vinculada al proyecto |
| `GET/PATCH /api/settings/ai` | Configuración IA |
| `POST /api/scrape` | Scrape puntual de una URL |

## Notas sobre scraping

- Por defecto se usa **fetch** al sitio del cliente (User-Agent de navegador, timeout acotado).
- Con **`APIFY_API_TOKEN`**, el sistema puede delegar en actores de Apify cuando hace falta más cobertura o búsqueda para competidores (coste según tu cuenta Apify).

## Capturas de pantalla (analizar web)

- **Automático:** al completar `POST /api/analyze-site`, el servidor lanza Puppeteer, viewport 1400×900, intenta cerrar banners de cookies habituales y sube **JPEG** (vista tipo “hero” + página completa) al bucket **`screenshots`**. Las URLs públicas quedan en `scraped_content.metadata` (`screenshot_url`, `portfolio_hero`, `portfolio_full`, `portfolio_folder`).
- **Config:** `next.config.js` declara `serverExternalPackages: ['puppeteer']`. La ruta `analyze-site` usa `runtime = 'nodejs'` y `maxDuration` alto para dar margen a varias páginas.
- **Regenerar sin repetir todo el análisis:** `npm run screenshot:portfolio -- --project-id=<uuid>` (lee `scraped_content`, vuelve a capturar y actualiza metadata). Detalle en `public/portfolio/README.md`.

## Desarrollo, despliegue y averías frecuentes

- **`next.config.js`**: Next 16 puede mostrar un aviso de que `experimental.serverActions` espera un **objeto** y no un booleano; si afecta a tu entorno o CI, revisa la [documentación de Next.js](https://nextjs.org/docs/messages/invalid-next-config) y ajusta la clave.
- **Convención `middleware`**: puede aparecer un aviso de deprecación a favor de **`proxy`** en versiones recientes; la app sigue usando `src/middleware.ts` hasta una migración explícita.
- **Caché de Next / Turbopack corrupta**: si ves errores en tiempo de ejecución que citan variables **inexistentes** en el código fuente, **panics** de Turbopack o fallos al abrir archivos `.sst` bajo `.next/dev/cache`, cierra el servidor, **elimina la carpeta `.next`** y vuelve a ejecutar `npm run dev` o `npm run build`.
- **Carpetas sincronizadas** (Dropbox, OneDrive, etc.): la sincronización en segundo plano puede interferir con archivos de caché; si el dev server falla de forma intermitente, prueba a limpiar `.next` o trabajar en una copia fuera de la nube para builds críticos.

## Próximos pasos (post-MVP)

- [ ] PWA avanzada (notificaciones push, prompt de actualización del SW, más rutas en precache si hace falta)
- [ ] Integración Firecrawl explícita si quieres otro proveedor de extracción
- [ ] Streaming de respuestas IA (SSE)
- [ ] Exportación a CSV / Google Sheets
- [ ] Generación de imágenes (DALL-E u otros)
- [ ] Multi-plataforma ampliada (TikTok, LinkedIn, X, etc.)
- [ ] Publicación programada vía APIs de redes
- [ ] Planes y pagos (Stripe)
- [ ] Historial de versiones de estrategias
- [ ] Dashboard de analytics
