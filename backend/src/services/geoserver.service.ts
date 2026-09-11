import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config/env.js';

/**
 * Thin wrapper around the GeoServer REST API.
 * Docs: https://docs.geoserver.org/latest/en/user/rest/
 */
class GeoServerService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${config.geoserver.url}/rest`,
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

  /** GeoServer version / manifest info. */
  async about(): Promise<any> {
    return this.get('/about/version.json');
  }

  /** System status (uptime, memory, JVM). */
  async systemStatus(): Promise<any> {
    return this.get('/about/system-status.json');
  }

  async workspaces(): Promise<any> {
    return this.get('/workspaces.json');
  }

  async workspace(name: string): Promise<any> {
    return this.get(`/workspaces/${encodeURIComponent(name)}.json`);
  }

  async dataStores(workspace: string): Promise<any> {
    return this.get(`/workspaces/${encodeURIComponent(workspace)}/datastores.json`);
  }

  async coverageStores(workspace: string): Promise<any> {
    return this.get(`/workspaces/${encodeURIComponent(workspace)}/coveragestores.json`);
  }

  async layers(): Promise<any> {
    return this.get('/layers.json');
  }

  async layer(name: string): Promise<any> {
    return this.get(`/layers/${encodeURIComponent(name)}.json`);
  }

  async layerGroups(): Promise<any> {
    return this.get('/layergroups.json');
  }

  async styles(): Promise<any> {
    return this.get('/styles.json');
  }

  async fonts(): Promise<any> {
    return this.get('/fonts.json');
  }

  /**
   * Aggregated dashboard summary: counts of the main GeoServer resources.
   */
  async summary(): Promise<{
    version: string | null;
    workspaces: number;
    layers: number;
    layerGroups: number;
    styles: number;
    stores: number;
    online: boolean;
  }> {
    const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    };

    const [about, workspaces, layers, layerGroups, styles] = await Promise.all([
      safe(() => this.about(), null as any),
      safe(() => this.workspaces(), null as any),
      safe(() => this.layers(), null as any),
      safe(() => this.layerGroups(), null as any),
      safe(() => this.styles(), null as any),
    ]);

    const wsList: any[] = toArray(workspaces?.workspaces?.workspace);

    // Count stores across all workspaces (best effort).
    let stores = 0;
    await Promise.all(
      wsList.map(async (ws) => {
        const [ds, cs] = await Promise.all([
          safe(() => this.dataStores(ws.name), null as any),
          safe(() => this.coverageStores(ws.name), null as any),
        ]);
        stores += toArray(ds?.dataStores?.dataStore).length;
        stores += toArray(cs?.coverageStores?.coverageStore).length;
      })
    );

    const version =
      about?.about?.resource?.find?.((r: any) => r['@name'] === 'GeoServer')?.Version ??
      about?.about?.resource?.[0]?.Version ??
      null;

    return {
      version: version ?? null,
      workspaces: wsList.length,
      layers: toArray(layers?.layers?.layer).length,
      layerGroups: toArray(layerGroups?.layerGroups?.layerGroup).length,
      styles: toArray(styles?.styles?.style).length,
      stores,
      online: about !== null,
    };
  }

  /** Normalise an AxiosError into a plain message. */
  static describeError(err: unknown): { status: number; message: string } {
    if (err instanceof AxiosError) {
      return {
        status: err.response?.status ?? 502,
        message:
          typeof err.response?.data === 'string'
            ? err.response.data
            : err.message || 'GeoServer request failed',
      };
    }
    return { status: 500, message: (err as Error)?.message ?? 'Unknown error' };
  }
}

/** GeoServer returns single objects or arrays inconsistently; normalise to array. */
export function toArray<T>(value: T | T[] | undefined | null | ''): T[] {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

export const geoserverService = new GeoServerService();
export { GeoServerService };
