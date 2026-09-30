import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export interface PostgresTargetConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createTargetId(value: string, fallback: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function parsePostgresTargets(primary: PostgresTargetConfig): {
  defaultTargetId: string;
  targets: PostgresTargetConfig[];
} {
  const rawTargets = process.env.POSTGRES_TARGETS?.trim();

  if (!rawTargets) {
    return { defaultTargetId: primary.id, targets: [primary] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawTargets);
  } catch (error) {
    throw new Error(
      `Invalid POSTGRES_TARGETS JSON: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('POSTGRES_TARGETS must be a JSON array.');
  }

  const extras = parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`POSTGRES_TARGETS[${index}] must be an object.`);
    }

    const candidate = entry as Partial<PostgresTargetConfig> & { name?: string };
    const host = candidate.host?.trim();
    if (!host) {
      throw new Error(`POSTGRES_TARGETS[${index}].host is required.`);
    }

    const name = candidate.name?.trim() || `PostGIS ${host}`;
    const id = candidate.id?.trim() || createTargetId(name, `postgres-${index + 1}`);

    return {
      id,
      name,
      host,
      port: Number(candidate.port ?? primary.port),
      user: candidate.user?.trim() || primary.user,
      password: candidate.password?.trim() || primary.password,
      database: candidate.database?.trim() || primary.database,
    } satisfies PostgresTargetConfig;
  });

  const targets = [primary, ...extras];
  const uniqueTargets = targets.filter(
    (target, index) => targets.findIndex((candidate) => candidate.id === target.id) === index
  );

  return {
    defaultTargetId: primary.id,
    targets: uniqueTargets,
  };
}

const primaryPostgresTarget: PostgresTargetConfig = {
  id: 'primary',
  name: process.env.PGNAME?.trim() || 'Primary PostGIS',
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres123',
  database: process.env.PGDATABASE ?? 'geodb',
};

const postgres = parsePostgresTargets(primaryPostgresTarget);

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  geoserver: {
    url: required('GEOSERVER_URL', 'http://localhost:8080/geoserver').replace(/\/$/, ''),
    publicUrl: (process.env.GEOSERVER_PUBLIC_URL ?? 'http://localhost:8080/geoserver').replace(/\/$/, ''),
    user: required('GEOSERVER_USER', 'admin'),
    password: required('GEOSERVER_PASSWORD', 'Admin@123'),
  },
  postgres,
  storage: {
    // GeoServer melihat file di sourcePrefix; backend mengaksesnya via mountPath.
    sourcePrefix: (process.env.NAS_SOURCE_PREFIX ?? '/data/nasdata3').replace(/\/$/, ''),
    mountPath: (process.env.NAS_MOUNT_PATH ?? '/data/nasdata3').replace(/\/$/, ''),
  },
  imports: {
    stagingDir: path.resolve(process.cwd(), process.env.SHAPEFILE_IMPORT_DIR ?? '.tmp/imports'),
    ogr2ogrBin: process.env.OGR2OGR_BIN ?? 'ogr2ogr',
    ogrinfoBin: process.env.OGRINFO_BIN ?? 'ogrinfo',
  },
  gwcCachePath: (process.env.GWC_CACHE_PATH ?? '/opt/gwc_cache').replace(/\/$/, ''),

};

export type AppConfig = typeof config;
