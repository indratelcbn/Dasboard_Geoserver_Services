import axios, { AxiosInstance } from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env.js';
import { toArray } from './geoserver.service.js';

export interface LayerCacheInfo {
  name: string;
  blobStoreId: string | null;
  cachePath: string;
  cacheSize: number | null; // bytes; null if inaccessible
}

async function getDirSize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirSize(full);
    } else {
      try {
        const stat = await fs.stat(full);
        total += stat.size;
      } catch { /* skip */ }
    }
  }
  return total;
}

/**
 * GeoWebCache (embedded in GeoServer) REST API wrapper.
 * Docs: https://docs.geoserver.org/latest/en/user/geowebcache/rest/
 */
class GeoWebCacheService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${config.geoserver.url}/gwc/rest`,
      auth: {
        username: config.geoserver.user,
        password: config.geoserver.password,
      },
      headers: { Accept: 'application/json' },
      timeout: 20000,
    });
  }

  private async get<T>(path: string): Promise<T> {
    const { data } = await this.client.get<T>(path);
    return data;
  }

  /** All cached layers known to GWC. */
  async layers(): Promise<any> {
    return this.get('/layers.json');
  }

  /** Configured gridsets. */
  async gridSets(): Promise<any> {
    return this.get('/gridsets.json');
  }

  /** Global GWC statistics (disk usage etc.). */
  async statistics(): Promise<any> {
    return this.get('/statistics.json');
  }

  /** Details for one cached layer. */
  async layer(name: string): Promise<any> {
    return this.get(`/layers/${encodeURIComponent(name)}.json`);
  }

  /** Truncate (clear) the cache for a given layer. */
  async truncateLayer(name: string): Promise<void> {
    const body = `<truncateLayer><layerName>${name}</layerName></truncateLayer>`;
    await this.client.post('/masstruncate', body, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  /** Seed / reseed a layer (kick off a tile generation job). */
  async seedLayer(name: string, xml: string): Promise<void> {
    await this.client.post(`/seed/${encodeURIComponent(name)}.xml`, xml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  async summary(): Promise<{ cachedLayers: number; gridSets: number; online: boolean }> {
    try {
      const [layers, gridsets] = await Promise.all([this.layers(), this.gridSets()]);
      return {
        cachedLayers: toArray(layers).length,
        gridSets: toArray(gridsets).length,
        online: true,
      };
    } catch {
      return { cachedLayers: 0, gridSets: 0, online: false };
    }
  }

  /** All cached layers enriched with cache path and disk size. */
  async layersInfo(): Promise<LayerCacheInfo[]> {
    const data = await this.layers();
    const names: string[] = toArray(data);

    return Promise.all(
      names.map(async (name) => {
        let blobStoreId: string | null = null;
        try {
          const detail = await this.layer(name);
          const ld = detail?.GeoServerLayer ?? detail;
          blobStoreId = ld?.blobStoreId ?? null;
        } catch { /* detail fetch failed */ }

        // GWC default file blobstore stores layer tiles in {gwcCachePath}/{name_colon_as_underscore}/
        const dirName = name.replace(':', '_');
        const cachePath = path.posix.join(config.gwcCachePath, dirName);

        let cacheSize: number | null = null;
        try {
          await fs.access(cachePath);
          cacheSize = await getDirSize(cachePath);
        } catch { /* directory not accessible */ }

        return { name, blobStoreId, cachePath, cacheSize };
      }),
    );
  }
}

export const gwcService = new GeoWebCacheService();
export { GeoWebCacheService };
