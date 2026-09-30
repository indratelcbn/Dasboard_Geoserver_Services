import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { config, type PostgresTargetConfig } from '../config/env.js';
import { geoserverService } from './geoserver.service.js';

export type ShapefileImportStatus = 'queued' | 'running' | 'done' | 'failed';
export type ShapefileImportStep =
  | 'uploaded'
  | 'validating'
  | 'reading-metadata'
  | 'importing-postgis'
  | 'creating-datastore'
  | 'publishing-geoserver'
  | 'done'
  | 'failed';

export interface ShapefileImportJob {
  id: string;
  status: ShapefileImportStatus;
  step: ShapefileImportStep;
  progress: number;
  fileName: string;
  targetId: string;
  workspace: string;
  schema: string;
  storeName: string;
  layerName: string | null;
  declaredSrs: string | null;
  detectedSrs: string | null;
  overwrite: boolean;
  createdAt: string;
  updatedAt: string;
  messages: string[];
  error: string | null;
  result: {
    qualifiedLayer: string;
    storeName: string;
    tableName: string;
    schema: string;
    targetId: string;
  } | null;
}

interface InternalJob extends ShapefileImportJob {
  filePath: string;
  sourceLayerName: string | null;
  tableName: string | null;
}

interface CreateJobInput {
  fileName: string;
  filePath: string;
  targetId: string;
  workspace: string;
  schema?: string;
  storeName?: string;
  layerName?: string;
  declaredSrs?: string;
  overwrite: boolean;
}

const MAX_JOBS = 50;

function now(): string {
  return new Date().toISOString();
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  const safe = normalized || fallback;
  return /^\d/.test(safe) ? `layer_${safe}` : safe;
}

function sanitizeStoreName(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return normalized || fallback;
}

function getTargetConfig(targetId: string): PostgresTargetConfig {
  const target = config.postgres.targets.find((candidate) => candidate.id === targetId);
  if (!target) {
    throw new Error(`Unknown PostGIS target: ${targetId}`);
  }
  return target;
}

function toVsiZipPath(filePath: string): string {
  return `/vsizip/${filePath.replace(/\\/g, '/')}`;
}

function normalizeOgrLayerName(value: string): string {
  const trimmed = value.trim();
  const match = /^(.*?)\s+\([^)]+\)$/.exec(trimmed);
  return (match?.[1] ?? trimmed).trim();
}

function parseLayerNames(output: string): string[] {
  const matches = [...output.matchAll(/^\s*\d+:\s*(.+)$/gm)].map((match) =>
    normalizeOgrLayerName(match[1])
  );
  return [...new Set(matches)].filter(Boolean);
}

function parseProgress(chunk: string): number | null {
  const matches = [...chunk.matchAll(/(\d{1,3})(?=\.\.\.)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => !Number.isNaN(value) && value >= 0 && value <= 100);
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

function parseDetectedSrs(output: string): string | null {
  const authorityMatches = [
    ...output.matchAll(/AUTHORITY\["(EPSG)",\s*"?(\d+)"?\]/gi),
    ...output.matchAll(/ID\["(EPSG)",\s*(\d+)\]/gi),
  ];

  if (authorityMatches.length > 0) {
    const match = authorityMatches[authorityMatches.length - 1];
    return `${match[1].toUpperCase()}:${match[2]}`;
  }

  const directCode = /(EPSG):(\d{3,6})\b/i.exec(output) ?? /(CRS):(84)\b/i.exec(output);
  if (directCode) {
    return `${directCode[1].toUpperCase()}:${directCode[2]}`;
  }

  if (/\bSRGI\s*2013\b|\bSRGI2013\b|Sistem[_ ]Referensi[_ ]Geospasial[_ ]Indonesia[_ ]2013/i.test(output)) {
    return 'EPSG:9470';
  }

  return null;
}

function publicJob(job: InternalJob): ShapefileImportJob {
  const { filePath: _filePath, sourceLayerName: _sourceLayerName, ...rest } = job;
  return rest;
}

async function runCommand(
  command: string,
  args: string[],
  options?: {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer | string) => {
      const chunk = data.toString();
      stdout += chunk;
      options?.onStdout?.(chunk);
    });

    child.stderr.on('data', (data: Buffer | string) => {
      const chunk = data.toString();
      stderr += chunk;
      options?.onStderr?.(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const details = stderr.trim() || stdout.trim() || `Command failed with exit code ${code ?? 'unknown'}`;
      reject(new Error(details));
    });
  });
}

class ShapefileImportService {
  private jobs = new Map<string, InternalJob>();

  async ensureStagingDir(): Promise<void> {
    await fs.mkdir(config.imports.stagingDir, { recursive: true });
  }

  buildUploadPath(fileName: string): string {
    const suffix = path.extname(fileName || '').toLowerCase() === '.zip' ? '.zip' : '.zip';
    return path.join(config.imports.stagingDir, `${Date.now()}-${randomUUID()}${suffix}`);
  }

  listJobs(): ShapefileImportJob[] {
    return [...this.jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(publicJob);
  }

  getJob(id: string): ShapefileImportJob | null {
    const job = this.jobs.get(id);
    return job ? publicJob(job) : null;
  }

  async createJob(input: CreateJobInput): Promise<ShapefileImportJob> {
    await this.ensureStagingDir();

    const target = getTargetConfig(input.targetId);
    const schema = sanitizeIdentifier(input.schema?.trim() || 'public', 'public').toLowerCase();
    const storeName = sanitizeStoreName(
      input.storeName?.trim() || `postgis-${target.id}-${schema}`,
      `postgis-${target.id}-${schema}`
    );

    const job: InternalJob = {
      id: randomUUID(),
      status: 'queued',
      step: 'uploaded',
      progress: 5,
      fileName: input.fileName,
      filePath: input.filePath,
      targetId: input.targetId,
      workspace: input.workspace.trim(),
      schema,
      storeName,
      layerName: input.layerName?.trim() ? sanitizeIdentifier(input.layerName.trim(), 'layer_import') : null,
      declaredSrs: input.declaredSrs?.trim() || null,
      detectedSrs: null,
      sourceLayerName: null,
      tableName: null,
      overwrite: input.overwrite,
      createdAt: now(),
      updatedAt: now(),
      messages: ['Upload selesai, job import dibuat.'],
      error: null,
      result: null,
    };

    if (!job.workspace) {
      throw new Error('Workspace GeoServer wajib dipilih.');
    }

    this.jobs.set(job.id, job);
    this.pruneJobs();
    void this.run(job.id);
    return publicJob(job);
  }

  private pruneJobs(): void {
    const jobs = [...this.jobs.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    while (jobs.length > MAX_JOBS) {
      const oldest = jobs.shift();
      if (oldest) {
        this.jobs.delete(oldest.id);
      }
    }
  }

  private update(id: string, patch: Partial<InternalJob>, message?: string): InternalJob {
    const current = this.jobs.get(id);
    if (!current) {
      throw new Error(`Import job not found: ${id}`);
    }

    const next: InternalJob = {
      ...current,
      ...patch,
      updatedAt: now(),
      messages: message ? [...current.messages, message] : current.messages,
    };
    this.jobs.set(id, next);
    return next;
  }

  private async run(id: string): Promise<void> {
    let job = this.jobs.get(id);
    if (!job) return;

    try {
      job = this.update(id, { status: 'running', step: 'validating', progress: 10 }, 'Memvalidasi arsip ZIP shapefile.');
      if (path.extname(job.fileName).toLowerCase() !== '.zip') {
        throw new Error('File harus berupa arsip ZIP shapefile.');
      }

      const sourcePath = toVsiZipPath(job.filePath);

      job = this.update(id, { step: 'reading-metadata', progress: 20 }, 'Membaca metadata layer dari arsip.');
      const metadata = await runCommand(config.imports.ogrinfoBin, ['-ro', sourcePath]);
      const layers = parseLayerNames(`${metadata.stdout}\n${metadata.stderr}`);

      if (layers.length === 0) {
        throw new Error('Tidak ditemukan layer shapefile yang valid di dalam arsip.');
      }

      const sourceLayerName = layers[0];
      const layerMetadata = await runCommand(config.imports.ogrinfoBin, ['-ro', '-so', sourcePath, sourceLayerName]);
      const detectedSrs = parseDetectedSrs(`${layerMetadata.stdout}\n${layerMetadata.stderr}`);
      const publishedLayerName = job.layerName ?? sanitizeIdentifier(sourceLayerName, 'layer_import');
      const tableName = sanitizeIdentifier(sourceLayerName, 'layer_import').toLowerCase();
      const declaredSrs = job.declaredSrs ?? detectedSrs;
      job = this.update(
        id,
        { layerName: publishedLayerName, sourceLayerName, tableName, detectedSrs, declaredSrs },
        layers.length > 1
          ? `Ditemukan ${layers.length} layer; layer pertama ${sourceLayerName} dipilih untuk import.`
          : `Layer sumber terdeteksi: ${sourceLayerName}.`
      );

      if (detectedSrs) {
        job = this.update(id, { detectedSrs }, `CRS terdeteksi otomatis: ${detectedSrs}.`);
      }

      if (job.declaredSrs) {
        job = this.update(id, { declaredSrs: job.declaredSrs }, `Declared SRS dipilih manual: ${job.declaredSrs}.`);
      } else if (detectedSrs) {
        job = this.update(id, { declaredSrs: detectedSrs }, `Declared SRS menggunakan hasil deteksi: ${detectedSrs}.`);
      } else {
        throw new Error('Declared SRS tidak terdeteksi dari shapefile. Pilih manual dari dropdown Declared SRS.');
      }

      const target = getTargetConfig(job.targetId);
      job = this.update(id, { step: 'importing-postgis', progress: 35 }, `Mengimpor ke PostGIS target ${target.name}.`);

      const tableRef = `${job.schema}.${tableName}`;
      const pgConnection = `PG:host=${target.host} port=${target.port} dbname=${target.database} user=${target.user} password=${target.password}`;
      const ogrArgs = [
        '-progress',
        '-f',
        'PostgreSQL',
        pgConnection,
        sourcePath,
        sourceLayerName,
        '-nln',
        tableRef,
        '-lco',
        'GEOMETRY_NAME=geom',
        '-lco',
        'FID=gid',
        '-lco',
        'SPATIAL_INDEX=GIST',
        '-nlt',
        'PROMOTE_TO_MULTI',
      ];

      if (job.overwrite) {
        ogrArgs.push('-overwrite', '-lco', 'OVERWRITE=YES');
      }

      await runCommand(config.imports.ogr2ogrBin, ogrArgs, {
        onStdout: (chunk) => {
          const progress = parseProgress(chunk);
          if (progress !== null) {
            this.update(id, { progress: Math.min(80, 35 + Math.round(progress * 0.45)) });
          }
        },
        onStderr: (chunk) => {
          const progress = parseProgress(chunk);
          if (progress !== null) {
            this.update(id, { progress: Math.min(80, 35 + Math.round(progress * 0.45)) });
          }
        },
      });

      job = this.update(id, { step: 'creating-datastore', progress: 85 }, `Menyiapkan datastore GeoServer ${job.storeName}.`);
      await geoserverService.ensurePostgisDataStore(job.workspace, job.storeName, {
        host: target.host,
        port: target.port,
        database: target.database,
        schema: job.schema,
        user: target.user,
        password: target.password,
      });

      job = this.update(id, { step: 'publishing-geoserver', progress: 92 }, `Mempublikasikan layer ${job.workspace}:${publishedLayerName}.`);
      await geoserverService.ensureFeatureTypePublished(
        job.workspace,
        job.storeName,
        publishedLayerName,
        publishedLayerName,
        tableName,
        job.declaredSrs
      );

      this.update(id, {
        status: 'done',
        step: 'done',
        progress: 100,
        result: {
          qualifiedLayer: `${job.workspace}:${publishedLayerName}`,
          storeName: job.storeName,
          tableName,
          schema: job.schema,
          targetId: job.targetId,
        },
      }, 'Import selesai dan layer berhasil dipublikasikan.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import shapefile gagal.';
      this.update(id, { status: 'failed', step: 'failed', error: message }, `Gagal: ${message}`);
    } finally {
      const current = this.jobs.get(id);
      if (current) {
        try {
          await fs.unlink(current.filePath);
        } catch {
          /* ignore cleanup errors */
        }
      }
    }
  }
}

export const shapefileImportService = new ShapefileImportService();