'use client';

import useSWR from 'swr';
import { Database, MapPin } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ErrorState, EmptyState } from '@/components/states';
import { fetcher, type PgTable } from '@/lib/api';
import { formatNumber } from '@/lib/utils';

interface PgStatus {
  online: boolean;
  version: string | null;
  postgis: string | null;
}

export default function DatabasePage() {
  const { data: status } = useSWR<PgStatus>('/postgres/status', fetcher);
  const { data: tables, error, isLoading } = useSWR<PgTable[]>('/postgres/tables', fetcher);

  return (
    <div>
      <Header title="PostGIS Database" subtitle="Tabel dan layer spasial pada PostgreSQL" />
      <div className="space-y-4 p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" /> Connection
            </CardTitle>
            <StatusBadge online={status?.online} />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Server</span>
              <span className="max-w-[70%] truncate font-medium" title={status?.version ?? ''}>
                {status?.version ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">PostGIS</span>
              <span className="max-w-[70%] truncate font-medium" title={status?.postgis ?? ''}>
                {status?.postgis ?? '—'}
              </span>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <ErrorState message={error.message} />
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !tables || tables.length === 0 ? (
          <EmptyState message="Tidak ada tabel ditemukan." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Schema</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Rows (est.)</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((t) => (
                    <TableRow key={`${t.schema}.${t.table}`}>
                      <TableCell className="text-muted-foreground">{t.schema}</TableCell>
                      <TableCell className="font-medium">{t.table}</TableCell>
                      <TableCell className="text-right">{formatNumber(t.rows)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{t.size}</TableCell>
                      <TableCell>
                        {t.hasGeometry ? (
                          <Badge variant="success" className="gap-1">
                            <MapPin className="h-3 w-3" /> Spatial
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Table</Badge>
                        )}
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
