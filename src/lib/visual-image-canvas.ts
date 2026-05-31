import type { ImageTextLayer, VisualImageEditJson } from '@/lib/visual-image-edit';

function loadImageCrossOrigin(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = url;
  });
}

function filterCss(filter: VisualImageEditJson['filter']): string {
  const b = filter.brightness / 100;
  const c = filter.contrast / 100;
  const s = filter.saturation / 100;
  return `brightness(${b}) contrast(${c}) saturate(${s})`;
}

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageTextLayer,
  width: number,
  height: number,
) {
  const fontPx = Math.max(12, Math.round(layer.fontSize * width));
  const weight = layer.fontWeight === 'bold' ? 'bold' : 'normal';
  ctx.font = `${weight} ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = layer.color;
  ctx.textBaseline = 'middle';

  const lines = layer.text.split('\n');
  const lineHeight = fontPx * 1.25;
  const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width), 1);
  const blockHeight = lines.length * lineHeight;
  const x = layer.x * width;
  const y = layer.y * height;

  let textX = x;
  if (layer.align === 'center') {
    ctx.textAlign = 'center';
    textX = x;
  } else if (layer.align === 'right') {
    ctx.textAlign = 'right';
    textX = x;
  } else {
    ctx.textAlign = 'left';
    textX = x;
  }

  const padX = fontPx * 0.35;
  const padY = fontPx * 0.2;
  const boxLeft =
    layer.align === 'center'
      ? textX - maxLineWidth / 2 - padX
      : layer.align === 'right'
        ? textX - maxLineWidth - padX
        : textX - padX;
  const boxTop = y - blockHeight / 2 - padY;
  const boxW = maxLineWidth + padX * 2;
  const boxH = blockHeight + padY * 2;

  if (layer.withBackground) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const r = Math.min(12, fontPx * 0.25);
    roundRect(ctx, boxLeft, boxTop, boxW, boxH, r);
    ctx.fill();
    ctx.restore();
  }

  lines.forEach((line, i) => {
    const ly = y - blockHeight / 2 + lineHeight / 2 + i * lineHeight;
    ctx.fillStyle = layer.color;
    ctx.fillText(line, textX, ly);
  });
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
