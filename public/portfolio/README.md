# Capturas de páginas analizadas (Gestia RRSS)

Documentación complementaria del proyecto: ver el [**README principal**](https://github.com/Eskaladigital/gestia/blob/main/README.md) en la raíz (agosto 2026: Responses API para imágenes, fidelidad de producto, vista Contenido, editor, Veo, migraciones 001–028).

Para **fidelidad de producto**, referencias clasificadas y reglas físicas automáticas, consulta la sección *Fidelidad de producto* del README principal; este archivo solo cubre capturas web (`screenshots`).

## Automático (al pulsar «Analizar web»)

Tras el scraping, el servidor ejecuta **Puppeteer**, genera miniaturas (viewport + página completa) y las sube al bucket de Supabase **`screenshots`**. Las URLs públicas se guardan en `scraped_content.metadata` (`screenshot_url`, `portfolio_hero`, `portfolio_full`, etc.).

Requisitos en el servidor donde corre Next (por ejemplo tu PC con `npm run dev` o un VPS con `next start`):

- Variable **`SUPABASE_SERVICE_ROLE_KEY`** (en `.env.local` o entorno de despliegue).
- **Puppeteer** puede descargar Chromium la primera vez (puede tardar varios minutos).

En **Vercel** u otro **serverless** sin Chrome integrado, las capturas suelen fallar. Opciones:

- Definir **`DISABLE_PUPPETEER_SCREENSHOTS=1`**: el análisis de texto sigue; no se generan imágenes en ese entorno.
- Regenerar capturas en local con el script de abajo.
- Desplegar en un host con Node completo si necesitas capturas en producción.

## Script opcional (`npm run screenshot:portfolio`)

Sirve para **volver a generar** capturas sin repetir todo el análisis de IA:

```bash
npm run screenshot:portfolio -- --project-id=<uuid>
```

Detalles y flags en `scripts/screenshot-portfolio.js`.

## Manual

Subir JPG al bucket `screenshots` desde el panel de Supabase y actualizar `metadata.screenshot_url`, o usar una extensión tipo GoFullPage y subir el archivo manualmente.
