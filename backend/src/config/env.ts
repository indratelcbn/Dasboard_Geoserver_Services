import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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
  postgres: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres123',
    database: process.env.PGDATABASE ?? 'geodb',
  },
};

export type AppConfig = typeof config;
