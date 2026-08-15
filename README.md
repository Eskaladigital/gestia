# Gestia RRSS — Estrategia de contenido con IA

**Producto de [Eskala Marketing Digital](https://www.eskaladigital.com/)** — agencia de marketing digital en Murcia. Hecho con 🧡 en Murcia.

Aplicación SaaS para crear estrategias y calendarios de contenido para redes sociales usando inteligencia artificial: generación de **imágenes** con fidelidad de producto (referencias + reglas físicas), **edición post-IA**, **animación a vídeo** (Veo) y galería de producción con copy listo para publicar. Incluye **interfaz adaptable a móvil** y **PWA** (instalable desde el navegador).

**Repositorio:** [github.com/Eskaladigital/gestia](https://github.com/Eskaladigital/gestia)

**Última actualización de esta documentación:** 24 de julio de 2026 (bootstrap/pipeline de proyectos cliente, auth Bearer en APIs, brand analysis anti-theme-builder).

## Stack

- **Next.js 16** (App Router, Turbopack en `next dev`)
- **React 18**
- **TypeScript**
- **Tailwind CSS**
- **ESLint 9** + `eslint-config-next` 16 (requerido para `npm install` sin conflictos de peer dependencies)
- **Supabase** (PostgreSQL + Auth + RLS)
- **OpenAI API** (modelo configurable; por defecto orientado a GPT-4o)
- **Google GenAI** (`@google/genai`) — animación image-to-video con **Veo** (`POST /api/generate-video`)
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
├── screenshot-portfolio.js              # Regenerar capturas web sin repetir analyze-site
├── reanalyze-reference-images.ts        # Reclasificar referencias (rol, caption, identidad de producto)
├── run-reanalyze.mjs                    # Launcher con TLS local (Windows / proxy corporativo)
├── preload-tls-local.cjs                # Workaround certificado SSL en Node local
├── inspect-project-fidelity.mjs         # Inspección rápida reglas + roles por proyecto
├── fix-nine-waves-fidelity.mjs          # Script puntual de corrección (mantenimiento)
├── fix-eskala-moodboard.mjs             # Ajuste puntual moodboard Eskala
├── regenerate-project-images.js         # Regenerar en lote visuals promptados (npm run images:regenerate-project)
├── import-project-reference-images.js   # Importar fotos locales al bucket de referencias
├── create-premium-user.mjs              # Crear/actualizar usuario premium (service role)
├── clone-project-wellness.mjs           # Clonar/afinar proyectos (Retiru, Furgocasa, Eskala…); npm run project:clone-wellness
├── bootstrap-rebel-classic-raid.mjs     # Crear/actualizar proyecto Rebel Classic Raid (onboarding + ai_rules)
└── run-rcr-pipeline.mjs                 # Pipeline RCR vía API (Bearer): marca→web→comp→estrategia→calendario→briefs

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
│       ├── save-visual-image-edit/  # Guardar PNG editado + image_edit_json (o borrar edición)
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
│   └── projects/            # BrandCard, BusinessCard, CompetitorsCard, ProjectReferenceImagesCard, ProjectSettingsPanel
├── lib/
│   ├── supabase/            # Client, Server (cookies + Bearer), Middleware (401 JSON en /api), project-queries
│   ├── ai/                  # Cliente LLM, prompts (estrategia, brand anti-theme-builder), providers, constants
│   ├── scraping/            # Scraping (fetch + Apify opcional) + screenshots-puppeteer.ts (Storage)
│   ├── projects/            # reference-images.ts (servidor), reference-images-shared.ts (cliente)
│   ├── visual-image-edit.ts # Estado del editor (capas de texto, filtros, presets)
│   ├── visual-image.ts      # URL de visualización (editada vs original), helpers
│   ├── visual-image-canvas.ts # Composición canvas + Google Fonts para preview/export
│   ├── auth/                # Roles (user / admin / agency)
│   └── utils.ts             # Descarga, espejo, guardar en Carrete (iOS) vía Web Share API
├── types/
├── store/
├── hooks/
└── middleware.ts            # Auth/sesión (Next 16 puede avisar middleware → proxy)

supabase/migrations/         # 001 … 028 (ejecutar en orden)
```

## Interfaz responsive

- **Landing y páginas marketing** (`/`, `/saber-mas`, `/pricing`, `/contacto`): barra con logo a la izquierda, **botón de menú centrado** en móvil que abre un **off-canvas** (panel desde la derecha) con los enlaces del front; en `sm+` los enlaces siguen en línea. Las acciones (Acceder / Empezar gratis o menú de usuario) permanecen a la derecha.
- **Menú de usuario (app logada)**: en pantallas pequeñas (`< lg`, incluido **iPad en vertical**) hay una **barra superior fija** con icono hamburguesa; al pulsarlo se abre un **cajón lateral** con overlay y se cierra al navegar, con Escape o al pulsar fuera. En **escritorio** (`≥ lg`, iPad apaisado y portátiles) el menú lateral sigue siendo la columna fija izquierda.
- **Área principal**: padding adaptativo y, en móvil, `padding-top` para no solaparse con la barra superior.
- **Ancho del contenido**: páginas como **inicio (dashboard)**, **listado de proyectos**, **ficha de proyecto** y **ajustes IA** usan `max-w-*` centrado para lectura cómoda. La **vista de calendario** del proyecto **no** fuerza un ancho máximo en PC para que la cuadrícula y la lista aprovechen todo el ancho disponible.
- **Tablet / iPad (`sm`–`lg`, ~640–1023 px)**: punto intermedio cuidado expresamente para que los layouts no se aprieten ni se rompan al perder el sidebar fijo:
  - **Calendario**: la barra de controles (botones de cambio de vista a la izquierda, acciones IA a la derecha) usa **grid de 2 columnas** en tablet para los botones de **Generar/Regenerar briefs**, **Generar/Regenerar imágenes** y **Exportar JSON`; en escritorio vuelven a alinearse en una sola fila. La **cabecera de mes** (flechas ‹ ›, título y atajos Ene/Feb…) en `CalendarGrid` y `ContentGallery` apila navegación y atajos en móvil/tablet y los alinea en `xl+`; la barra de stats de **Contenido** acota contadores y acciones masivas al mes visible. En la **vista lista** (`CalendarTable`), la cabecera de cada post (fecha + badges + acciones) y el panel expandido de **prompts visuales** envuelven con `flex-wrap` para que el botón de "Generar imágenes" no se salga. En la pestaña **Contenido**, la barra de **iconos por visual** también usa `flex-wrap` en móvil.
  - **Ficha del proyecto**: las cabeceras de **`BrandCard`**, **`BusinessCard`** y **`CompetitorsCard`** envuelven con `flex-wrap` y `ml-auto` para que el grupo de botones (Re-analizar / Editar / Cancelar) baje a una segunda línea cuando el subtítulo es largo, en lugar de comprimirse.
  - **Configuración IA** (`/settings/ai`): cada agente del pipeline tiene 4 controles (Proveedor, Modelo, Temperatura, Tokens). En **tablet** se muestran en **2 columnas × 2 filas** (Proveedor + Modelo arriba, Temp + Tokens abajo) para que los selects sean usables; en **escritorio (`lg+`)** vuelven a la fila única de 12 columnas original.

## Calendario (experiencia de uso)

La ruta `/projects/[id]/calendar` expone **tres pestañas** en la barra superior (`CalendarView`):

| Pestaña | Componente | Qué muestra |
|---------|------------|-------------|
| **Lista** | `CalendarTable` | Todos los posts del calendario en tarjetas expandibles, con prompts visuales y generación de imágenes por post. |
| **Calendario** | `CalendarGrid` | Cuadrícula mensual con posts por día. |
| **Contenido** | `ContentGallery` | Galería de producción: imágenes/vídeos, **texto para redes** (copy), prompts, densidad de rejilla y editor/animación por visual; agrupada por semanas **del mes seleccionado**. |

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

Pensada como **centro de producción**: imágenes, texto para publicar y prompts en un solo sitio, sin alternar Lista (texto sin imágenes) y Calendario (cuadraditos sin copy).

- Agrupa por **semana** dentro del mes seleccionado (cabecera con rango de fechas y botón «Generar N imágenes» por semana).
- Por cada **post** (publicación del calendario):
  - Cabecera con fecha, formato, tipo e idea.
  - Bloque **«📝 Texto para redes»** (si el post tiene `copy` / CTA / hashtags): muestra el texto listo para pegar en Instagram u otras redes, plegable (3 líneas colapsadas), botón **Copiar texto** (copy + CTA + hashtags de una vez). Una sola vez por post, no repetido en cada slide del carrusel.
  - Rejilla de **visuals** (imágenes/vídeos) del post.
- Por cada **visual** (slide / fotograma):
  - Barra superior de **iconos** (con tooltip): copiar prompt, generar/regenerar, reportar error, editar imagen, animar (Veo), espejo, descargar.
  - **Título del visual** (p. ej. «Slide 1 (gancho)») como etiqueta sobre la imagen, con punto de estado (verde / ámbar / rojo).
  - Imagen (prioriza `edited_image_url` si existe; badge **Editada**), vídeo IA debajo si existe, **prompt** editable en panel oscuro (plegable).
- **Descargar todas** del mes: en escritorio genera un **ZIP**; en **móvil/iOS** guarda las imágenes **una a una en Fotos** (Web Share API), sin ZIP.

#### Densidad de la rejilla (Vista)

En la barra de stats, selector **Vista** con tres modos (preferencia guardada en `localStorage` por proyecto):

| Modo | Escritorio (aprox.) | Uso |
|------|---------------------|-----|
| **Pequeña** (por defecto) | Hasta **6** cards por fila | Revisar muchos slides de un vistazo |
| **Mediana** | Hasta **4** por fila | Equilibrio |
| **Grande** | **2** por fila | Ver detalle |

Todas las cards comparten la **misma rejilla**: un post con un solo visual ocupa **una celda** del mismo ancho que los slides de un carrusel (no hay imágenes sueltas más estrechas que el resto).

### Editor de post

En móvil: **bottom sheet**; en escritorio: **modal centrado**.

### Imágenes y vídeo por visual

Cada visual puede generar una imagen IA (`POST /api/generate-image`). En la galería Contenido, las acciones son **botones con icono** (tooltip al pasar el ratón); ver también la sección **Vista Contenido** para el bloque de copy y la densidad de rejilla.

| Icono / acción | Descripción |
|----------------|-------------|
| Copiar | Copia el **prompt visual** al portapapeles. |
| Generar / Regenerar | Cola de generación con modal de progreso (`ImageGenProgressModal`). |
| Reportar | Texto libre en `user_feedback`; se inyecta al regenerar y se limpia al éxito. |
| Editar | Abre `ImageEditorModal` (ver abajo). Guarda vía `POST /api/save-visual-image-edit`. |
| Animar | `VideoGenModal` + `POST /api/generate-video`: Veo anima la imagen **ya generada** (no la repinta); MP4 en `video_url` (027). |
| Espejo | Flip horizontal persistente (`image_flip_horizontal`); deshabilitado si hay edición guardada. |
| Descargar | Imagen individual; **Descargar todas** del mes → ZIP en escritorio, o **guardar en Fotos** una a una en móvil/iOS. |

La **orientación** del proyecto (vertical 9:16, cuadrado 1:1, horizontal 16:9, migración 022) afecta generación y proporción en galería. Al **regenerar** una imagen, se borran `edited_image_url`, `image_edit_json` e `image_edited_at`.

#### Editor de imagen post-IA (`ImageEditorModal`)

Experiencia **inmersiva a pantalla completa** (tema oscuro, imagen protagonista), inspirada en el editor de texto de Instagram:

- **Layout**: lienzo grande a la izquierda; panel de herramientas a la derecha (en móvil, panel debajo del lienzo). Barra superior: cerrar, título «Editor», **Guardar** destacado.
- **Texto**: botón flotante «+ Añadir texto»; arrastrar capas en el canvas; varias capas por imagen.
- **Selector de tipografía**: fila horizontal de chips **«Aa»** renderizados en su fuente real (Moderna, Elegante, Impacto, Manuscrita, Caligrafía, Máquina) vía Google Fonts (Anton, Caveat, Dancing Script, Playfair Display).
- **Estilos rápidos**: Clásico, Moderno, Neón, Elegante, Manuscrito, Fuerte, Máquina (combinan tipografía, efecto y fondo).
- **Formato**: negrita, cursiva, mayúsculas, alineación; efectos Plano / Sombra / Contorno / Neón; fondo ninguno / translúcido / sólido; paleta + color picker; sliders de **tamaño**, **espaciado entre letras**, **rotación** (−180°…180°) y **opacidad**.
- **Imagen**: sliders de brillo, contraste y saturación.
- **Persistencia**: estado en `image_edit_json`; PNG compuesto en bucket `visual-assets` → `edited_image_url` (migración **026**). La galería muestra siempre la versión editada si existe; se puede **quitar la edición** y volver a la imagen IA base.

Implementación cliente: `src/lib/visual-image-edit.ts`, `src/lib/visual-image-canvas.ts`, `src/lib/visual-image.ts`.

### Fidelidad de producto (referencias + reglas automáticas)

GestIA separa dos capas que el cliente no debe mezclar:

| Capa | Campo / origen | Qué controla | Quién lo define |
|------|----------------|--------------|-----------------|
| **Blanda** | `ai_rules` | Tono, copy, clichés prohibidos, deseos creativos («que salga una piscina», «siempre atardecer») | Cliente en Ajustes |
| **Dura (inviolable)** | `physical_constraints` | Forma del producto, planta interior, tipología, materiales, adyacencias prohibidas, entornos permitidos | **La app**, desde fotos de referencia marcadas como **Producto** |

**Imágenes de referencia** (`project_reference_images`, bucket `project-reference-images`):

1. Al **subir**, la IA clasifica cada foto (`gpt-4o-mini` + visión, migración **028**): rol (`product`, `style`, `place`, `logo`, `person`, `scene`, `other`, `pending`), confianza, y si es producto: `product_identity`, `product_traits`, `reference_view` (`exterior` / `interior` / `detalle`).
2. El usuario puede **corregir el rol** en el desplegable del card; no hace falta escribir reglas a mano.
3. Con al menos una foto **`product`** con caption listo, la app **regenera y guarda** `physical_constraints` (consolidación `gpt-4o` con fichas + hasta 3 fotos; si falla la descarga de imágenes, reintenta solo con fichas). Sin fotos de producto (p. ej. servicios solo de estilo), **borra** reglas físicas obsoletas.
4. En Ajustes, si hay producto, las reglas físicas son **solo lectura**; `PATCH` del proyecto **ignora** intentos de editarlas manualmente.

**Generación de imagen** (`POST /api/generate-image`):

- Prompt en **dos ejes**: identidad del producto (inviolable) vs escena (libre: plano, luz, encuadre).
- **Ancla de producto**: si hay refs `product`, siempre entra al menos una en `images.edit`.
- Selector de referencias por rol/vista y caption del slide.
- Sufijo final con `physical_constraints`; las `ai_rules` y el `user_feedback` quedan **subordinados** (no pueden cambiar la tipología del producto).
- **QA de fidelidad** post-generación (`assessProductFidelity`): si la puntuación es baja, **un reintento** automático con correcciones derivadas del QA.

Proyectos **sin producto físico** (consultoría, branding puro): las fotos son inspiración (`style` / `place`); no se activa el modo fidelidad estricta.

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
   - **Reglas IA por proyecto** (`ai_rules`, migración 010): campo libre que se inyecta en estrategia, calendario y briefs como capa **BLANDA**. Puede pedir escena creativa (piscina, atardecer, viralidad) pero **no puede contradecir** las reglas físicas ni la forma del producto.
   - **Reglas físicas e identitarias inviolables** (`physical_constraints`, migración 025): verdad **DURA** del producto (planta, tipología, materiales, identidad gráfica fija, sujetos prohibidos). **Las genera y actualiza la app** al subir, reclasificar o borrar fotos de referencia con rol `product` (`syncProjectPhysicalConstraintsFromReferences` en `src/lib/projects/reference-images.ts`). El cliente **no las edita** si hay fotos de producto (UI solo lectura; API rechaza el PATCH). Sin fotos de producto, opcionalmente se pueden escribir a mano para servicios sin objeto físico (p. ej. collares permitidos/prohibidos en un adiestramiento).
     - Endpoint auxiliar `POST /api/projects/[id]/suggest-physical-constraints` sigue existiendo (solo devuelve texto, no guarda); útil para depuración, no para el flujo normal.
     - Se inyectan con **prioridad máxima** en `buildCalendarPrompt`, `buildSingleVisualPrompt` y `/api/generate-image`.
   - **Referencias clasificadas** (migración **028** + 024): cada imagen tiene rol, identidad de producto y caption. Solo las marcadas **`product`** alimentan reglas físicas y el anclaje fiel; `style` / `place` inspiran ambiente sin copiar forma. Al abrir la ficha del proyecto, las referencias pendientes se reclasifican en segundo plano (`regenerateAllPending`).
4. **Aplicación** → Next.js App Router (Server Components + Client Components).

## Base de datos (migraciones)

En el SQL Editor de Supabase, ejecuta los archivos **en orden numérico** (`001` → `028`):

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
| `021_project_reference_images.sql` | Tabla `project_reference_images` (hasta N imágenes reales del producto por proyecto, bucket `project-reference-images`) |
| `022_project_image_orientation.sql` | Campo `projects.image_orientation` (`vertical` / `cuadrado` / `horizontal`) para la salida de `generate-image` |
| `023_content_item_visuals_user_feedback.sql` | Campos `user_feedback` y `user_feedback_at` para reportar errores de imagen y corregirlos al regenerar |
| `024_project_reference_images_caption.sql` | Captions automáticos por imagen de referencia (`caption`, `caption_status`, `caption_at`, `caption_is_manual`). Se generan con visión al subir y permiten que la IA elija refs relevantes por slide |
| `025_projects_physical_constraints.sql` | Reglas físicas e identitarias inviolables del producto por proyecto (`physical_constraints`, `physical_constraints_at`). Se inyectan como verdad ineludible en calendario, brief visual y generación de imagen |
| `026_content_item_visuals_image_edit.sql` | Edición post-IA: `image_edit_json` (capas: tipografía, efecto, fondo, color, mayúsculas, cursiva, espaciado, rotación, opacidad + filtros globales), `edited_image_url`, `image_edited_at` (PNG final en bucket `visual-assets`; prioridad en galería y descarga) |
| `027_content_item_visuals_video_animation.sql` | Animación con IA de vídeo: `video_motion_prompt`, `video_url`, `video_status`, `video_error`, `video_model`, `video_source_image_url`, `video_generated_at` |
| `028_project_reference_images_role.sql` | Rol por referencia (`reference_role`, `role_confidence`, `role_is_manual`), identidad de producto (`product_identity`, `product_traits`, `reference_view`). Base del motor de fidelidad |

**Storage:**

- Bucket **`screenshots`**: miniaturas del análisis web (público o creado vía service role).
- Bucket **`project-reference-images`**: fotos reales del producto por proyecto (referencias de fidelidad).
- Bucket **`visual-assets`**: imágenes IA generadas, PNG editados y MP4 de animación Veo (público; lo crea la app al primer guardado).

Alternativa con CLI: `npm run db:migrate` (requiere proyecto Supabase vinculado).

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ejecuta las migraciones del directorio `supabase/migrations/` **en orden** (`001` → `028`).
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

Para **animación a vídeo** (Google Veo, `POST /api/generate-video`):

- `GOOGLE_AI_API_KEY` en el servidor, o clave de Google en **Ajustes → Proveedores IA** (`provider_api_keys`) por usuario.

### 4. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### 5. Scripts de mantenimiento (referencias y reglas físicas)

Requieren `.env.local` con Supabase + OpenAI (o clave en `provider_api_keys` del propietario del proyecto).

| Comando | Uso |
|---------|-----|
| `npm run references:reanalyze` | Reclasifica referencias pendientes (rol, caption, identidad) y sincroniza reglas físicas si hay producto. Flags: `--project-name=Nine Waves`, `--project-id=<uuid>`. |
| `npm run references:sync-rules` | Solo regenera `physical_constraints` desde fotos `product` (por defecto proyectos cuyo nombre contiene *Furgocasa* o *Nine Waves*). |
| `npm run images:import-project-references` | Importa JPG/PNG desde una carpeta local al bucket y tabla de referencias (`--project-name`, `--project-id`, `--source-dir`). |
| `npm run images:regenerate-project` | Regenera en lote imágenes ya promptadas de un proyecto (`--project-name`, `--project-id`, `--limit`, `--skip`, `--debug`, `--no-references`). |
| `node -r ./scripts/preload-tls-local.cjs ./node_modules/tsx/dist/cli.mjs scripts/inspect-project-fidelity.mjs` | Inspección en consola de reglas y roles actuales. |
| `npm run project:clone-wellness` | Clona/afina proyectos (perfiles wellness, `--rules=furgocasa\|retiros\|eskala`, `--tune-id`). Requiere `--confirm` para escribir. |
| `node -r ./scripts/preload-tls-local.cjs scripts/bootstrap-rebel-classic-raid.mjs --confirm` | Crea/actualiza el proyecto **Rebel Classic Raid** con config editorial. |
| `node -r ./scripts/preload-tls-local.cjs scripts/run-rcr-pipeline.mjs --project-id=<uuid>` | Ejecuta el pipeline contra `npm run dev` con `Authorization: Bearer` (pasos: `brand,site,competitors,strategy,calendar,briefs`). |

Las rutas `/api/*` aceptan **Bearer access_token** (además de cookies SSR) para automatización; sin sesión, responden **401 JSON** (no redirect a `/login`).

En **Windows** con error `UNABLE_TO_VERIFY_LEAF_SIGNATURE` al conectar a Supabase, usa siempre los launchers `npm run references:*` (no `tsx` directo): incluyen `preload-tls-local.cjs`.

### 6. Build y producción local

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
6. Para **Veo** en producción, añade **`GOOGLE_AI_API_KEY`** (o claves por usuario en `provider_api_keys`) y ejecuta las migraciones hasta **027** (vídeo) y **028** (roles de referencia) si aún no están aplicadas.

## Flujo de uso

1. Registro / inicio de sesión (opcional `?plan=…` en registro para trial según 016).
2. Crear proyecto → **onboarding** (pasos del formulario); puede incluir análisis de **marca** (`analyze-brand`).
3. En la ficha del proyecto (`/projects/[id]`), **Fase 1 — Base**: analizar web → analizar competidores → generar estrategia (botones independientes; el estado del pipeline se refleja en la UI). Las secciones de **identidad de marca** (`BrandCard`), **ficha del negocio** (`BusinessCard`) y **competidores** (`CompetitorsCard`) son **editables** desde el dashboard. En **`ProjectReferenceImagesCard`** sube fotos reales (exterior, interior, detalle): la IA asigna **rol** y caption; las marcadas **Producto** regeneran solas **`physical_constraints`** (en **`ProjectSettingsPanel`**, solo lectura si hay producto). Los deseos creativos van en **Reglas IA** (`ai_rules`), no en reglas físicas.
4. **Analizar web** además del texto guarda **miniaturas** (Puppeteer) de hasta 3 URLs en el bucket Supabase **`screenshots`** y enlaza `screenshot_url` en cada fila de `scraped_content`. El proceso puede alargarse varios minutos en la primera ejecución (descarga de Chromium, red lenta, etc.). Requiere Node con Chrome embebido (típico en `npm run dev` / `next start` en tu PC o VPS); en muchos despliegues serverless no hay navegador — usa `DISABLE_PUPPETEER_SCREENSHOTS=1` o un host con Node “completo”.
5. **Fase 2 — Calendario**: solo disponible cuando existe estrategia guardada. Primera vez genera el mes actual; si ya hay posts, puedes **añadir** publicaciones al mes o **reemplazar** todo el mes (modal). El calendario puede incluir `production_specs` (slides, duración, tipo de medio) y un paso posterior de **briefs visuales** (`generate-visual-briefs`).
6. **Fase 3 — Imágenes**: una vez generados los briefs, cada visual puede producir una **imagen IA** (`generate-image`). En la pestaña **Contenido**: navega por mes (flechas / atajos), elige densidad **Vista** (por defecto **Pequeña**), genera pendientes del mes, lee el **texto para redes** y el prompt junto a cada imagen, edita con el **editor inmersivo** (texto, tipografías, rotación, opacidad, filtros), anima a vídeo (Veo) y descarga (ZIP en PC o Fotos en móvil).
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
| `POST /api/generate-image` | Imagen IA por visual: refs por rol/vista, ancla de producto, `physical_constraints` (prioridad máxima), `ai_rules` subordinadas, `user_feedback` acotado, QA de fidelidad + 1 reintento automático. |
| `POST /api/generate-video` | Anima con Veo la imagen ya generada de un visual (`video_motion_prompt` → `video_url`); no regenera la imagen estática. |
| `POST /api/save-visual-image-edit` | Multipart: guarda PNG editado + `image_edit_json` en `content_item_visuals` (bucket `visual-assets`); `clear=true` borra edición y vuelve a la imagen IA base. |
| `POST /api/report-image-error` | Guarda en `content_item_visuals.user_feedback` un texto libre del usuario describiendo un error de la imagen; se usa al regenerar. |
| `GET/POST/PATCH /api/projects` | Listar activos, crear; `PATCH` también sirve para onboarding y **papelera** (`deleted_at`: ISO string o `null` para restaurar) |
| `PATCH /api/projects/[id]` | Ajustes del proyecto (tono, distribución, cuota, `ai_rules`, orientación…). `physical_constraints` solo si **no** hay fotos de producto; si las hay, el PATCH las ignora y devuelve `warning`. |
| `DELETE /api/projects/[id]` | Borrado definitivo (si hay `deleted_at`, solo tras archivar en papelera) |
| `PATCH /api/projects/[id]/strategy` | Editar campos de la estrategia vinculada al proyecto |
| `POST /api/projects/[id]/suggest-physical-constraints` | **Auxiliar / depuración**: sugiere texto de reglas físicas (gpt-4o + visión) **sin guardar**. El flujo normal no lo usa; las reglas las escribe `syncProjectPhysicalConstraintsFromReferences`. |
| `POST/PATCH/DELETE /api/projects/[id]/reference-images` | Subir referencias, clasificación IA (rol + identidad de producto), marcar primarias, editar caption, cambiar rol manual, `regenerateAllPending`, borrar. Tras cambios relevantes, **sincroniza reglas físicas** automáticamente. |
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
- **Imagen editada que no se ve tras recargar**: en base de datos suele persistir `edited_image_url` correctamente; la galería usa `getVisualDisplayUrl()`. Si en el navegador sigue la versión antigua, prueba recarga forzada, ventana privada o desinstalar la **PWA** (el service worker puede cachear GET del mismo origen; las URLs de Supabase Storage suelen ir fuera de esa caché).
- **`git push` colgado en Windows**: a veces interviene Git Credential Manager; `git ls-remote` para comprobar red y reintentar el push suele bastar.

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
- [x] Clasificación por rol de referencia (`product` / `style` / `place` / …) + identidad y vista de producto (migración 028)
- [x] Reglas físicas generadas y mantenidas por la app (no editables por el cliente si hay fotos de producto)
- [x] Captions IA por imagen de referencia + selector de refs relevantes por slide + ancla de producto en generate-image
- [x] QA visual de fidelidad post-generación con reintento automático
- [x] Scripts CLI: `references:reanalyze`, `references:sync-rules`, inspección de fidelidad
- [x] Editor de imagen post-IA inmersivo (UI oscura, chips «Aa», tipografías Google Fonts, efectos, rotación, opacidad, filtros, PNG en `edited_image_url`)
- [x] Animación a vídeo por visual (Veo, desde imagen existente)
- [x] Navegación por mes en pestañas Calendario y Contenido (flechas + atajos; acciones masivas de Contenido acotadas al mes visible)
- [x] Vista Contenido: densidad de rejilla Grande / Mediana / Pequeña (defecto Pequeña), cards de ancho uniforme, iconos de acción, texto para redes (copy) por post
- [x] Descarga masiva del mes: ZIP en escritorio; guardar en Carrete (iOS) imagen a imagen en móvil
- [ ] Rejilla global de visuals (p. ej. 6 por fila) sin agrupar por post en Contenido
- [ ] Multi-plataforma ampliada (TikTok, LinkedIn, X, etc.)
- [ ] Publicación programada vía APIs de redes
- [ ] Planes y pagos (Stripe)
- [ ] Historial de versiones de estrategias
- [ ] Dashboard de analytics
