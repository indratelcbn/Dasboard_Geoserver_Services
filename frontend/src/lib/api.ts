const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
  postgres: { online: boolean; version: string | null; postgis: string | null };
}

export interface Workspace {
  name: string;
  href: string;
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
