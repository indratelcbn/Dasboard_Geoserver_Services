'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Database, MapPin, Server, AlertTriangle } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, EmptyState } from '@/components/states';
import { fetcher, type PgTable, type PostgresStatus, type PostgresTarget } from '@/lib/api';
import { formatNumber } from '@/lib/utils';

const IMPORT_REFRESH_EVENT = 'shapefile-import:done';

export default function DatabasePage() {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const { data: targets, error: targetsError, isLoading: isTargetsLoading } = useSWR<PostgresTarget[]>(
    '/postgres/targets',
    fetcher
  );
  const activeTarget = selectedTarget ?? targets?.[0]?.id ?? null;
  const targetQuery = activeTarget ? `?target=${encodeURIComponent(activeTarget)}` : null;
  const { data: status, error: statusError, mutate: mutateStatus } = useSWR<PostgresStatus>(
    targetQuery ? `/postgres/status${targetQuery}` : null,
    fetcher
  );
  const {
    data: tables,
    error: tablesError,
    isLoading: isTablesLoading,
    mutate: mutateTables,
  } = useSWR<PgTable[]>(targetQuery ? `/postgres/tables${targetQuery}` : null, fetcher);
  const error = targetsError ?? statusError ?? tablesError;
  const isLoading = isTargetsLoading || (Boolean(targetQuery) && !tables && !tablesError);

  useEffect(() => {
    const refresh = () => {
      void mutateStatus();
      void mutateTables();
    };

    const onImportDone = () => refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'shapefile-import:last-success') {
        refresh();
      }
    };

    window.addEventListener(IMPORT_REFRESH_EVENT, onImportDone);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(IMPORT_REFRESH_EVENT, onImportDone);
      window.removeEventListener('storage', onStorage);
    };
  }, [mutateStatus, mutateTables]);

  return (
    <div>
      <Header title="PostGIS Database" subtitle="Tabel dan layer spasial pada beberapa target PostgreSQL" />
      <div className="space-y-4 p-6">
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4 text-primary" /> Targets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {targets?.map((target) => (
                <Button
                  key={target.id}
                  variant={activeTarget === target.id ? 'default' : 'outline'}
                  className="h-auto w-full justify-start px-4 py-3 text-left"
                  onClick={() => setSelectedTarget(target.id)}
                >
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{target.name}</span>
                    <span className="text-xs opacity-80">{`${target.host}:${target.port}/${target.database}`}</span>
                  </span>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-primary" /> Connection
              </CardTitle>
              <StatusBadge online={status?.online} />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Target</span>
                <span className="max-w-[70%] truncate font-medium" title={status?.name ?? ''}>
                  {status?.name ?? '—'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Endpoint</span>
                <span
                  className="max-w-[70%] truncate font-medium"
                  title={status ? `${status.host}:${status.port}/${status.database}` : ''}
                >
                  {status ? `${status.host}:${status.port}/${status.database}` : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Server</span>
                <span className="max-w-[70%] truncate font-medium" title={status?.version ?? ''}>
                  {status?.version ?? '—'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">PostGIS</span>
                <span className="max-w-[70%] truncate font-medium" title={status?.postgis ?? ''}>
                  {status?.postgis ?? '—'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {error ? (
          <ErrorState message={error.message} />
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !activeTarget ? (
          <EmptyState message="Belum ada target PostGIS yang dikonfigurasi." />
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
                    <TableHead>Layer</TableHead>
                    <TableHead className="text-right">Rows (est.)</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((t) => (
                    <TableRow key={`${t.schema}.${t.table}`}>
                      <TableCell className="text-muted-foreground">{t.schema}</TableCell>
                      <TableCell className="font-medium">{t.table}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.layers.length > 0 ? t.layers.join(', ') : '—'}
                      </TableCell>
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
                      <TableCell>
                        {t.published ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Published
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Unpublished
                          </Badge>
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
