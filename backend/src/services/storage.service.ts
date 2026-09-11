import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { geoserverService, toArray } from './geoserver.service.js';

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

const SHP_EXTS = ['shp', 'shx', 'dbf', 'prj', 'cpg', 'qix', 'sbn', 'sbx', 'fix', 'qmd', 'qpj'];

function prettyBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Ambil nilai connectionParameters GeoServer berdasarkan key. */
function connectionParam(store: any, key: string): string | null {
  const entries = toArray<any>(store?.connectionParameters?.entry);
  const found = entries.find((e) => e?.['@key'] === key);
  if (!found) return null;
  return typeof found.$ === 'string' ? found.$ : (found['#text'] ?? null);
}

/** Terjemahkan URL file: dari GeoServer menjadi path yang dapat dibaca backend. */
function resolveDiskPath(fileUrl: string): string {
  let p = decodeURIComponent(fileUrl.trim());
  p = p.replace(/^file:\/\//i, '').replace(/^file:/i, '');
  if (config.storage.sourcePrefix && p.startsWith(config.storage.sourcePrefix)) {
    p = config.storage.mountPath + p.slice(config.storage.sourcePrefix.length);
  }
  return p;
}

function isFileBased(type: string | null, url: string | null): boolean {
  const t = (type ?? '').toLowerCase();
  return (!!url && /^file:/i.test(url.trim())) || t.includes('shapefile') || t.includes('directory');
}

class StorageService {
  /** Semua datastore berbasis file/shapefile di seluruh workspace. */
  async fileStores(): Promise<FileStore[]> {
    const wsData = await geoserverService.workspaces();
    const workspaces = toArray<any>(wsData?.workspaces?.workspace);
    const stores: FileStore[] = [];

    await Promise.all(
      workspaces.map(async (ws) => {
        let dsData: any = null;
        try {
          dsData = await geoserverService.dataStores(ws.name);
        } catch {
          return;
        }
        const list = toArray<any>(dsData?.dataStores?.dataStore);
        await Promise.all(
          list.map(async (ds) => {
            let detail: any = null;
            try {
              detail = await geoserverService.dataStore(ws.name, ds.name);
            } catch {
              return;
            }
            const store = detail?.dataStore;
            const type: string | null = store?.type ?? null;
            const url = connectionParam(store, 'url');
            if (!isFileBased(type, url)) return;

            let count = 0;
            try {
              const ft = await geoserverService.featureTypes(ws.name, ds.name);
              count = toArray(ft?.featureTypes?.featureType).length;
            } catch {
              count = 0;
            }

            stores.push({
              workspace: ws.name,
              name: ds.name,
              type,
              path: url ? resolveDiskPath(url) : null,
              enabled: store?.enabled !== false,
              featureTypes: count,
            });
          })
        );
      })
    );

    stores.sort((a, b) => a.workspace.localeCompare(b.workspace) || a.name.localeCompare(b.name));
    return stores;
  }

  /** Shapefile pada satu datastore (pindai direktori), lengkap dengan ukuran on-disk. */
  async storeContents(workspace: string, storeName: string): Promise<StoreContents> {
    const detail = await geoserverService.dataStore(workspace, storeName);
    const store = detail?.dataStore;
    const type: string | null = store?.type ?? null;
    const url = connectionParam(store, 'url');
    const resolved = url ? resolveDiskPath(url) : null;

    // Store bisa menunjuk satu file .shp atau sebuah direktori berisi banyak .shp.
    const singleShp = resolved && /\.shp$/i.test(resolved) ? path.basename(resolved, '.shp') : null;
    const baseDir = resolved ? (singleShp ? path.dirname(resolved) : resolved) : null;

    // Peta featuretype terpublikasi: nativeName (lowercase) -> nama layer.
    const published = new Map<string, string>();
    try {
      const ft = await geoserverService.featureTypes(workspace, storeName);
      const list = toArray<any>(ft?.featureTypes?.featureType);
      await Promise.all(
        list.map(async (f) => {
          let native = f.name as string;
          try {
            const d = await geoserverService.featureType(workspace, storeName, f.name);
            native = d?.featureType?.nativeName ?? f.name;
          } catch {
            /* pakai nama publikasi */
          }
          published.set(String(native).toLowerCase(), f.name);
        })
      );
    } catch {
      /* store tanpa featuretype terbaca */
    }

    // Pindai direktori, kelompokkan berdasarkan nama-dasar shapefile.
    const grouped = new Map<string, { bytes: number; modified: number }>();
    const names = new Map<string, string>();
    let accessible = false;
    if (baseDir) {
      try {
        const entries = await fs.readdir(baseDir, { withFileTypes: true });
        accessible = true;
        await Promise.all(
          entries.map(async (e) => {
            if (!e.isFile()) return;
            const ext = path.extname(e.name).slice(1).toLowerCase();
            if (!SHP_EXTS.includes(ext)) return;
            const base = path.basename(e.name, path.extname(e.name));
            const key = base.toLowerCase();
            if (singleShp && singleShp.toLowerCase() !== key) return;
            try {
              const st = await fs.stat(path.join(baseDir!, e.name));
              const cur = grouped.get(key) ?? { bytes: 0, modified: 0 };
              cur.bytes += st.size;
              cur.modified = Math.max(cur.modified, st.mtimeMs);
              grouped.set(key, cur);
              if (!names.has(key)) names.set(key, base);
            } catch {
              /* file tak terbaca, lewati */
            }
          })
        );
      } catch {
        accessible = false;
      }
    }

    let files: StoreFile[] = [...grouped.entries()].map(([key, info]) => {
      const name = names.get(key) ?? key;
      return {
        name,
        file: `${name}.shp`,
        bytes: info.bytes,
        size: prettyBytes(info.bytes),
        modified: new Date(info.modified).toISOString(),
        published: published.has(key),
        layer: published.get(key) ?? null,
      };
    });

    // Fallback: NAS tak terbaca — tetap tampilkan layer terpublikasi (ukuran 0).
    if (files.length === 0 && published.size > 0) {
      files = [...published.entries()].map(([key, layer]) => ({
        name: key,
        file: `${key}.shp`,
        bytes: 0,
        size: prettyBytes(0),
        modified: null,
        published: true,
        layer,
      }));
    }

    files.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
    const totalBytes = files.reduce((s, f) => s + f.bytes, 0);

    return {
      workspace,
      store: storeName,
      type,
      path: baseDir,
      accessible,
      totalBytes,
      totalSize: prettyBytes(totalBytes),
      fileCount: files.length,
      files,
    };
  }
}

export const storageService = new StorageService();
