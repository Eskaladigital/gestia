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
│       ├── generate-image/          # Imagen IA por visual (refs, reglas físicas, feedback)
│       ├── generate-video/          # Animación Veo a partir de imagen ya generada
│       ├── report-image-error/
│       ├── administrator/users/
│       ├── projects/            # GET, POST, PATCH
│       ├── projects/[id]/       # GET, PATCH, DELETE (p. ej. soft delete)
│       ├── projects/[id]/reference-images/   # Fotos reales del producto + captions IA
│       ├── projects/[id]/suggest-physical-constraints/
│       ├── projects/[id]/strategy/, client-report/
│       ├── settings/ai/
│       └── scrape/
├── components/
│   ├── ui/
│   ├── layout/              # Sidebar responsive (drawer móvil + sidebar escritorio); nav marketing + off-canvas móvil
│   ├── onboarding/
│   ├── calendar/            # CalendarView (Lista / Calendario / Contenido), grid con mes, ContentGallery, PostEditor, ImageEditorModal, VideoGenModal
│   ├── strategy/
│   └── projects/            # BrandCard, BusinessCard, CompetitorsCard (editables), acciones IA, ajustes, listados
├── lib/
│   ├── supabase/            # Client, Server, Middleware, project-queries
│   ├── ai/                  # Cliente LLM, prompts (estrategia con ADN visual), providers, constants
│   ├── scraping/            # Scraping (fetch + Apify opcional) + screenshots-puppeteer.ts (Storage)
│   ├── auth/                # Roles (user / admin / agency)
│   └── utils.ts
├── types/
├── store/
├── hooks/
└── middleware.ts            # Auth/sesión (Next 16 puede avisar middleware → proxy)

supabase/migrations/         # 001 … 027 (ejecutar en orden)
```

## Interfaz responsive

- **Landing y páginas marketing** (`/`, `/saber-mas`, `/pricing`, `/contacto`): barra con logo a la izquierda, **botón de menú centrado** en móvil que abre un **off-canvas** (panel desde la derecha) con los enlaces del front; en `sm+` los enlaces siguen en línea. Las acciones (Acceder / Empezar gratis o menú de usuario) permanecen a la derecha.
- **Menú de usuario (app logada)**: en pantallas pequeñas (`< lg`, incluido **iPad en vertical**) hay una **barra superior fija** con icono hamburguesa; al pulsarlo se abre un **cajón lateral** con overlay y se cierra al navegar, con Escape o al pulsar fuera. En **escritorio** (`≥ lg`, iPad apaisado y portátiles) el menú lateral sigue siendo la columna fija izquierda.
- **Área principal**: padding adaptativo y, en móvil, `padding-top` para no solaparse con la barra superior.
- **Ancho del contenido**: páginas como **inicio (dashboard)**, **listado de proyectos**, **ficha de proyecto** y **ajustes IA** usan `max-w-*` centrado para lectura cómoda. La **vista de calendario** del proyecto **no** fuerza un ancho máximo en PC para que la cuadrícula y la lista aprovechen todo el ancho disponible.
- **Tablet / iPad (`sm`–`lg`, ~640–1023 px)**: punto intermedio cuidado expresamente para que los layouts no se aprieten ni se rompan al perder el sidebar fijo:
  - **Calendario**: la barra de controles (botones de cambio de vista a la izquierda, acciones IA a la derecha) usa **grid de 2 columnas** en tablet para los botones de **Generar/Regenerar briefs**, **Generar/Regenerar imágenes** y **Exportar JSON`; en escritorio vuelven a alinearse en una sola fila. La **cabecera de mes** (flechas ‹ ›, título y atajos Ene/Feb…) en `CalendarGrid` y `ContentGallery` apila navegación y atajos en móvil/tablet y los alinea en `xl+`; la barra de stats de **Contenido** acota contadores y acciones masivas al mes visible. En la **vista lista** (`CalendarTable`), la cabecera de cada post (fecha + badges + acciones) y el panel expandido de **prompts visuales** envuelven con `flex-wrap` para que el botón de "Generar imágenes" no se salga.
  - **Ficha del proyecto**: las cabeceras de **`BrandCard`**, **`BusinessCard`** y **`CompetitorsCard`** envuelven con `flex-wrap` y `ml-auto` para que el grupo de botones (Re-analizar / Editar / Cancelar) baje a una segunda línea cuando el subtítulo es largo, en lugar de comprimirse.
  - **Configuración IA** (`/settings/ai`): cada agente del pipeline tiene 4 controles (Proveedor, Modelo, Temperatura, Tokens). En **tablet** se muestran en **2 columnas × 2 filas** (Proveedor + Modelo arriba, Temp + Tokens abajo) para que los selects sean usables; en **escritorio (`lg+`)** vuelven a la fila única de 12 columnas original.

## Calendario (experiencia de uso)

La ruta `/projects/[id]/calendar` expone **tres pestañas** en la barra superior (`CalendarView`):

| Pestaña | Componente | Qué muestra |
|---------|------------|-------------|
| **Lista** | `CalendarTable` | Todos los posts del calendario en tarjetas expandibles, con prompts visuales y generación de imágenes por post. |
| **Calendario** | `CalendarGrid` | Cuadrícula mensual con posts por día. |
| **Contenido** | `ContentGallery` | Galería de imágenes/vídeos generados, agrupada por semanas **del mes seleccionado**. |

### Navegación por mes (Calendario y Contenido)

Tanto la **cuadrícula** (`CalendarGrid`) como la **galería Contenido** (`ContentGallery`) comparten el mismo patrón de cabecera:

- **Flechas ‹ ›** a izquierda y derecha del nombre del mes y año (p. ej. «Mayo 2026»).
- **Atajos de mes** (Ene, Feb, Mar…) solo para los meses que tienen publicaciones con contenido; el mes activo se resalta en naranja de marca.
- El mes inicial es el **más antiguo** con posts en el calendario.

En **Contenido**, al cambiar de mes solo se listan las semanas y visuals de ese mes; los contadores (`posts`, `visuals`, `imágenes listas`, `pendientes`) y las acciones masivas (**Generar pendientes**, **Descargar todas**) aplican **solo al mes visible**. Si un mes no tiene visuals, se muestra «Sin contenido este mes» pero las flechas y atajos siguen disponibles.

En la barra global del calendario (encima de las pestañas), **Generar/Regenerar briefs** e **imágenes** siguen siendo acciones de **todo el proyecto**; la navegación por mes afecta a la visualización y a las acciones masivas de la pestaña Contenido.

### Vista cuadrícula (pestaña Calendario)

- En **móvil**: mes compacto con día e indicadores por tipo; al pulsar un día con publicaciones aparece el detalle completo debajo.
- En **tablet/escritorio**: cuadrícula semanal ampliada con colores por semana ISO; el **número del día** (si hay posts) abre el panel de detalle con copy, CTA, hashtags y selector de **estado** (borrador → aprobado).
- Pulsar un post abre el **editor** (`PostEditor`).

### Vista lista

Cada ítem es una **tarjeta** con franja vertical de color e **icono + etiqueta** del formato (Story, Reel, Carrusel…); idea, copy (`pre-wrap`), CTA, objetivo y hashtags; panel expandible de prompts visuales por slide.

### Vista Contenido (galería)

- Agrupa por **semana** dentro del mes seleccionado (cabecera con rango de fechas y botón «Generar N imágenes» por semana).
- Por cada visual: imagen (o placeholder), vídeo IA si existe, prompt editable, y acciones por tarjeta.
- **Descargar todas** genera un ZIP solo con las imágenes listas **del mes actual**.

### Editor de post

En móvil: **bottom sheet**; en escritorio: **modal centrado**.

### Imágenes y vídeo por visual

Cada visual puede generar una imagen IA (`POST /api/generate-image`). Acciones en la galería:

| Acción | Descripción |
|--------|-------------|
| **Copiar** | Copia el prompt visual al portapapeles. |
| **Generar / Regenerar** | Cola de generación con modal de progreso. |
| **Reportar** | Texto libre en `user_feedback`; se inyecta al regenerar y se limpia al éxito. |
| **Editar** | `ImageEditorModal`: editor tipo Instagram. Capas de texto con **estilos rápidos** (clásico, moderno, neón, elegante, manuscrito, fuerte, máquina), **tipografías** reales (Google Fonts: Anton, Caveat, Dancing Script, Playfair), **efectos** (sombra/contorno/neón), fondo (sin fondo/translúcido/sólido), color picker, mayúsculas, cursiva, espaciado y filtros de imagen. PNG final en `edited_image_url` (026). |
| **🎬 Animar** | `VideoGenModal` + `POST /api/generate-video`: Veo anima la imagen **ya generada** (no la repinta); MP4 en `video_url` (027). |
| **Espejo** | Flip horizontal persistente (`image_flip_horizontal`); deshabilitado si hay edición guardada. |
| **Descargar** | Individual o ZIP del mes visible. |

La **orientación** del proyecto (vertical 9:16, cuadrado 1:1, horizontal 16:9, migración 022) afecta generación y proporción en galería.

## PWA (instalable)

- **`/manifest.json`**: nombre, `short_name`, `start_url` → `/dashboard`, `display: standalone`, colores de tema.
- **`/sw.js`**: instalación con precarga ligera y en `fetch` estrategia **red primero**, guardando en caché respuestas GET del mismo origen cuando son correctas, con **fallback** a caché si la red falla.
- **Registro del service worker** en `src/app/layout.tsx` tras `load`.
- **Metadatos** en el layout: `manifest`, `appleWebApp`, `icons` (favicon PNG e icono Apple).
- En **producción** conviene servir la app por **HTTPS** para que el SW y la instalación PWA funcionen de forma fiable.

## Arquitectura (4 capas)

1. **Datos** → Supabase con RLS por usuario; proyectos pueden archivarse (`deleted_at`, migración 008). Roles admin y suscripciones (012+).
2. **Scraping** → `RealScrapingProvider`: petición HTTP a la web del proyecto; si el texto es insuficiente o falla el fetch, se puede usar **Apify** (Website Content Crawler / búsqueda para competencia) según variables de entorno. Búsqueda orgánica opcional vía **SearchAPI.io** o **SerpAPI** (`SEARCHAPI_API_KEY`, `SERPAPI_KEY`).
3. **Inteligencia** → Llamadas LLM con prompts alineados al onboarding; en **Config IA** se pueden ajustar agentes y claves de proveedor almacenadas de forma segura (ver migraciones `003`, `005`, `020`). El prompt de estrategia (`buildStrategyPrompt`) inyecta **ADN visual** de la marca (colores, keywords, identidad) y aplica una **jerarquía de prioridad**: reglas IA del proyecto → sliders de tono del usuario → ADN de marca → análisis del negocio → análisis competitivo. Cada pilar generado debe justificarse con fortalezas del negocio o debilidades de la competencia.
   - **Carruseles con variedad narrativa** (`buildCalendarPrompt` + `buildCarouselSystem`): para cada carrusel, el editor del calendario escribe una **ficha técnica por slide** (Plano / Sujeto / Acción / Hora-luz / Lugar) y aplica reglas duras de variedad (prohibido repetir el mismo plano dos veces, obligatorio mezclar interior/exterior, detalle, escena humana y entorno). El director de arte del slide recibe además el **mapa completo** del carrusel y las fichas de los slides anterior y siguiente, para que cada slide encaje en un arco narrativo y no acabe siendo seis fotos casi iguales.
   - **Reglas IA por proyecto** (`ai_rules`, migración 010): campo libre de texto que se inyecta en cabeza de todos los prompts de la pipeline como **cinturón de seguridad** BLANDO (p. ej. reglas de marca, tono, clichés de copy prohibidos, hashtags vetados).
   - **Reglas físicas e identitarias inviolables** (`physical_constraints`, migración 025): campo de texto libre por proyecto con la verdad **DURA** sobre el producto: planta y adyacencias (camper, restaurante, gym), identidad gráfica fija (logo, colores corporativos, packaging) o sujetos/objetos prohibidos (jaulas, collares de pinchos, uniformes ajenos). Tres formas de obtenerlas:
     1. **A mano** en Ajustes del proyecto (`PATCH /api/projects/[id]`).
     2. **Sugerir y revisar** con `POST /api/projects/[id]/suggest-physical-constraints` (dossier + fotos de referencia con visión gpt-4o).
     3. **Un clic desde referencias**: en la ficha del proyecto, card **Imágenes de referencia del producto** (`ProjectReferenceImagesCard`), botón **«✨ Generar reglas físicas con IA»** — encadena: (a) generar captions IA pendientes de las fotos, (b) redactar reglas con `suggest-physical-constraints`, (c) guardarlas en el proyecto. Si ya existían reglas, pide confirmación antes de **reemplazarlas**.
     Se inyectan como bloque de **prioridad máxima** en `buildCalendarPrompt`, `buildSingleVisualPrompt` y `/api/generate-image`; si la ficha del slide contradice estas reglas, el brief visual se reescribe antes de pintar.
   - **Captions automáticos por imagen de referencia** (migración 024): al subir referencias en `POST /api/projects/[id]/reference-images` la API llama a `gpt-4o-mini` con visión y guarda una descripción libre (1-2 frases) por imagen. En `/api/generate-image`, si todas las refs tienen caption listo, un selector LLM elige las relevantes para el slide concreto (interior solo con interiores, exterior solo con exteriores, logo solo con logos…) y descarta el resto; si ninguna encaja, genera sin referencias. Las descripciones se editan y regeneran desde el card de referencias del proyecto.
4. **Aplicación** → Next.js App Router (Server Components + Client Components).

## Base de datos (migraciones)

En el SQL Editor de Supabase, ejecuta los archivos **en orden numérico** (`001` → `027`):

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
| `017_content_item_visuals.sql` | Tabla `content_item_visuals` para almacenar visuals por ítem del calendario |
| `018_visual_generated_images.sql` | Campos de imagen generada en `content_item_visuals` (`image_url`, `image_status`, etc.) |
| `019_content_item_visuals_image_flip.sql` | Columna `image_flip_horizontal` (espejo persistente por visual) |
| `020_ai_agent_configs_expand_and_refresh_models.sql` | Amplía el catálogo de `agent_key` (story/video/carrusel/feed) y refresca defaults OpenAI |
| `021_project_reference_images.sql` | Tabla `project_reference_images` (hasta N imágenes reales del producto por proyecto, bucket `product-references`) |
| `022_project_image_orientation.sql` | Campo `projects.image_orientation` (`vertical` / `cuadrado` / `horizontal`) para la salida de `generate-image` |
| `023_content_item_visuals_user_feedback.sql` | Campos `user_feedback` y `user_feedback_at` para reportar errores de imagen y corregirlos al regenerar |
| `024_project_reference_images_caption.sql` | Captions automáticos por imagen de referencia (`caption`, `caption_status`, `caption_at`, `caption_is_manual`). Se generan con visión al subir y permiten que la IA elija refs relevantes por slide |
| `025_projects_physical_constraints.sql` | Reglas físicas e identitarias inviolables del producto por proyecto (`physical_constraints`, `physical_constraints_at`). Se inyectan como verdad ineludible en calendario, brief visual y generación de imagen |
| `026_content_item_visuals_image_edit.sql` | Edición post-IA estilo Instagram: `image_edit_json` (capas de texto con tipografía, efecto, fondo, color, mayúsculas, cursiva, espaciado + filtros), `edited_image_url`, `image_edited_at` (PNG final para vista y descarga) |
| `027_content_item_visuals_video_animation.sql` | Animación con IA de vídeo: `video_motion_prompt`, `video_url`, `video_status`, `video_error`, `video_model`, `video_source_image_url`, `video_generated_at` |

**Storage:** crea en Supabase un bucket público llamado **`screenshots`** (o déjalo que la primera captura lo intente crear vía service role). Las miniaturas del análisis web se suben ahí.

Alternativa con CLI: `npm run db:migrate` (requiere proyecto Supabase vinculado).

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ejecuta las migraciones del directorio `supabase/migrations/` **en orden** (`001` → `027`).
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
3. En la ficha del proyecto, **Fase 1 — Base**: analizar web → analizar competidores → generar estrategia (botones independientes; el estado del pipeline se refleja en la UI). Las secciones de **identidad de marca** (`BrandCard`), **ficha del negocio** (`BusinessCard`) y **competidores** (`CompetitorsCard`) son **editables** directamente desde el dashboard; los cambios se persisten en Supabase y se utilizan al regenerar la estrategia. Opcionalmente: sube **fotos de referencia** del producto real y pulsa **«✨ Generar reglas físicas con IA»** para que el sistema redacte y guarde las reglas físicas inviolables antes de generar calendario e imágenes.
4. **Analizar web** además del texto guarda **miniaturas** (Puppeteer) de hasta 3 URLs en el bucket Supabase **`screenshots`** y enlaza `screenshot_url` en cada fila de `scraped_content`. El proceso puede alargarse varios minutos en la primera ejecución (descarga de Chromium, red lenta, etc.). Requiere Node con Chrome embebido (típico en `npm run dev` / `next start` en tu PC o VPS); en muchos despliegues serverless no hay navegador — usa `DISABLE_PUPPETEER_SCREENSHOTS=1` o un host con Node “completo”.
5. **Fase 2 — Calendario**: solo disponible cuando existe estrategia guardada. Primera vez genera el mes actual; si ya hay posts, puedes **añadir** publicaciones al mes o **reemplazar** todo el mes (modal). El calendario puede incluir `production_specs` (slides, duración, tipo de medio) y un paso posterior de **briefs visuales** (`generate-visual-briefs`).
6. **Fase 3 — Imágenes**: una vez generados los briefs, cada visual puede producir una **imagen IA** (`generate-image`). Revisa y trabaja los assets en la pestaña **Contenido** del calendario: navega por mes con las **flechas** o los **atajos** (Ene, Feb…), genera pendientes del mes visible, edita con el **editor tipo Instagram** (texto con tipografías, efectos y fondos + filtros), anima a vídeo (Veo), descarga individual o ZIP del mes.
7. Revisar y editar posts en **Lista** o **Calendario** (cuadrícula mensual con las mismas flechas de mes); cambiar estado borrador → aprobado desde el detalle del día o el editor; **exportar JSON** desde la barra superior.

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
| `POST /api/generate-image` | Genera imagen IA para un visual del calendario (guarda URL en `content_item_visuals`). Usa refs con caption, `physical_constraints` y, si hay `user_feedback`, corrección obligatoria (se limpia al éxito). |
| `POST /api/generate-video` | Anima con Veo la imagen ya generada de un visual (`video_motion_prompt` → `video_url`); no regenera la imagen estática. |
| `POST /api/report-image-error` | Guarda en `content_item_visuals.user_feedback` un texto libre del usuario describiendo un error de la imagen; se usa al regenerar. |
| `GET/POST/PATCH /api/projects` | Listar activos, crear; `PATCH` también sirve para onboarding y **papelera** (`deleted_at`: ISO string o `null` para restaurar) |
| `PATCH /api/projects/[id]` | Ajustes del proyecto (tono, distribución semanal, cuota, `physical_constraints`, etc.) |
| `DELETE /api/projects/[id]` | Borrado definitivo (si hay `deleted_at`, solo tras archivar en papelera) |
| `PATCH /api/projects/[id]/strategy` | Editar campos de la estrategia vinculada al proyecto |
| `POST /api/projects/[id]/suggest-physical-constraints` | Sugiere las "Reglas físicas e identitarias inviolables" a partir del dossier y las fotos de referencia (gpt-4o + visión). Respuesta: `suggestion` o `insufficient` si faltan fotos/captions. |
| `POST/PATCH/DELETE /api/projects/[id]/reference-images` | Subir referencias del producto, marcar primarias, editar caption manual, regenerar caption con IA o `regenerateAllPending`. Desde la UI del card también se puede lanzar el flujo completo de reglas físicas (suggest + PATCH). |
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
- [x] Generación de imágenes IA (con espejo horizontal persistente y descarga)
- [x] Reporte de error por imagen con texto libre, aplicado como corrección al regenerar
- [x] Carruseles con variedad narrativa forzada (ficha técnica por slide + mapa completo al director de arte)
- [x] Orientación de imagen por proyecto (vertical / cuadrado / horizontal)
- [x] Referencias visuales del producto por proyecto (subida de fotos reales para coherencia con el producto sin perder variedad de planos)
- [x] Reglas físicas e identitarias inviolables por proyecto (Ajustes, suggest API y botón desde referencias)
- [x] Captions IA por imagen de referencia + selector de refs relevantes por slide
- [x] Editor de imagen post-IA estilo Instagram (tipografías, efectos, fondos, filtros, PNG editado)
- [x] Animación a vídeo por visual (Veo, desde imagen existente)
- [x] Navegación por mes en pestañas Calendario y Contenido (flechas + atajos; acciones masivas de Contenido acotadas al mes visible)
- [ ] Multi-plataforma ampliada (TikTok, LinkedIn, X, etc.)
- [ ] Publicación programada vía APIs de redes
- [ ] Planes y pagos (Stripe)
- [ ] Historial de versiones de estrategias
- [ ] Dashboard de analytics
