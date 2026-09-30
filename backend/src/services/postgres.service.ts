import { Pool } from 'pg';
import { config, type PostgresTargetConfig } from '../config/env.js';
import { geoserverService, toArray } from './geoserver.service.js';

export interface PostgresStatus {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  online: boolean;
  version: string | null;
  postgis: string | null;
}

interface PublishedTableInfo {
  published: boolean;
  layers: string[];
}

interface PublishedTablesCacheEntry {
  cachedAt: number;
  data: Map<string, PublishedTableInfo>;
}

const pools = new Map<string, Pool>();
const publishedTablesCache = new Map<string, PublishedTablesCacheEntry>();
const PUBLISHED_TABLES_TTL_MS = 30_000;
const PUBLISHED_TABLES_TIMEOUT_MS = 3_000;

function getTarget(targetId?: string): PostgresTargetConfig {
  const resolvedId = targetId ?? config.postgres.defaultTargetId;
  const target = config.postgres.targets.find((candidate) => candidate.id === resolvedId);

  if (!target) {
    throw new Error(`Unknown PostGIS target: ${resolvedId}`);
  }

  return target;
}

function getPool(targetId?: string): Pool {
  const target = getTarget(targetId);
  const existingPool = pools.get(target.id);

  if (existingPool) {
    return existingPool;
  }

  const pool = new Pool({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error(`[postgres:${target.id}] idle client error`, err.message);
  });

  pools.set(target.id, pool);
  return pool;
}

function createStatus(
  target: PostgresTargetConfig,
  status: Omit<PostgresStatus, 'id' | 'name' | 'host' | 'port' | 'database'>
): PostgresStatus {
  return {
    id: target.id,
    name: target.name,
    host: target.host,
    port: target.port,
    database: target.database,
    ...status,
  };
}

function connectionParam(store: any, key: string): string | null {
  const entries = toArray<any>(store?.connectionParameters?.entry);
  const found = entries.find((entry) => entry?.['@key'] === key);
  if (!found) return null;
  return typeof found.$ === 'string' ? found.$ : (found['#text'] ?? null);
}

function normalizeKey(...parts: string[]): string {
  return parts.map((part) => part.replace(/^"|"$/g, '').trim().toLowerCase()).join('.');
}

function normalizeHost(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() ?? null;
}

function normalizeDatabase(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() ?? null;
}

function normalizePort(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim();
}

function isPostgisStore(store: any): boolean {
  const type = String(store?.type ?? '').toLowerCase();
  const dbType = String(connectionParam(store, 'dbtype') ?? '').toLowerCase();
  return type.includes('postgis') || dbType.includes('postgis');
}

function parseQualifiedName(value: string, fallbackSchema: string): { schema: string; table: string } {
  const normalized = value.replace(/^"|"$/g, '').trim();
  const parts = normalized.split('.').map((part) => part.replace(/^"|"$/g, '').trim());

  if (parts.length >= 2) {
    return {
      schema: parts.at(-2) || fallbackSchema,
      table: parts.at(-1) || normalized,
    };
  }

  return {
    schema: fallbackSchema,
    table: normalized,
  };
}

async function publishedTables(targetId?: string): Promise<Map<string, PublishedTableInfo>> {
  const target = getTarget(targetId);
  const targetHost = normalizeHost(target.host);
  const targetPort = normalizePort(target.port);
  const targetDatabase = normalizeDatabase(target.database);
  const published = new Map<string, PublishedTableInfo>();

  let workspacesData: any = null;
  try {
    workspacesData = await geoserverService.workspaces();
  } catch {
    return published;
  }

  const workspaces = toArray<any>(workspacesData?.workspaces?.workspace);

  await Promise.all(
    workspaces.map(async (workspace) => {
      let dataStores: any = null;
      try {
        dataStores = await geoserverService.dataStores(workspace.name);
      } catch {
        return;
      }

      const stores = toArray<any>(dataStores?.dataStores?.dataStore);

      await Promise.all(
        stores.map(async (dataStore) => {
          let detail: any = null;
          try {
            detail = await geoserverService.dataStore(workspace.name, dataStore.name);
          } catch {
            return;
          }

          const store = detail?.dataStore;
          if (!isPostgisStore(store)) return;

          const storeHost = normalizeHost(connectionParam(store, 'host'));
          const storePort = normalizePort(connectionParam(store, 'port'));
          const storeDatabase = normalizeDatabase(
            connectionParam(store, 'database') ?? connectionParam(store, 'dbname')
          );

          if (targetHost && storeHost && storeHost !== targetHost) return;
          if (targetPort && storePort && storePort !== targetPort) return;
          if (targetDatabase && storeDatabase && storeDatabase !== targetDatabase) return;

          const defaultSchema = connectionParam(store, 'schema')?.trim() || 'public';

          let featureTypesData: any = null;
          try {
            featureTypesData = await geoserverService.featureTypes(workspace.name, dataStore.name);
          } catch {
            return;
          }

          const featureTypes = toArray<any>(featureTypesData?.featureTypes?.featureType);

          await Promise.all(
            featureTypes.map(async (featureType) => {
              let detailData: any = null;
              try {
                detailData = await geoserverService.featureType(
                  workspace.name,
                  dataStore.name,
                  featureType.name
                );
              } catch {
                detailData = null;
              }

              const publishedName = String(featureType.name ?? '').trim();
              const nativeName = String(
                detailData?.featureType?.nativeName ?? featureType.name ?? ''
              ).trim();
              if (!publishedName || !nativeName) return;

              const native = parseQualifiedName(nativeName, defaultSchema);
              const key = normalizeKey(native.schema, native.table);
              const layerName = `${workspace.name}:${publishedName}`;
              const existing = published.get(key) ?? { published: true, layers: [] };

              if (!existing.layers.includes(layerName)) {
                existing.layers.push(layerName);
              }

              published.set(key, existing);
            })
          );
        })
      );
    })
  );

  return published;
}

async function publishedTablesBestEffort(targetId?: string): Promise<Map<string, PublishedTableInfo>> {
  const cacheKey = targetId ?? config.postgres.defaultTargetId;
  const cached = publishedTablesCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.cachedAt < PUBLISHED_TABLES_TTL_MS) {
    return cached.data;
  }

  try {
    const data = await Promise.race([
      publishedTables(targetId),
      new Promise<Map<string, PublishedTableInfo>>((resolve) => {
        setTimeout(() => resolve(cached?.data ?? new Map()), PUBLISHED_TABLES_TIMEOUT_MS);
      }),
    ]);

    if (data.size > 0 || !cached) {
      publishedTablesCache.set(cacheKey, {
        cachedAt: now,
        data,
      });
    }

    return data;
  } catch {
    return cached?.data ?? new Map();
  }
}

export const postgresService = {
  targets(): Array<Pick<PostgresStatus, 'id' | 'name' | 'host' | 'port' | 'database'>> {
    return config.postgres.targets.map(({ id, name, host, port, database }) => ({
      id,
      name,
      host,
      port,
      database,
    }));
  },

  async ping(targetId?: string): Promise<PostgresStatus> {
    const target = getTarget(targetId);
    const pool = getPool(target.id);

    try {
      const client = await pool.connect();
      try {
        const versionResult = await client.query('SELECT version() AS version');
        let postgis: string | null = null;

        try {
          const postgisResult = await client.query('SELECT PostGIS_Full_Version() AS postgis');
          postgis = postgisResult.rows[0]?.postgis ?? null;
        } catch {
          postgis = null;
        }

        return createStatus(target, {
          online: true,
          version: versionResult.rows[0]?.version ?? null,
          postgis,
        });
      } finally {
        client.release();
      }
    } catch {
      return createStatus(target, {
        online: false,
        version: null,
        postgis: null,
      });
    }
  },

  async summary(): Promise<{
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
  }> {
    const targets = await Promise.all(config.postgres.targets.map((target) => this.ping(target.id)));
    const primary =
      targets.find((target) => target.id === config.postgres.defaultTargetId) ?? targets[0] ?? null;
    const onlineCount = targets.filter((target) => target.online).length;

    return {
      online: onlineCount > 0,
      onlineCount,
      total: targets.length,
      primaryTargetId: config.postgres.defaultTargetId,
      name: primary?.name ?? null,
      host: primary?.host ?? null,
      port: primary?.port ?? null,
      database: primary?.database ?? null,
      version: primary?.version ?? null,
      postgis: primary?.postgis ?? null,
      targets,
    };
  },

  async tables(
    targetId?: string
  ): Promise<
    Array<{
      schema: string;
      table: string;
      rows: number;
      hasGeometry: boolean;
      size: string;
      published: boolean;
      layers: string[];
    }>
  > {
    const pool = getPool(targetId);
    const published = await publishedTablesBestEffort(targetId);
    const sql = `
      SELECT
        n.nspname                                   AS schema,
        c.relname                                   AS table,
        COALESCE(c.reltuples, 0)::bigint            AS rows,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
        EXISTS (
          SELECT 1 FROM pg_attribute a
          JOIN pg_type t ON t.oid = a.atttypid
          WHERE a.attrelid = c.oid
            AND t.typname IN ('geometry', 'geography')
        )                                           AS has_geometry
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'topology', 'tiger', 'tiger_data')
      ORDER BY has_geometry DESC, n.nspname, c.relname
      LIMIT 500;
    `;
    const { rows } = await pool.query(sql);

    return rows.map((row) => ({
      schema: row.schema,
      table: row.table,
      rows: Number(row.rows),
      hasGeometry: row.has_geometry,
      size: row.size,
      published: published.has(normalizeKey(row.schema, row.table)),
      layers: published.get(normalizeKey(row.schema, row.table))?.layers ?? [],
    }));
  },

  async spatialColumns(targetId?: string): Promise<any[]> {
    const pool = getPool(targetId);
    const sql = `
      SELECT f_table_schema AS schema, f_table_name AS "table",
             f_geometry_column AS geometry_column, coord_dimension AS dimension,
             srid, type
      FROM geometry_columns
      ORDER BY f_table_schema, f_table_name
      LIMIT 500;
    `;

    try {
      const { rows } = await pool.query(sql);
      return rows;
    } catch {
      return [];
    }
  },
};
