'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Layers,
  Database,
  FolderTree,
  Palette,
  HardDrive,
  Map,
  Server,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workspaces', label: 'Workspaces', icon: FolderTree },
  { href: '/layers', label: 'Layers', icon: Layers },
  { href: '/styles', label: 'Styles', icon: Palette },
  { href: '/cache', label: 'Tile Cache (GWC)', icon: HardDrive },
  { href: '/database', label: 'PostGIS Database', icon: Database },
  { href: '/map', label: 'Map Preview', icon: Map },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-6 h-16 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Server className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">GeoServer</p>
          <p className="text-xs text-muted-foreground">Services Dashboard</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-xs text-muted-foreground">
        <p>Dashboard Geoserver Services</p>
        <p>v1.0.0</p>
      </div>
    </aside>
  );
}
