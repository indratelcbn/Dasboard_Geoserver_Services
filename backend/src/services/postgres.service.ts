import { Pool } from 'pg';
import { config, type PostgresTargetConfig } from '../config/env.js';

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

const pools = new Map<string, Pool>();

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
  ): Promise<Array<{ schema: string; table: string; rows: number; hasGeometry: boolean; size: string }>> {
    const pool = getPool(targetId);
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
