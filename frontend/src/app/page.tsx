'use client';

import useSWR from 'swr';
import {
  Layers,
  FolderTree,
  Palette,
  HardDrive,
  Database,
  Boxes,
  Server,
  Activity,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetcher, type HealthResponse } from '@/lib/api';

export default function DashboardPage() {
  const { data, isLoading } = useSWR<HealthResponse>('/health', fetcher, {
    refreshInterval: 30000,
  });

  const gs = data?.geoserver;
  const gwc = data?.geowebcache;
  const pg = data?.postgres;

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="Ringkasan layanan GeoServer, GeoWebCache, dan PostGIS"
      />

      <div className="space-y-6 p-6">
        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Workspaces" value={gs?.workspaces} icon={FolderTree} loading={isLoading} accent="primary" />
          <StatCard label="Layers" value={gs?.layers} icon={Layers} loading={isLoading} accent="blue" />
          <StatCard label="Layer Groups" value={gs?.layerGroups} icon={Boxes} loading={isLoading} accent="violet" />
          <StatCard label="Styles" value={gs?.styles} icon={Palette} loading={isLoading} accent="amber" />
          <StatCard label="Stores" value={gs?.stores} icon={Database} loading={isLoading} accent="rose" />
          <StatCard label="Cached Layers" value={gwc?.cachedLayers} icon={HardDrive} loading={isLoading} accent="primary" />
        </div>

        {/* Service status */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ServiceCard
            icon={Server}
            title="GeoServer"
            online={gs?.online}
            rows={[
              ['Version', gs?.version ?? '—'],
              ['Workspaces', String(gs?.workspaces ?? '—')],
              ['Layers', String(gs?.layers ?? '—')],
              ['Styles', String(gs?.styles ?? '—')],
            ]}
          />
          <ServiceCard
            icon={HardDrive}
            title="GeoWebCache"
            online={gwc?.online}
            rows={[
              ['Cached Layers', String(gwc?.cachedLayers ?? '—')],
              ['Grid Sets', String(gwc?.gridSets ?? '—')],
            ]}
          />
          <ServiceCard
            icon={Database}
            title="PostgreSQL / PostGIS"
            online={pg?.online}
            rows={[
              ['Server', pg?.version ? pg.version.split(' ').slice(0, 2).join(' ') : '—'],
              ['PostGIS', pg?.postgis ? pg.postgis.split(' ')[1] ?? 'installed' : '—'],
            ]}
          />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">System</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {data ? (
              <p>
                Last checked:{' '}
                <span className="font-medium text-foreground">
                  {new Date(data.timestamp).toLocaleString()}
                </span>
              </p>
            ) : (
              <p>Connecting to backend API…</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ServiceCard({
  icon: Icon,
  title,
  online,
  rows,
}: {
  icon: typeof Server;
  title: string;
  online: boolean | undefined;
  rows: [string, string][];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <StatusBadge online={online} />
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="max-w-[60%] truncate font-medium" title={v}>
              {v}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
