'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const items = [
  { label: 'Panel', href: '/administrator/dashboard' },
  { label: 'Proyectos', href: '/administrator/projects' },
  { label: 'Contenido', href: '/administrator/content' },
  { label: 'Usuarios', href: '/administrator/users' },
  { label: 'Config IA', href: '/settings/ai' },
] as const;

export function AdministratorSubnav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Administración"
      className="mb-8 pb-4 border-b-2 border-red-200 flex flex-wrap gap-2"
    >
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const external = item.href.startsWith('/settings');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'px-3 py-2 text-[11px] font-bold uppercase tracking-wider border-2 transition-colors',
              isActive
                ? 'bg-red-600 text-white border-red-600'
                : 'border-surface-200 text-red-700 hover:border-red-400 hover:bg-red-50',
              external && 'border-dashed'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
