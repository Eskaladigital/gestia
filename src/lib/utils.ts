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
