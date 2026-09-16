'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { HardDrive, Trash2, Grid3x3, FolderOpen } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ErrorState, EmptyState } from '@/components/states';
import { fetcher, apiFetch } from '@/lib/api';

interface GwcSummary {
  cachedLayers: number;
  gridSets: number;
  online: boolean;
}

interface LayerCacheInfo {
  name: string;
  blobStoreId: string | null;
  cachePath: string;
  cacheSize: number | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function CachePage() {
  const { data: summary } = useSWR<GwcSummary>('/gwc/summary', fetcher);
  const { data: layers, error, isLoading, mutate } = useSWR<LayerCacheInfo[]>('/gwc/layers-info', fetcher);
  const [busy, setBusy] = useState<string | null>(null);

  async function truncate(name: string) {
    if (!confirm(`Kosongkan cache untuk layer "${name}"?`)) return;
    setBusy(name);
    try {
      await apiFetch(`/gwc/layers/${encodeURIComponent(name)}/truncate`, { method: 'POST' });
      await mutate();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Header title="Tile Cache (GeoWebCache)" subtitle="Kelola cache tile GeoServer" />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Cached Layers" value={summary?.cachedLayers} icon={HardDrive} accent="primary" />
          <StatCard label="Grid Sets" value={summary?.gridSets} icon={Grid3x3} accent="blue" />
        </div>

        {error ? (
          <ErrorState message={error.message} />
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !layers || layers.length === 0 ? (
          <EmptyState message="Tidak ada layer yang di-cache." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Cached Layer</TableHead>
                    <TableHead className="w-32 text-right">Ukuran Cache</TableHead>
                    <TableHead>Lokasi Cache</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {layers.map((layer, i) => (
                    <TableRow key={layer.name}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{layer.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBytes(layer.cacheSize)}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono break-all">
                          <FolderOpen className="h-3 w-3 shrink-0" />
                          {layer.cachePath}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === layer.name}
                          onClick={() => truncate(layer.name)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          {busy === layer.name ? 'Truncating…' : 'Truncate'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

