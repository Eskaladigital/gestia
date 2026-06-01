/** Familias tipográficas disponibles en el editor (estilo Instagram). */
export type TextFontFamily = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting' | 'script';

/** Fondo detrás del texto. */
export type TextBackground = 'none' | 'translucent' | 'solid';

/** Efecto aplicado al texto. */
export type TextEffect = 'none' | 'shadow' | 'outline' | 'neon';

/** Capa de texto en el mini editor (coordenadas normalizadas 0–1). */
export interface ImageTextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  /** Tamaño relativo al ancho de la imagen (p. ej. 0.06 ≈ 6 % del ancho). */
  fontSize: number;
  color: string;
  fontFamily: TextFontFamily;
  fontWeight: 'normal' | 'bold';
  italic: boolean;
  uppercase: boolean;
  align: 'left' | 'center' | 'right';
  /** Caja detrás del texto. */
  background: TextBackground;
  /** Color de la caja cuando background = 'solid'. */
  backgroundColor: string;
  /** Efecto visual sobre el texto (sombra, contorno, neón). */
  effect: TextEffect;
  /** Espaciado entre letras relativo al tamaño de fuente (0 = normal). */
  letterSpacing: number;
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

/** Opciones de tipografía para el selector del editor. */
export const FONT_FAMILY_OPTIONS: Array<{ id: TextFontFamily; label: string }> = [
  { id: 'sans', label: 'Moderna' },
  { id: 'serif', label: 'Elegante' },
  { id: 'display', label: 'Impacto' },
  { id: 'handwriting', label: 'Manuscrita' },
  { id: 'script', label: 'Caligrafía' },
  { id: 'mono', label: 'Máquina' },
];

/**
 * Estilos rápidos tipo Instagram. Cada uno aplica una combinación de
 * tipografía, efecto y fondo de una sola vez (el usuario puede afinar luego).
 */
export const TEXT_STYLE_PRESETS: Array<{
  id: string;
  label: string;
  patch: Partial<ImageTextLayer>;
}> = [
  {
    id: 'clasico',
    label: 'Clásico',
    patch: {
      fontFamily: 'sans',
      fontWeight: 'bold',
      italic: false,
      uppercase: false,
      background: 'translucent',
      effect: 'none',
      letterSpacing: 0,
    },
  },
  {
    id: 'moderno',
    label: 'Moderno',
    patch: {
      fontFamily: 'sans',
      fontWeight: 'bold',
      italic: false,
      uppercase: false,
      background: 'none',
      effect: 'shadow',
      letterSpacing: 0,
    },
  },
  {
    id: 'neon',
    label: 'Neón',
    patch: {
      fontFamily: 'sans',
      fontWeight: 'bold',
      italic: false,
      uppercase: false,
      background: 'none',
      effect: 'neon',
      color: '#ffffff',
      letterSpacing: 0.01,
    },
  },
  {
    id: 'elegante',
    label: 'Elegante',
    patch: {
      fontFamily: 'serif',
      fontWeight: 'normal',
      italic: true,
      uppercase: false,
      background: 'none',
      effect: 'shadow',
      letterSpacing: 0,
    },
  },
  {
    id: 'manuscrito',
    label: 'Manuscrito',
    patch: {
      fontFamily: 'handwriting',
      fontWeight: 'bold',
      italic: false,
      uppercase: false,
      background: 'none',
      effect: 'shadow',
      letterSpacing: 0,
    },
  },
  {
    id: 'fuerte',
    label: 'Fuerte',
    patch: {
      fontFamily: 'display',
      fontWeight: 'bold',
      italic: false,
      uppercase: true,
      background: 'none',
      effect: 'outline',
      letterSpacing: 0.02,
    },
  },
  {
    id: 'maquina',
    label: 'Máquina',
    patch: {
      fontFamily: 'mono',
      fontWeight: 'normal',
      italic: false,
      uppercase: false,
      background: 'solid',
      backgroundColor: '#000000',
      effect: 'none',
      letterSpacing: 0,
    },
  },
];

const VALID_FONTS: TextFontFamily[] = ['sans', 'serif', 'mono', 'display', 'handwriting', 'script'];
const VALID_BACKGROUNDS: TextBackground[] = ['none', 'translucent', 'solid'];
const VALID_EFFECTS: TextEffect[] = ['none', 'shadow', 'outline', 'neon'];

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

      // Compatibilidad hacia atrás: el modelo anterior usaba `withBackground`.
      const legacyBackground =
        layer.withBackground === true ? 'translucent' : undefined;

      texts.push({
        id,
        text,
        x: clamp01(Number(layer.x)),
        y: clamp01(Number(layer.y)),
        fontSize: clampFontSize(Number(layer.fontSize)),
        color: typeof layer.color === 'string' ? layer.color : '#ffffff',
        fontFamily: VALID_FONTS.includes(layer.fontFamily as TextFontFamily)
          ? (layer.fontFamily as TextFontFamily)
          : 'sans',
        fontWeight: layer.fontWeight === 'normal' ? 'normal' : 'bold',
        italic: layer.italic === true,
        uppercase: layer.uppercase === true,
        align: layer.align === 'left' || layer.align === 'right' ? layer.align : 'center',
        background: VALID_BACKGROUNDS.includes(layer.background as TextBackground)
          ? (layer.background as TextBackground)
          : legacyBackground ?? 'none',
        backgroundColor:
          typeof layer.backgroundColor === 'string' ? layer.backgroundColor : '#000000',
        effect: VALID_EFFECTS.includes(layer.effect as TextEffect)
          ? (layer.effect as TextEffect)
          : 'none',
        letterSpacing: clampLetterSpacing(Number(layer.letterSpacing)),
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

function clampLetterSpacing(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(0.3, Math.max(-0.05, n));
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
    fontSize: partial?.fontSize ?? 0.06,
    color: partial?.color ?? '#ffffff',
    fontFamily: partial?.fontFamily ?? 'sans',
    fontWeight: partial?.fontWeight ?? 'bold',
    italic: partial?.italic ?? false,
    uppercase: partial?.uppercase ?? false,
    align: partial?.align ?? 'center',
    background: partial?.background ?? 'translucent',
    backgroundColor: partial?.backgroundColor ?? '#000000',
    effect: partial?.effect ?? 'none',
    letterSpacing: partial?.letterSpacing ?? 0,
  };
}
