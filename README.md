# Gestia RRSS — Estrategia de contenido con IA

**Producto de [Eskala Marketing Digital](https://www.eskaladigital.com/)** — agencia de marketing digital en Murcia. Hecho con 🧡 en Murcia.

Aplicación SaaS para crear estrategias y calendarios de contenido para redes sociales usando inteligencia artificial. Incluye **interfaz adaptable a móvil** y **PWA** (instalable desde el navegador).

**Repositorio:** [github.com/Eskaladigital/gestia](https://github.com/Eskaladigital/gestia)

## Stack

- **Next.js 16** (App Router, Turbopack en `next dev`)
- **React 18**
- **TypeScript**
- **Tailwind CSS**
- **ESLint 9** + `eslint-config-next` 16 (requerido para `npm install` sin conflictos de peer dependencies)
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
│   │   ├── administrator/   # Panel admin (usuarios, proyectos, etc.)
│   │   ├── settings/ai/   # Configuración de agentes IA / claves
│   │   └── projects/        # Listado, nuevo, [id] (detalle, onboarding, calendario, estrategia)
│   ├── page.tsx             # Landing marketing
│   ├── pricing/, contacto/, saber-mas/, trial-expired/
│   └── api/
│       ├── analyze-site/
│       ├── analyze-competitors/
│       ├── analyze-brand/       # Identidad de marca (onboarding / tarjeta de marca)
│       ├── generate-strategy/
│       ├── generate-calendar/
│       ├── generate-visual-briefs/  # Brief creativo + prompt IA por post del calendario
│       ├── administrator/users/
│       ├── projects/            # GET, POST, PATCH
│       ├── projects/[id]/       # GET, PATCH, DELETE (p. ej. soft delete)
│       ├── projects/[id]/strategy/, client-report/
│       ├── settings/ai/
│       └── scrape/
├── components/
│   ├── ui/
│   ├── layout/              # Sidebar responsive (drawer móvil + sidebar escritorio); nav marketing + off-canvas móvil
│   ├── onboarding/
│   ├── calendar/            # Vista calendario, grid, tabla/lista, editor de post
│   ├── strategy/
│   └── projects/            # Acciones IA, ajustes, marca, listados
├── lib/
│   ├── supabase/            # Client, Server, Middleware, project-queries
│   ├── ai/                  # Cliente LLM, prompts, providers, constants
│   ├── scraping/            # Scraping (fetch + Apify opcional) + screenshots-puppeteer.ts (Storage)
│   ├── auth/                # Roles (user / admin / agency)
│   └── utils.ts
├── types/
├── store/
├── hooks/
└── middleware.ts            # Auth/sesión (Next 16 puede avisar middleware → proxy)

supabase/migrations/         # 001 … 016 (ejecutar en orden)
```

## Interfaz responsive

- **Landing y páginas marketing** (`/`, `/saber-mas`, `/pricing`, `/contacto`): barra con logo a la izquierda, **botón de menú centrado** en móvil que abre un **off-canvas** (panel desde la derecha) con los enlaces del front; en `sm+` los enlaces siguen en línea. Las acciones (Acceder / Empezar gratis o menú de usuario) permanecen a la derecha.
- **Menú de usuario (app logada)**: en pantallas pequeñas (`< lg`) hay una **barra superior fija** con icono hamburguesa; al pulsarlo se abre un **cajón lateral** con overlay y se cierra al navegar, con Escape o al pulsar fuera. En **escritorio** (`≥ lg`) el menú lateral sigue siendo la columna fija izquierda.
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
- **Metadatos** en el layout: `manifest`, `appleWebApp`, `icons` (favicon PNG e icono Apple).
- En **producción** conviene servir la app por **HTTPS** para que el SW y la instalación PWA funcionen de forma fiable.

## Arquitectura (4 capas)

1. **Datos** → Supabase con RLS por usuario; proyectos pueden archivarse (`deleted_at`, migración 008). Roles admin y suscripciones (012+).
2. **Scraping** → `RealScrapingProvider`: petición HTTP a la web del proyecto; si el texto es insuficiente o falla el fetch, se puede usar **Apify** (Website Content Crawler / búsqueda para competencia) según variables de entorno. Búsqueda orgánica opcional vía **SearchAPI.io** o **SerpAPI** (`SEARCHAPI_API_KEY`, `SERPAPI_KEY`).
3. **Inteligencia** → Llamadas LLM con prompts alineados al onboarding; en **Config IA** se pueden ajustar agentes y claves de proveedor almacenadas de forma segura (ver migraciones `003`, `005`).
4. **Aplicación** → Next.js App Router (Server Components + Client Components).

## Base de datos (migraciones)

En el SQL Editor de Supabase, ejecuta los archivos **en orden numérico** (`001` → `016`):

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
| `012_user_roles_and_subscriptions.sql` | Roles en `profiles`, planes de suscripción, `user_subscriptions`, freemium |
| `013_admin_projects_access.sql` | RLS: admins acceden a todos los proyectos y datos vinculados |
| `014_admin_profile_eskala_digital_com.sql` | Ajuste de perfil admin / email corporativo (entorno concreto) |
| `015_fix_admin_rls_recursion.sql` | Evita recursión RLS en policies de admin (función `SECURITY DEFINER`) |
| `016_auto_trial_on_signup.sql` | Trial 30 días al registrarse (`selected_plan` en metadata del signup) |

**Storage:** crea en Supabase un bucket público llamado **`screenshots`** (o déjalo que la primera captura lo intente crear vía service role). Las miniaturas del análisis web se suben ahí.

Alternativa con CLI: `npm run db:migrate` (requiere proyecto Supabase vinculado).

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ejecuta las migraciones del directorio `supabase/migrations/` **en orden** (`001` → `016`).
3. En **Authentication → Providers**, habilita Email y, si quieres, Google (OAuth).
4. En **Authentication → URL configuration**, añade la URL de tu app (local y producción) y rutas de callback (p. ej. `/callback`).

### 3. Variables de entorno

Copia `.env.example` a `.env.local` y rellena al menos:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo servidor; no exponer al cliente). **Imprescindible** para que, al analizar la web, se suban las capturas al bucket `screenshots`.
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_APP_URL` (p. ej. `http://localhost:3000` en desarrollo; en producción, la URL pública real)

Opcionales para scraping reforzado y competencia:

- `APIFY_API_TOKEN` (y actores opcionales según comentarios en `.env.example`)
- `SEARCHAPI_API_KEY` / `SERPAPI_KEY` (búsqueda orgánica; no uses `NEXT_PUBLIC_*` para claves SERP)
- `FIRECRAWL_API_KEY` (reservado para integraciones; revisa el código actual)
- `SERP_PROVIDER` (`auto` | `apify_only` | `searchapi_only`, según `.env.example`)

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

## Despliegue (Vercel)

1. Conecta el repositorio [Eskaladigital/gestia](https://github.com/Eskaladigital/gestia) en [Vercel](https://vercel.com) e importa el proyecto (framework **Next.js** detectado automáticamente).
2. En **Settings → Environment Variables**, copia las mismas claves que en `.env.local` (sin commitear secretos). **`NEXT_PUBLIC_APP_URL`** debe ser la URL de producción (p. ej. `https://tu-proyecto.vercel.app`).
3. En Supabase, añade esa URL y `https://tu-proyecto.vercel.app/callback` (y dominio custom si lo usas) en **Redirect URLs** y **Site URL** según corresponda.
4. **`npm install`** en Vercel requiere **ESLint ≥ 9** (ya fijado en `package.json`) para compatibilidad con `eslint-config-next@16`.
5. Puppeteer en rutas API puede no funcionar en el runtime serverless por defecto; usa `DISABLE_PUPPETEER_SCREENSHOTS=1` o un entorno con Chromium compatible si necesitas capturas en producción.

## Flujo de uso

1. Registro / inicio de sesión (opcional `?plan=…` en registro para trial según 016).
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
| `GET/PATCH /api/administrator/users` | Gestión de usuarios (admin) |
| `POST /api/scrape` | Scrape puntual de una URL |

## Notas sobre scraping

- Por defecto se usa **fetch** al sitio del cliente (User-Agent de navegador, timeout acotado).
- Con **`APIFY_API_TOKEN`**, el sistema puede delegar en actores de Apify cuando hace falta más cobertura o búsqueda para competidores (coste según tu cuenta Apify).
- Con **`SEARCHAPI_API_KEY`** o **`SERPAPI_KEY`** se puede enriquecer búsqueda orgánica (orden según `SERP_PROVIDER`).

## Capturas de pantalla (analizar web)

- **Automático:** al completar `POST /api/analyze-site`, el servidor lanza Puppeteer, viewport 1400×900, intenta cerrar banners de cookies habituales y sube **JPEG** (vista tipo “hero” + página completa) al bucket **`screenshots`**. Las URLs públicas quedan en `scraped_content.metadata` (`screenshot_url`, `portfolio_hero`, `portfolio_full`, `portfolio_folder`).
- **Config:** `next.config.js` declara `serverExternalPackages: ['puppeteer']`. La ruta `analyze-site` usa runtime Node.js y puede requerir `maxDuration` alto en el host para varias páginas.
- **Regenerar sin repetir todo el análisis:** `npm run screenshot:portfolio -- --project-id=<uuid>` (lee `scraped_content`, vuelve a capturar y actualiza metadata). Detalle en [`public/portfolio/README.md`](public/portfolio/README.md).

## Desarrollo, despliegue y averías frecuentes

- **Convención `middleware`**: puede aparecer un aviso de deprecación a favor de **`proxy`** en Next 16; la app sigue usando `src/middleware.ts` hasta una migración explícita.
- **Caché de Next / Turbopack corrupta**: si ves errores en tiempo de ejecución que citan variables **inexistentes** en el código fuente, **panics** de Turbopack o fallos al abrir archivos `.sst` bajo `.next/dev/cache`, cierra el servidor, **elimina la carpeta `.next`** y vuelve a ejecutar `npm run dev` o `npm run build`.
- **Carpetas sincronizadas** (Dropbox, OneDrive, etc.): la sincronización puede interferir con **Git** (permisos en `.git/objects`) o con cachés; si `git add` falla, prueba a cerrar la sync temporalmente o usa `git init --separate-git-dir` apuntando a una carpeta **fuera** de la nube para los objetos del repositorio.

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
