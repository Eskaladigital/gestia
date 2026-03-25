# Capturas de páginas analizadas

## Automático (al pulsar «Analizar web»)

Tras el scraping, el servidor ejecuta **Puppeteer**, genera miniaturas (viewport + página completa) y las sube al bucket de Supabase **`screenshots`**. Las URLs públicas se guardan en `scraped_content.metadata` (`screenshot_url`, etc.).

Requisitos en el servidor donde corre Next (por ejemplo tu PC con `npm run dev` o un VPS con `next start`):

- Variable **`SUPABASE_SERVICE_ROLE_KEY`** (en `.env.local` o entorno de despliegue).
- **Puppeteer** puede instalar Chromium la primera vez (puede tardar).

Si despliegas en **Vercel u otro serverless** sin Chrome, las capturas suelen fallar: puedes poner `DISABLE_PUPPETEER_SCREENSHOTS=1` y usar solo el script local (abajo) o un host con Node completo.

## Script opcional (`npm run screenshot:portfolio`)

Sirve para **volver a generar** capturas sin repetir todo el análisis de IA:

```bash
npm run screenshot:portfolio -- --project-id=<uuid>
```

Ver comentarios en `scripts/screenshot-portfolio.js`.

## Manual

Subir JPG al bucket `screenshots` desde el panel de Supabase y actualizar `metadata.screenshot_url`, o usar una extensión como GoFullPage y subir el archivo.
