# Prompt para Cursor — «Laboratorio de vídeo» (optimizar Runway para reels)

Copia todo lo de abajo en Cursor (modo Agent), con el repo `webgestiarrss` abierto.

---

Quiero que crees en GestIA una herramienta interna de **pruebas y optimización de la animación imagen → vídeo** (Runway, y opcionalmente Veo) para los reels. Ahora los clips salen con fallos y no sabemos si es culpa del modelo, del prompt de movimiento o de la imagen. La herramienta debe permitir lanzar muchas variantes sobre las mismas imágenes, medir los resultados y **iterar automáticamente hasta encontrar la mejor receta**, sin gastar más de un presupuesto fijo.

## Contexto del código (léelo antes de empezar)
- `src/app/api/generate-video/route.ts`: animación de un visual. Runway es **asíncrono**: POST crea la tarea (`video_task_id`), GET `?visual_id=` consulta y guarda el MP4 en el bucket `visual-assets`. Reutiliza `createRunwayTask`, `checkRunwayTask`, `runwayFetch` y `resolveProviderKey` (sácalos a `src/lib/video/runway.ts` si hace falta, sin romper la ruta actual).
- `src/app/api/reel-assembly/route.ts` acción `motions`: hoy la IA escribe el prompt de movimiento de cada escena a partir de `visual_brief`. **Ese prompt es lo que queremos optimizar.**
- `src/lib/ai/constants.ts`: `RUNWAY_VIDEO_MODELS`, costes (`creditsPerSecond`, 1 crédito = 0,01 $), `estimateRunwayCostUsd`.
- `src/components/calendar/ReelAssemblerModal.tsx`, `src/lib/reel-assembler.ts`: montaje del reel final (no hace falta tocarlos salvo para usar la receta ganadora).
- Estilo UI: Tailwind brutalista (bordes `border-2 border-surface-900`, `shadow-brutal-sm`), textos en español.
- Cuenta Runway de nivel bajo: **1 tarea a la vez por modelo** (las demás quedan `THROTTLED`), máx. 50 generaciones/día por modelo, tope mensual de 10.000 créditos.

## Qué construir

### 1. Página admin `/administrator/video-lab`
Solo para administradores (`isAdmin`). Secciones:

**a) Banco de pruebas.** Elegir 3–6 imágenes de prueba de visuals existentes (buscador por proyecto/fecha, o pegar URL pública). Guardar ese conjunto como «set de prueba» reutilizable (ej. «Furgocasa ricote»: furgo en carretera, mercado de limones, paseo junto al río, desayuno, atardecer). Cada imagen con su `visual_brief` y una nota de «qué debería pasar» (ej. «la furgo avanza, las ruedas giran, no se deforma el logo»).

**b) Matriz de variantes.** Definir variantes combinando:
- modelo: `gen4.5`, `gen4_turbo` (y si la API lo admite: `seedance2`, `veo3.1_fast`); consulta los valores válidos de `ratio`/`duration` por modelo y valídalos;
- duración: 5 / 10 s;
- **plantilla de prompt de movimiento** (ver punto 3);
- `seed` fijo (para comparar de forma justa cuando el modelo lo admita).
Mostrar antes de lanzar: nº de clips, créditos y $ estimados, y exigir confirmación (mismo estilo que el aviso de coste de imágenes). **Presupuesto máximo por ronda y por sesión** configurable (por defecto 600 créditos = 6 $); no lanzar nada que lo supere.

**c) Cola y ejecución.** Una cola en BD que lanza las tareas respetando la concurrencia (1 activa por modelo), con reintentos ante 429/5xx, y que siga avanzando aunque se cierre la página (endpoint `GET /api/video-lab/tick` que el cliente llama cada 8 s y que también puede llamar un cron de Vercel). Estado por clip: en cola / generando / listo / error (con el `failure` de Runway).

**d) Comparador.** Rejilla imagen × variante con los clips en bucle, sincronizados y muteados, más vista a pantalla completa lado a lado (A/B). Debajo de cada clip: modelo, plantilla, coste, tiempo, puntuaciones.

### 2. Evaluación de cada clip (automática + humana)
- **Métricas automáticas en el navegador** (sin ffmpeg): extraer ~12 fotogramas con `<video>` + canvas y calcular:
  - *movimiento*: diferencia media entre fotogramas (detecta «zoom muerto»/clip casi estático);
  - *fidelidad al primer fotograma*: similitud del fotograma 0 con la imagen original (SSIM simple o diferencia por bloques en escala reducida);
  - *estabilidad*: picos bruscos de diferencia (parpadeos, cortes, morphing).
- **Juez con IA (visión)**: mandar 6 fotogramas + la imagen original + la nota «qué debería pasar» a un modelo con visión (usa `callAI` con `inputImages`, provider por defecto) y pedir JSON con puntuaciones 1–10: `movimiento_real`, `coherencia_fisica` (manos, caras, ruedas, objetos que no se deforman), `fidelidad_marca` (logos, texto, producto intactos), `cumple_prompt`, `calidad_cinematografica`, más `fallos` (lista corta) y `sugerencia` para el prompt.
- **Nota humana**: 1–5 estrellas + etiquetas rápidas (deforma caras, deforma vehículo, cámara loca, demasiado quieto, perfecto) + comentario. La nota humana pesa el doble que la IA en la puntuación final.
- Puntuación final por clip y ranking de variantes por media en todo el set.

### 3. Plantillas de prompt de movimiento (lo que se optimiza)
Tabla `video_prompt_templates` con versión, texto y notas. Una plantilla es un «system prompt» + reglas que convierten `visual_brief` → prompt de Runway (lo que hoy hace la acción `motions`). Empieza con 4 plantillas distintas para comparar, por ejemplo:
1. la actual de `reel-assembly` (acción `motions`);
2. **mínima**: una acción principal + un movimiento de cámara, 25 palabras máx.;
3. **física explícita**: describe qué se mueve y qué debe quedarse rígido («el logo y las letras de la furgo no cambian», «las manos tienen cinco dedos»);
4. **cinematográfica**: tipo de plano, lente, ritmo y movimiento de cámara concreto.
Guarda siempre el prompt final exacto enviado a Runway por cada clip.

### 4. Bucle de optimización automática («Optimizar»)
Botón «Optimizar N rondas» (por defecto 3) dentro del presupuesto:
1. ronda 1: matriz inicial (modelos × plantillas) sobre el set;
2. al terminar, un LLM lee puntuaciones, fallos y notas humanas y **propone 2–3 plantillas nuevas** (mutaciones de las mejores) y descarta las peores;
3. siguiente ronda solo con el mejor modelo y las plantillas nuevas + la mejor anterior (control);
4. parar cuando se acabe el presupuesto, se alcancen N rondas o la mejora sea < 0,3 puntos.
Mostrar un historial de rondas con un gráfico simple de la mejor puntuación por ronda y el diff entre plantillas.

### 5. Aplicar la receta ganadora
Botón «Usar en producción»: guarda la plantilla ganadora y el modelo/duración recomendados en una tabla de ajustes (o `ai_agent_configs` con un `agent_key` nuevo `reel_motion`), y haz que la acción `motions` de `reel-assembly` y el modal «Montar reel» usen esa plantilla y ese modelo por defecto. Debe poder volverse a la anterior.

## Datos (nueva migración `035_video_lab.sql`)
`video_lab_sets`, `video_lab_set_items` (imagen, brief, expectativa), `video_prompt_templates`, `video_lab_runs` (ronda, presupuesto, estado), `video_lab_clips` (set_item, modelo, duración, seed, template_id, prompt_final, task_id, estado, video_url, coste_creditos, métricas JSON, juicio_ia JSON, nota_humana, etiquetas, comentario, tiempos). RLS: solo admins. Los MP4 en `visual-assets/video-lab/...`.

## Requisitos
- No romper nada de lo actual (animar visual, montar reel). TypeScript estricto y sin errores (`tsc --noEmit`).
- Coste siempre visible y confirmado antes de gastar; contador de créditos gastados en la sesión y saldo (si la API de Runway lo da, `GET /v1/organization`).
- Todo en español, UI del mismo estilo que el resto.
- Documenta en `README.md` (sección «Laboratorio de vídeo») cómo usarlo y qué tablas añade.
- Al terminar, dime qué has hecho, qué falta y cómo probarlo con un presupuesto de 3 $ (ej. 1 set de 5 imágenes × 2 plantillas × `gen4_turbo` 5 s = 10 clips = 250 créditos).
