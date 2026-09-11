'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Layers, Search, Eye } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, EmptyState } from '@/components/states';
import { fetcher, type NamedRef } from '@/lib/api';

export default function LayersPage() {
  const { data, error, isLoading } = useSWR<NamedRef[]>('/geoserver/layers', fetcher);
  const [q, setQ] = useState('');

  const filtered = useMemo(
    () => (data ?? []).filter((l) => l.name.toLowerCase().includes(q.toLowerCase())),
    [data, q]
  );

  return (
    <div>
      <Header title="Layers" subtitle="Layer yang dipublikasikan pada GeoServer" />
      <div className="space-y-4 p-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari layer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>

        {error ? (
          <ErrorState message={error.message} />
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : filtered.length === 0 ? (
          <EmptyState message="Tidak ada layer yang cocok." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-2">
                        <Layers className="h-4 w-4" /> Layer
                      </span>
                    </TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((layer, i) => {
                    const ws = layer.name.includes(':') ? layer.name.split(':')[0] : '—';
                    return (
                      <TableRow key={layer.name}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{layer.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ws}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/map?layer=${encodeURIComponent(layer.name)}`}>
                              <Eye className="mr-1 h-4 w-4" /> Preview
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
