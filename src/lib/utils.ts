import { clsx, type ClassValue } from 'clsx';

/** Agencia que desarrolla Gestia RRSS — https://www.eskaladigital.com/ */
export const ESKALA_MARKETING_DIGITAL = {
  name: 'Eskala Marketing Digital',
  url: 'https://www.eskaladigital.com/',
  tagline: 'Hecho con 🧡 en Murcia',
} as const;

/**
 * Base URL de la ficha de proyecto.
 * Usuario normal: siempre `/projects/:id` (nunca usa el prefijo `/administrator`).
 * Admin: `/administrator/projects/:id` para mantener la URL dentro del área de administración.
 */
export function projectDashboardBasePath(projectId: string, asAdministrator: boolean): string {
  return asAdministrator ? `/administrator/projects/${projectId}` : `/projects/${projectId}`;
}

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | Date, locale = 'es-ES'): string {
  return new Date(date).toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateShort(date: string | Date): string {
  return new Date(date).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  });
}

export function getMonthName(month: number): string {
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return months[month] || 'enero';
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

/**
 * PNG con la imagen volteada en horizontal (equivalente a `transform: scaleX(-1)` en pantalla).
 * Carga desde un blob en object URL para no contaminar el canvas con CORS.
 */
export async function imageBlobFlippedHorizontally(imageBlob: Blob): Promise<Blob | null> {
  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(imageBlob);
    const img = await loadImageFromSrc(objectUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob | null>(resolve => {
      canvas.toBlob(b => resolve(b), 'image/png', 0.92);
    });
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export type DownloadImageFromUrlOptions = { flipHorizontal?: boolean };

/**
 * Descarga una imagen desde URL. Con `flipHorizontal`, el archivo coincide con la vista en espejo (exporta PNG).
 */
export async function downloadImageFromUrl(
  url: string,
  filename: string,
  options?: DownloadImageFromUrlOptions,
): Promise<void> {
  const flip = options?.flipHorizontal ?? false;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    let outBlob = blob;
    let outFilename = filename;
    if (flip) {
      const flipped = await imageBlobFlippedHorizontally(blob);
      if (flipped) {
        outBlob = flipped;
        if (!outFilename.toLowerCase().endsWith('.png')) {
          outFilename = `${outFilename.replace(/\.[^.]+$/, '')}.png`;
        }
      }
    }
    const blobUrl = URL.createObjectURL(outBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = outFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}
