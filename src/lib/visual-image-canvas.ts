import type { ImageTextLayer, TextFontFamily, VisualImageEditJson } from '@/lib/visual-image-edit';

function loadImageCrossOrigin(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = url;
  });
}

/** Stack tipográfico real por familia (con fallbacks del sistema). */
export const FONT_STACKS: Record<TextFontFamily, string> = {
  sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: '"Playfair Display", Georgia, "Times New Roman", serif',
  mono: '"Courier New", ui-monospace, "Cascadia Mono", monospace',
  display: 'Anton, Impact, "Arial Narrow Bold", "Arial Narrow", sans-serif',
  handwriting: 'Caveat, "Comic Sans MS", "Segoe Script", cursive',
  script: '"Dancing Script", "Brush Script MT", "Snell Roundhand", cursive',
};

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Anton&family=Caveat:wght@700&family=Dancing+Script:wght@700&family=Playfair+Display:ital,wght@0,400;0,700;1,600&display=swap';

let fontsPromise: Promise<void> | null = null;

/**
 * Carga las tipografías de Google usadas por el editor (Anton, Caveat,
 * Dancing Script, Playfair Display) y espera a que estén listas para que el
 * canvas (preview Y export) las pinte igual. Si falla (sin red), cae a los
 * fallbacks del sistema sin bloquear.
 */
export function loadEditorFonts(): Promise<void> {
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('editor-google-fonts')) {
      const link = document.createElement('link');
      link.id = 'editor-google-fonts';
      link.rel = 'stylesheet';
      link.href = GOOGLE_FONTS_HREF;
      document.head.appendChild(link);
    }
    const anyDoc = document as Document & { fonts?: FontFaceSet };
    if (!anyDoc.fonts) return;
    const specs = [
      '400 32px "Anton"',
      '700 32px "Caveat"',
      '700 32px "Dancing Script"',
      '700 32px "Playfair Display"',
      'italic 600 32px "Playfair Display"',
    ];
    try {
      await Promise.all(specs.map(spec => anyDoc.fonts!.load(spec).catch(() => undefined)));
      await anyDoc.fonts.ready;
    } catch {
      /* sin red: usamos fallbacks del sistema */
    }
  })();
  return fontsPromise;
}

function filterCss(filter: VisualImageEditJson['filter']): string {
  const b = filter.brightness / 100;
  const c = filter.contrast / 100;
  const s = filter.saturation / 100;
  return `brightness(${b}) contrast(${c}) saturate(${s})`;
}

type CtxWithSpacing = CanvasRenderingContext2D & { letterSpacing?: string };

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageTextLayer,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.globalAlpha = layer.opacity;

  const x = layer.x * width;
  const y = layer.y * height;

  // Movemos el origen al centro del texto para poder rotar
  ctx.translate(x, y);
  if (layer.rotation !== 0) {
    ctx.rotate((layer.rotation * Math.PI) / 180);
  }

  const fontPx = Math.max(12, Math.round(layer.fontSize * width));
  const weight = layer.fontWeight === 'bold' ? '700' : '400';
  const style = layer.italic ? 'italic ' : '';
  ctx.font = `${style}${weight} ${fontPx}px ${FONT_STACKS[layer.fontFamily] || FONT_STACKS.sans}`;
  ctx.textBaseline = 'middle';

  const spacingCtx = ctx as CtxWithSpacing;
  const spacingSupported = 'letterSpacing' in spacingCtx;
  if (spacingSupported) {
    spacingCtx.letterSpacing = `${layer.letterSpacing * fontPx}px`;
  }

  const rawLines = layer.text.split('\n');
  const lines = layer.uppercase ? rawLines.map(l => l.toUpperCase()) : rawLines;
  const lineHeight = fontPx * 1.28;
  const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width), 1);
  const blockHeight = lines.length * lineHeight;

  ctx.textAlign = layer.align === 'center' ? 'center' : layer.align === 'right' ? 'right' : 'left';
  // Como hemos trasladado el contexto a (x,y), ahora las coordenadas son relativas a (0,0)
  const textX = 0;
  const textY = 0;

  // --- Fondo (caja) ---
  if (layer.background !== 'none') {
    const padX = fontPx * 0.4;
    const padY = fontPx * 0.26;
    const boxLeft =
      layer.align === 'center'
        ? textX - maxLineWidth / 2 - padX
        : layer.align === 'right'
          ? textX - maxLineWidth - padX
          : textX - padX;
    const boxTop = textY - blockHeight / 2 - padY;
    const boxW = maxLineWidth + padX * 2;
    const boxH = blockHeight + padY * 2;
    ctx.save();
    ctx.fillStyle =
      layer.background === 'solid' ? layer.backgroundColor : 'rgba(0,0,0,0.42)';
    const r = Math.min(fontPx * 0.35, boxH / 2);
    roundRect(ctx, boxLeft, boxTop, boxW, boxH, r);
    ctx.fill();
    ctx.restore();
  }

  // --- Texto con efecto ---
  lines.forEach((line, i) => {
    const ly = textY - blockHeight / 2 + lineHeight / 2 + i * lineHeight;

    ctx.save();

    if (layer.effect === 'neon') {
      // Resplandor: varias pasadas con sombra del propio color.
      ctx.shadowColor = layer.color;
      ctx.fillStyle = layer.color;
      for (let pass = 0; pass < 3; pass++) {
        ctx.shadowBlur = fontPx * (0.55 + pass * 0.25);
        ctx.fillText(line, textX, ly);
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, textX, ly);
    } else if (layer.effect === 'outline') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, fontPx * 0.09);
      ctx.strokeStyle = isLightColor(layer.color) ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)';
      ctx.strokeText(line, textX, ly);
      ctx.fillStyle = layer.color;
      ctx.fillText(line, textX, ly);
    } else {
      if (layer.effect === 'shadow') {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = fontPx * 0.14;
        ctx.shadowOffsetX = fontPx * 0.02;
        ctx.shadowOffsetY = fontPx * 0.06;
      }
      ctx.fillStyle = layer.color;
      ctx.fillText(line, textX, ly);
    }

    ctx.restore();
  });

  if (spacingSupported) {
    spacingCtx.letterSpacing = '0px';
  }

  // Restauramos el context (rotación, traslación, opacidad)
  ctx.restore();
}

/** Heurística simple para decidir el color del contorno según el relleno. */
function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Compone la imagen base (con espejo opcional), filtros y capas de texto en un PNG.
 */
export async function renderVisualCompositeToBlob(options: {
  baseImageUrl: string;
  flipHorizontal: boolean;
  edit: VisualImageEditJson;
}): Promise<Blob> {
  await loadEditorFonts();
  const img = await loadImageCrossOrigin(options.baseImageUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error('Imagen sin dimensiones válidas');

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');

  ctx.save();
  if (options.flipHorizontal) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.filter = filterCss(options.edit.filter);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();

  for (const layer of options.edit.texts) {
    drawTextLayer(ctx, layer, w, h);
  }

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(b => resolve(b), 'image/png', 0.92);
  });
  if (!blob) throw new Error('No se pudo exportar la imagen');
  return blob;
}

/** Dibuja la composición en un canvas de preview (tamaño de pantalla). */
export async function paintVisualCompositeOnCanvas(
  canvas: HTMLCanvasElement,
  options: {
    baseImageUrl: string;
    flipHorizontal: boolean;
    edit: VisualImageEditJson;
  },
): Promise<{ scale: number; width: number; height: number }> {
  await loadEditorFonts();
  const img = await loadImageCrossOrigin(options.baseImageUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const parent = canvas.parentElement;
  const maxW = parent?.clientWidth ?? 640;
  const maxH = parent?.clientHeight ?? 480;
  const scale = Math.min(maxW / w, maxH / h, 1);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  if (options.flipHorizontal) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.filter = filterCss(options.edit.filter);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.scale(scale, scale);
  for (const layer of options.edit.texts) {
    drawTextLayer(ctx, layer, w, h);
  }
  ctx.restore();

  return { scale, width: w, height: h };
}

/** Convierte coordenadas de clic en el canvas preview a normalizadas (0–1). */
export function canvasPointerToNormalized(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  naturalWidth: number,
  naturalHeight: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = naturalWidth / canvas.width;
  const scaleY = naturalHeight / canvas.height;
  const px = ((clientX - rect.left) / rect.width) * canvas.width * scaleX;
  const py = ((clientY - rect.top) / rect.height) * canvas.height * scaleY;
  return {
    x: Math.min(1, Math.max(0, px / naturalWidth)),
    y: Math.min(1, Math.max(0, py / naturalHeight)),
  };
}
