import { Pool } from 'pg';
import { config } from '../config/env.js';

/**
 * PostgreSQL / PostGIS access. Read-only helpers used by the dashboard to
 * inspect the spatial database backing GeoServer.
 */
const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[postgres] idle client error', err.message);
});

export const postgresService = {
  async ping(): Promise<{ online: boolean; version: string | null; postgis: string | null }> {
    try {
      const client = await pool.connect();
      try {
        const v = await client.query('SELECT version() AS version');
        let postgis: string | null = null;
        try {
          const p = await client.query('SELECT PostGIS_Full_Version() AS postgis');
          postgis = p.rows[0]?.postgis ?? null;
        } catch {
          postgis = null;
        }
        return { online: true, version: v.rows[0]?.version ?? null, postgis };
      } finally {
        client.release();
      }
    } catch {
      return { online: false, version: null, postgis: null };
    }
  },

  /** List user tables with row estimates and whether they contain geometry. */
  async tables(): Promise<
    Array<{ schema: string; table: string; rows: number; hasGeometry: boolean; size: string }>
  > {
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
    return rows.map((r) => ({
      schema: r.schema,
      table: r.table,
      rows: Number(r.rows),
      hasGeometry: r.has_geometry,
      size: r.size,
    }));
  },

  /** Registered spatial columns from PostGIS geometry_columns view. */
  async spatialColumns(): Promise<any[]> {
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
