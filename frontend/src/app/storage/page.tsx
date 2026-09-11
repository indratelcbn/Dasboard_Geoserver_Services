'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { HardDrive, FolderOpen, FileText, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ErrorState, EmptyState } from '@/components/states';
import { fetcher, type FileStore, type StoreContents } from '@/lib/api';

export default function StoragePage() {
  const { data: stores, error, isLoading } = useSWR<FileStore[]>('/storage/stores', fetcher);
  const [selected, setSelected] = useState<{ workspace: string; name: string } | null>(null);
  const [q, setQ] = useState('');

  // Pilih otomatis store contoh (DSTIG_HNAS_STIG_STAGING) atau store pertama.
  useEffect(() => {
    if (!selected && stores && stores.length) {
      const preferred = stores.find((s) => s.name.includes('DSTIG_HNAS_STIG_STAGING')) ?? stores[0];
      setSelected({ workspace: preferred.workspace, name: preferred.name });
    }
  }, [stores, selected]);

  const filteredStores = useMemo(
    () =>
      (stores ?? []).filter((s) => {
        const needle = q.toLowerCase();
        return s.name.toLowerCase().includes(needle) || s.workspace.toLowerCase().includes(needle);
      }),
    [stores, q]
  );

  const key = selected
    ? `/storage/stores/${encodeURIComponent(selected.workspace)}/${encodeURIComponent(selected.name)}`
    : null;
  const { data: contents, isLoading: loadingFiles } = useSWR<StoreContents>(key, fetcher);

  return (
    <div>
      <Header title="NAS Storage" subtitle="Shapefile terpublikasi pada penyimpanan NAS" />
      <div className="grid gap-4 p-6 lg:grid-cols-[320px_1fr]">
        {/* Daftar store berbasis file */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4 text-primary" /> File Stores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari store…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>

            {error ? (
              <ErrorState message={error.message} />
            ) : isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : filteredStores.length === 0 ? (
              <EmptyState message="Tidak ada file store." />
            ) : (
              <div className="space-y-1">
                {filteredStores.map((s) => {
                  const active = selected?.workspace === s.workspace && selected?.name === s.name;
                  return (
                    <button
                      key={`${s.workspace}:${s.name}`}
                      onClick={() => setSelected({ workspace: s.workspace, name: s.name })}
                      className={
                        'flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ' +
                        (active
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent hover:bg-accent hover:text-accent-foreground')
                      }
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{s.workspace}</Badge>
                        {s.featureTypes} layer
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail file pada store terpilih */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4 w-4 text-primary" />
                {selected?.name ?? 'Pilih store'}
              </CardTitle>
              {contents &&
                (contents.accessible ? (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> NAS terbaca
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> NAS tak terbaca
                  </Badge>
                ))}
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Total ukuran</p>
                <p className="text-lg font-semibold">{contents?.totalSize ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Jumlah file</p>
                <p className="text-lg font-semibold">{contents?.fileCount ?? '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Path</p>
                <p className="truncate font-medium" title={contents?.path ?? ''}>
                  {contents?.path ?? '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          {!selected ? (
            <EmptyState message="Pilih file store untuk melihat detail." />
          ) : loadingFiles ? (
            <Skeleton className="h-64 w-full" />
          ) : !contents || contents.files.length === 0 ? (
            <EmptyState message="Tidak ada shapefile terpublikasi pada store ini." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>
                        <span className="inline-flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Layer
                        </span>
                      </TableHead>
                      <TableHead>File</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead>Modified</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contents.files.map((f, i) => (
                      <TableRow key={f.layer}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{f.layer}</TableCell>
                        <TableCell className="text-muted-foreground">{f.file}</TableCell>
                        <TableCell className="text-right">{f.size}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {f.modified ? new Date(f.modified).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>
                          {f.exists ? (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Ada
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <AlertTriangle className="h-3 w-3" /> Hilang
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
    </div>
  );
}
