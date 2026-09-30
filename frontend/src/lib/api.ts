// Relative path → Next.js rewrite proxy handles backend forwarding (no browser CORS)
const API_BASE = '';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

/** SWR fetcher. */
export const fetcher = <T>(path: string) => apiFetch<T>(path);

export interface UploadShapefileRequest {
  file: File;
  targetId: string;
  workspace: string;
  schema: string;
  storeName?: string;
  layerName?: string;
  declaredSrs?: string;
  overwrite: boolean;
}

export async function uploadShapefileImport(
  payload: UploadShapefileRequest,
  onUploadProgress?: (progress: number) => void
): Promise<ShapefileImportJob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/geoserver/imports/shapefile`);
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.setRequestHeader('X-Upload-File-Name', encodeURIComponent(payload.file.name));
    xhr.setRequestHeader('X-Target-Id', payload.targetId);
    xhr.setRequestHeader('X-Workspace', payload.workspace);
    xhr.setRequestHeader('X-Schema', payload.schema);
    xhr.setRequestHeader('X-Overwrite', String(payload.overwrite));

    if (payload.storeName?.trim()) {
      xhr.setRequestHeader('X-Store-Name', payload.storeName.trim());
    }

    if (payload.layerName?.trim()) {
      xhr.setRequestHeader('X-Layer-Name', payload.layerName.trim());
    }

    if (payload.declaredSrs?.trim()) {
      xhr.setRequestHeader('X-Declared-Srs', payload.declaredSrs.trim());
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onUploadProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      try {
        const body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body as ShapefileImportJob);
          return;
        }

        reject(new Error(body?.message ?? `Request failed (${xhr.status})`));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Upload response is invalid.'));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed.'));
    xhr.send(payload.file);
  });
}

// ---- Shared types ----
export interface HealthResponse {
  timestamp: string;
  geoserver: {
    version: string | null;
    workspaces: number;
    layers: number;
    layerGroups: number;
    styles: number;
    stores: number;
    online: boolean;
  };
  geowebcache: { cachedLayers: number; gridSets: number; online: boolean };
  postgres: {
    online: boolean;
    onlineCount: number;
    total: number;
    primaryTargetId: string;
    name: string | null;
    host: string | null;
    port: number | null;
    database: string | null;
    version: string | null;
    postgis: string | null;
    targets: PostgresStatus[];
  };
  storage: { online: boolean; mountPath: string; stores: number };
}

export interface PostgresTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
}

export interface PostgresStatus extends PostgresTarget {
  online: boolean;
  version: string | null;
  postgis: string | null;
}

export interface Workspace {
  name: string;
  href: string;
}

export interface GeoServerPostgisStore {
  name: string;
  workspace: string;
  type: string | null;
  schema: string | null;
  host: string | null;
  port: number | null;
  database: string | null;
}

export interface GeoServerSrsOption {
  code: string;
  label: string;
}

export interface NamedRef {
  name: string;
  href: string;
}

export interface LayerDetail {
  name: string;
  workspace: string | null;
  store: string | null;
  type: string | null;
  wms: string | null;
  wfs: string | null;
  href: string;
}

export interface GsEndpoints {
  base: string;
  wms: string;
  wfs: string;
  wmts: string;
  wcs: string;
}

export interface PgTable {
  schema: string;
  table: string;
  rows: number;
  hasGeometry: boolean;
  size: string;
  published: boolean;
  layers: string[];
}

export interface ShapefileImportJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  step:
    | 'uploaded'
    | 'validating'
    | 'reading-metadata'
    | 'importing-postgis'
    | 'creating-datastore'
    | 'publishing-geoserver'
    | 'done'
    | 'failed';
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

export interface FileStore {
  workspace: string;
  name: string;
  type: string | null;
  path: string | null;
  enabled: boolean;
  featureTypes: number;
}

export interface StoreFile {
  name: string;
  file: string;
  bytes: number;
  size: string;
  modified: string | null;
  published: boolean;
  layer: string | null;
}

export interface StoreContents {
  workspace: string;
  store: string;
  type: string | null;
  path: string | null;
  accessible: boolean;
  totalBytes: number;
  totalSize: string;
  fileCount: number;
  files: StoreFile[];
}
