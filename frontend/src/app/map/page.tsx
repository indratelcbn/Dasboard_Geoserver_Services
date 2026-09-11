'use client';

import { Suspense, useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Map as MapIcon, Layers } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { MapView } from '@/components/map-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fetcher, type NamedRef, type GsEndpoints } from '@/lib/api';

function MapContent() {
  const params = useSearchParams();
  const initialLayer = params.get('layer') ?? undefined;

  const { data: endpoints } = useSWR<GsEndpoints>('/geoserver/endpoints', fetcher);
  const { data: layers, isLoading } = useSWR<NamedRef[]>('/geoserver/layers', fetcher);

  const [selected, setSelected] = useState<string | undefined>(initialLayer);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (initialLayer) setSelected(initialLayer);
  }, [initialLayer]);

  const filtered = useMemo(
    () => (layers ?? []).filter((l) => l.name.toLowerCase().includes(q.toLowerCase())),
    [layers, q]
  );

  return (
    <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-[320px_1fr]">
      {/* Layer picker */}
      <Card className="flex flex-col overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" /> Layers
          </CardTitle>
          <Input placeholder="Cari layer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '65vh' }}>
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((layer) => (
                <li key={layer.name}>
                  <button
                    onClick={() => setSelected(layer.name)}
                    className={cn(
                      'w-full truncate rounded-md px-3 py-2 text-left text-sm transition-colors',
                      selected === layer.name
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    )}
                    title={layer.name}
                  >
                    {layer.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Map */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapIcon className="h-4 w-4 text-primary" />
            {selected ? selected : 'Pilih layer untuk preview'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[65vh] w-full">
            <MapView wmsUrl={endpoints?.wms} layerName={selected} className="h-full w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MapPage() {
  return (
    <div>
      <Header title="Map Preview" subtitle="Visualisasi layer GeoServer via WMS (OpenLayers)" />
      <Suspense fallback={<div className="p-6"><Skeleton className="h-[70vh] w-full" /></div>}>
        <MapContent />
      </Suspense>
    </div>
  );
}
