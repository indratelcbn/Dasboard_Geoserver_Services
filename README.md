# Dashboard Geoserver Services

Interface dashboard untuk memantau dan mengelola layanan **GeoServer**, **GeoWebCache**, dan **PostGIS/PostgreSQL**.

## Tech Stack

| Layer     | Teknologi                                                       |
| --------- | --------------------------------------------------------------- |
| Frontend  | Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · OpenLayers |
| Backend   | Node.js · TypeScript · Express.js                               |
| Data      | GeoServer REST API · GeoWebCache REST · PostgreSQL + PostGIS    |

```
┌─────────────────────────────────────────────┐
│ FRONTEND  Next.js + TS + Tailwind + OpenLayers│
└─────────────────────┬───────────────────────┘
                 REST API / HTTP
┌─────────────────────▼───────────────────────┐
│ BACKEND   Node.js + TS + Express             │
│  ├── GeoServer REST API                      │
│  ├── GeoWebCache REST                        │
│  └── PostgreSQL / PostGIS                     │
└──────────────┬──────────────┬───────────────┘
               ▼              ▼
          GeoServer      PostgreSQL + PostGIS
               │
               ▼
           NAS / HNAS (NFS)
```

## Struktur Proyek

```
Dashboard Geoserver Services/
├── backend/              # Express API (port 4000)
│   └── src/
│       ├── config/       # env config
│       ├── services/     # geoserver / geowebcache / postgres
│       ├── routes/       # REST endpoints
│       └── middleware/
├── frontend/             # Next.js app (port 3000)
│   └── src/
│       ├── app/          # dashboard, workspaces, layers, styles, cache, database, map
│       ├── components/   # ui (shadcn), layout, map-view (OpenLayers)
│       └── lib/          # api client + utils
└── docker-compose.yml    # GIS stack + dashboard
```

## Menjalankan (Development)

### 1. Backend

```powershell
cd backend
copy .env.example .env   # sesuaikan kredensial GeoServer / PostGIS
npm install
npm run dev              # http://localhost:4000
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev              # http://localhost:3000
```

Frontend membaca `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`) dari `.env.local`.

## Menjalankan (Docker)

Seluruh stack (PostGIS, GeoServer, nginx, backend, frontend) dapat dijalankan bersama:

```powershell
docker compose up -d --build
```

- Dashboard  → http://localhost:3000
- API        → http://localhost:4000
- GeoServer  → http://localhost/geoserver (via nginx)

## Konfigurasi

Backend `.env` (lihat `backend/.env.example`):

| Variabel               | Default                              | Keterangan                       |
| ---------------------- | ------------------------------------ | -------------------------------- |
| `GEOSERVER_URL`        | `http://localhost:8080/geoserver`    | REST API GeoServer (internal)    |
| `GEOSERVER_PUBLIC_URL` | `http://localhost:8080/geoserver`    | URL WMS/WFS untuk peta OpenLayers |
| `GEOSERVER_USER`       | `admin`                              | Admin GeoServer                  |
| `GEOSERVER_PASSWORD`   | `Admin@123`                          | Password admin                   |
| `PGHOST`/`PGPORT`      | `localhost` / `5432`                 | PostgreSQL                       |
| `PGDATABASE`           | `geodb`                              | Database PostGIS                 |

## Fitur

- **Dashboard** — ringkasan jumlah workspaces, layers, layer groups, styles, stores, cached layers, serta status kesehatan tiap service.
- **Workspaces / Layers / Styles** — daftar resource GeoServer dengan pencarian.
- **Tile Cache (GWC)** — lihat cached layers, grid sets, dan truncate cache per layer.
- **PostGIS Database** — daftar tabel dengan estimasi baris, ukuran, dan penanda tabel spasial.
- **Map Preview** — visualisasi layer via WMS menggunakan OpenLayers.

## REST API (Backend)

| Method | Endpoint                                | Deskripsi                        |
| ------ | --------------------------------------- | -------------------------------- |
| GET    | `/api/health`                           | Status agregat semua service     |
| GET    | `/api/geoserver/summary`                | Ringkasan GeoServer              |
| GET    | `/api/geoserver/workspaces`             | Daftar workspaces                |
| GET    | `/api/geoserver/layers`                 | Daftar layers                    |
| GET    | `/api/geoserver/styles`                 | Daftar styles                    |
| GET    | `/api/geoserver/endpoints`              | URL WMS/WFS/WMTS publik          |
| GET    | `/api/gwc/layers`                       | Cached layers                    |
| POST   | `/api/gwc/layers/:name/truncate`        | Kosongkan cache layer            |
| GET    | `/api/postgres/tables`                  | Tabel PostgreSQL/PostGIS         |
| GET    | `/api/postgres/spatial-columns`         | Kolom geometri terdaftar         |
