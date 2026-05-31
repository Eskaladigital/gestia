/** Capa de texto en el mini editor (coordenadas normalizadas 0–1). */
export interface ImageTextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  /** Tamaño relativo al ancho de la imagen (p. ej. 0.06 ≈ 6 % del ancho). */
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
  /** Fondo semitransparente detrás del texto (pill). */
  withBackground: boolean;
}

export interface VisualImageFilter {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface VisualImageEditJson {
  version: 1;
  texts: ImageTextLayer[];
  filter: VisualImageFilter;
}

export const EMPTY_VISUAL_IMAGE_EDIT: VisualImageEditJson = {
  version: 1,
  texts: [],
  filter: { brightness: 100, contrast: 100, saturation: 100 },
};

export function parseVisualImageEditJson(raw: unknown): VisualImageEditJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  const texts: ImageTextLayer[] = [];
  if (Array.isArray(o.texts)) {
    for (const t of o.texts) {
      if (!t || typeof t !== 'object') continue;
      const layer = t as Record<string, unknown>;
      const id = typeof layer.id === 'string' ? layer.id : '';
      const text = typeof layer.text === 'string' ? layer.text : '';
      if (!id || !text.trim()) continue;
      texts.push({
        id,
        text,
        x: clamp01(Number(layer.x)),
        y: clamp01(Number(layer.y)),
        fontSize: clampFontSize(Number(layer.fontSize)),
        color: typeof layer.color === 'string' ? layer.color : '#ffffff',
        fontWeight: layer.fontWeight === 'bold' ? 'bold' : 'normal',
        align: layer.align === 'center' || layer.align === 'right' ? layer.align : 'left',
        withBackground: layer.withBackground === true,
      });
    }
  }
  const f = (o.filter && typeof o.filter === 'object' ? o.filter : {}) as Record<string, unknown>;
  return {
    version: 1,
    texts,
    filter: {
      brightness: clampFilter(Number(f.brightness), 100),
      contrast: clampFilter(Number(f.contrast), 100),
      saturation: clampFilter(Number(f.saturation), 100),
    },
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function clampFontSize(n: number): number {
  if (!Number.isFinite(n)) return 0.05;
  return Math.min(0.2, Math.max(0.02, n));
}

function clampFilter(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(200, Math.max(50, Math.round(n)));
}

export function createTextLayer(partial?: Partial<ImageTextLayer>): ImageTextLayer {
  return {
    id: crypto.randomUUID(),
    text: partial?.text ?? 'Tu texto',
    x: partial?.x ?? 0.5,
    y: partial?.y ?? 0.85,
    fontSize: partial?.fontSize ?? 0.055,
    color: partial?.color ?? '#ffffff',
    fontWeight: partial?.fontWeight ?? 'bold',
    align: partial?.align ?? 'center',
    withBackground: partial?.withBackground ?? true,
  };
}
