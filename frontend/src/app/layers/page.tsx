'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { Layers, Search, Eye, Database, Map, FileJson, Upload, LoaderCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, EmptyState } from '@/components/states';
import {
  fetcher,
  uploadShapefileImport,
  type GeoServerPostgisStore,
  type LayerDetail,
  type PostgresTarget,
  type ShapefileImportJob,
  type Workspace,
} from '@/lib/api';

const IMPORT_REFRESH_EVENT = 'shapefile-import:done';

export default function LayersPage() {
  const { data, error, isLoading, mutate: mutateLayers } = useSWR<LayerDetail[]>('/geoserver/layers', fetcher);
  const { data: targets } = useSWR<PostgresTarget[]>('/postgres/targets', fetcher);
  const { data: workspaces } = useSWR<Workspace[]>('/geoserver/workspaces', fetcher);
  const [q, setQ] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [schema, setSchema] = useState('public');
  const [storeName, setStoreName] = useState('');
  const [layerName, setLayerName] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [announcedJobId, setAnnouncedJobId] = useState<string | null>(null);
  const activePollingInterval = polling ? 1500 : 0;
  const { data: jobs, mutate: mutateJobs } = useSWR<ShapefileImportJob[]>('/geoserver/imports', fetcher, {
    refreshInterval: activePollingInterval,
  });
  const { data: activeJob } = useSWR<ShapefileImportJob>(
    activeJobId ? `/geoserver/imports/${activeJobId}` : null,
    fetcher,
    { refreshInterval: polling ? 1500 : 0 }
  );
  const storeKey =
    selectedWorkspace && selectedTarget
      ? `/geoserver/workspaces/${encodeURIComponent(selectedWorkspace)}/postgis-stores?target=${encodeURIComponent(selectedTarget)}`
      : null;
  const { data: postgisStores } = useSWR<GeoServerPostgisStore[]>(storeKey, fetcher);

  useEffect(() => {
    if (!selectedTarget && targets?.length) {
      setSelectedTarget(targets[0].id);
    }
  }, [targets, selectedTarget]);

  useEffect(() => {
    if (!selectedWorkspace && workspaces?.length) {
      setSelectedWorkspace(workspaces[0].name);
    }
  }, [workspaces, selectedWorkspace]);

  useEffect(() => {
    if (!postgisStores) return;

    if (postgisStores.length === 0) {
      setStoreName('');
      return;
    }

    const exists = postgisStores.some((store) => store.name === storeName);
    if (!exists) {
      setStoreName(postgisStores[0].name);
    }
  }, [postgisStores, storeName]);

  useEffect(() => {
    if (activeJob?.status === 'done' || activeJob?.status === 'failed') {
      setPolling(false);
    }

    if (activeJob?.status === 'done' && activeJob.id !== announcedJobId) {
      void mutateLayers();
      void mutateJobs();
      void globalMutate('/health');

      targets?.forEach((target) => {
        void globalMutate(`/postgres/status?target=${encodeURIComponent(target.id)}`);
        void globalMutate(`/postgres/tables?target=${encodeURIComponent(target.id)}`);
      });

      const payload = JSON.stringify({
        jobId: activeJob.id,
        layer: activeJob.result?.qualifiedLayer ?? null,
        targetId: activeJob.targetId,
        at: activeJob.updatedAt,
      });

      window.localStorage.setItem('shapefile-import:last-success', payload);
      window.dispatchEvent(new CustomEvent(IMPORT_REFRESH_EVENT, { detail: payload }));
      setAnnouncedJobId(activeJob.id);
    }
  }, [activeJob, announcedJobId, mutateJobs, mutateLayers, targets]);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setUploadError('Pilih file ZIP shapefile terlebih dahulu.');
      return;
    }

    if (!selectedTarget || !selectedWorkspace) {
      setUploadError('Target PostGIS dan workspace GeoServer wajib dipilih.');
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.zip')) {
      setUploadError('File upload harus berekstensi .zip.');
      return;
    }

    setSubmitting(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      const job = await uploadShapefileImport(
        {
          file: selectedFile,
          targetId: selectedTarget,
          workspace: selectedWorkspace,
          schema,
          storeName,
          layerName,
          overwrite,
        },
        (progress) => setUploadProgress(progress)
      );

      setActiveJobId(job.id);
      setPolling(true);
      void mutateJobs();
      setSelectedFile(null);
      setLayerName('');
      setUploadProgress(null);
    } catch (uploadErr) {
      setUploadError(uploadErr instanceof Error ? uploadErr.message : 'Upload shapefile gagal.');
    } finally {
      setSubmitting(false);
    }
  }

  const targetButtons = targets ?? [];
  const jobProgress = activeJob ? activeJob.progress : null;
  const jobBusy = activeJob?.status === 'queued' || activeJob?.status === 'running';
  const recentJobs = jobs ?? [];

  const filtered = useMemo(
    () =>
      (data ?? []).filter((l) => {
        const needle = q.toLowerCase();
        return (
          l.name.toLowerCase().includes(needle) ||
          (l.store ?? '').toLowerCase().includes(needle) ||
          (l.type ?? '').toLowerCase().includes(needle)
        );
      }),
    [data, q]
  );

  return (
    <div>
      <Header title="Layers" subtitle="Layer yang dipublikasikan pada GeoServer" />
      <div className="space-y-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4 text-primary" /> Import ZIP Shapefile ke PostGIS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleUpload}>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2 xl:col-span-2">
                  <label className="text-sm font-medium">File ZIP shapefile</label>
                  <Input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Arsip wajib berisi pasangan file `.shp`, `.shx`, dan `.dbf`.
                  </p>
                </div>

                <div className="space-y-2 xl:col-span-2">
                  <label className="text-sm font-medium">Target PostGIS</label>
                  <div className="flex flex-wrap gap-2">
                    {targetButtons.map((target) => (
                      <Button
                        key={target.id}
                        type="button"
                        variant={selectedTarget === target.id ? 'default' : 'outline'}
                        className="h-auto justify-start px-4 py-3 text-left"
                        onClick={() => setSelectedTarget(target.id)}
                      >
                        <span className="flex flex-col items-start">
                          <span className="font-medium">{target.name}</span>
                          <span className="text-xs opacity-80">{`${target.host}:${target.port}/${target.database}`}</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Workspace GeoServer</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedWorkspace}
                    onChange={(event) => setSelectedWorkspace(event.target.value)}
                  >
                    <option value="">Pilih workspace</option>
                    {(workspaces ?? []).map((workspace) => (
                      <option key={workspace.name} value={workspace.name}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Schema PostGIS</label>
                  <Input value={schema} onChange={(event) => setSchema(event.target.value)} placeholder="public" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Datastore GeoServer</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={storeName}
                    onChange={(event) => setStoreName(event.target.value)}
                  >
                    <option value="">Buat datastore otomatis</option>
                    {(postgisStores ?? []).map((store) => (
                      <option key={store.name} value={store.name}>
                        {store.name}
                        {store.schema ? ` (${store.schema})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Datastore diambil otomatis dari GeoServer berdasarkan workspace dan target PostGIS.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Nama layer tujuan</label>
                  <Input
                    value={layerName}
                    onChange={(event) => setLayerName(event.target.value)}
                    placeholder="Kosongkan untuk pakai nama dari ZIP"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(event) => setOverwrite(event.target.checked)}
                />
                Overwrite tabel/layer jika sudah ada
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={submitting || jobBusy || !selectedFile}>
                  {submitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload, Import, dan Publish
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedFile ? selectedFile.name : 'Belum ada file dipilih'}
                </span>
              </div>
            </form>

            {uploadError && <ErrorState message={uploadError} />}

            {(submitting || activeJob) && (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium">{submitting ? 'Uploading archive' : activeJob?.step ?? 'queued'}</span>
                  <span className="text-muted-foreground">
                    {submitting && uploadProgress !== null ? `${uploadProgress}%` : `${jobProgress ?? 0}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${submitting && uploadProgress !== null ? uploadProgress : jobProgress ?? 0}%` }}
                  />
                </div>

                {activeJob && (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                      <p className="text-sm font-medium">Log job</p>
                      <div className="max-h-40 space-y-1 overflow-auto text-sm text-muted-foreground">
                        {activeJob.messages.map((message, index) => (
                          <p key={`${activeJob.id}-${index}`}>{message}</p>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg bg-muted/30 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span>Status</span>
                        {activeJob.status === 'done' ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </Badge>
                        ) : activeJob.status === 'failed' ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Failed
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <LoaderCircle className="h-3 w-3 animate-spin" /> Running
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Workspace</span>
                        <span className="font-medium">{activeJob.workspace}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Schema</span>
                        <span className="font-medium">{activeJob.schema}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Store</span>
                        <span className="font-medium">{activeJob.storeName}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Layer</span>
                        <span className="font-medium">{activeJob.layerName ?? 'Menunggu deteksi'}</span>
                      </div>
                      {activeJob.result && (
                        <div className="rounded-md border border-success/40 bg-success/10 p-3 text-success-foreground">
                          Published: {activeJob.result.qualifiedLayer}
                        </div>
                      )}
                      {activeJob.error && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                          {activeJob.error}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" /> Riwayat Import
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentJobs.length === 0 ? (
              <div className="p-6">
                <EmptyState message="Belum ada job import shapefile." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Layer</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">{job.fileName}</TableCell>
                      <TableCell>{job.targetId}</TableCell>
                      <TableCell>{job.workspace}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {job.result?.qualifiedLayer ?? job.layerName ?? 'Menunggu'}
                      </TableCell>
                      <TableCell>{job.progress}%</TableCell>
                      <TableCell>
                        {job.status === 'done' ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </Badge>
                        ) : job.status === 'failed' ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Failed
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <LoaderCircle className="h-3 w-3 animate-spin" /> {job.step}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari layer, store, atau tipe…"
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
                    <TableHead>
                      <span className="inline-flex items-center gap-2">
                        <Database className="h-4 w-4" /> Store
                      </span>
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((layer, i) => {
                    const ws = layer.workspace ?? (layer.name.includes(':') ? layer.name.split(':')[0] : '—');
                    return (
                      <TableRow key={layer.name}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{layer.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ws}</Badge>
                        </TableCell>
                        <TableCell>{layer.store ?? '—'}</TableCell>
                        <TableCell>
                          {layer.type ? (
                            <Badge variant={layer.type.toUpperCase() === 'VECTOR' ? 'default' : 'secondary'}>
                              {layer.type}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {layer.wms && (
                              <Button asChild variant="outline" size="sm">
                                <a href={layer.wms} target="_blank" rel="noopener noreferrer">
                                  <Map className="mr-1 h-3.5 w-3.5" /> WMS
                                </a>
                              </Button>
                            )}
                            {layer.wfs ? (
                              <Button asChild variant="outline" size="sm">
                                <a href={layer.wfs} target="_blank" rel="noopener noreferrer">
                                  <FileJson className="mr-1 h-3.5 w-3.5" /> WFS
                                </a>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">WFS N/A</span>
                            )}
                          </div>
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
