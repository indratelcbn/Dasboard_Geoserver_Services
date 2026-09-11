'use client';

import useSWR from 'swr';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { fetcher, type HealthResponse } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { data, isLoading, mutate } = useSWR<HealthResponse>('/health', fetcher, {
    refreshInterval: 30000,
  });

  const services = [
    { label: 'GeoServer', online: data?.geoserver.online },
    { label: 'GWC', online: data?.geowebcache.online },
    { label: 'PostGIS', online: data?.postgres.online },
  ];

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {services.map((s) => (
            <Badge
              key={s.label}
              variant={s.online ? 'success' : isLoading ? 'secondary' : 'destructive'}
              className="gap-1"
            >
              {s.online ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {s.label}
            </Badge>
          ))}
        </div>
        <Button variant="outline" size="icon" onClick={() => mutate()} title="Refresh">
          <RefreshCw className={isLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>
    </header>
  );
}
