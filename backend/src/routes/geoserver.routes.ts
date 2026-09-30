import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Router } from 'express';
import { geoserverService, toArray } from '../services/geoserver.service.js';
import { asyncHandler } from '../middleware/error.js';
import { config } from '../config/env.js';
import { shapefileImportService } from '../services/shapefile-import.service.js';

export const geoserverRouter = Router();

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

geoserverRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json(await geoserverService.summary());
  })
);

geoserverRouter.get(
  '/about',
  asyncHandler(async (_req, res) => {
    res.json(await geoserverService.about());
  })
);

geoserverRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json(await geoserverService.systemStatus());
  })
);

geoserverRouter.get(
  '/workspaces',
  asyncHandler(async (_req, res) => {
    const data = await geoserverService.workspaces();
    res.json(toArray(data?.workspaces?.workspace));
  })
);

geoserverRouter.get('/imports', (_req, res) => {
  res.json(shapefileImportService.listJobs());
});

geoserverRouter.get('/imports/:id', (req, res) => {
  const job = shapefileImportService.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: true, message: 'Import job not found' });
    return;
  }
  res.json(job);
});

geoserverRouter.post('/imports/shapefile', async (req, res, next) => {
  try {
    const fileName = decodeURIComponent(headerValue(req.headers['x-upload-file-name']) ?? 'upload.zip');
    const targetId = headerValue(req.headers['x-target-id']) ?? config.postgres.defaultTargetId;
    const workspace = headerValue(req.headers['x-workspace']) ?? '';
    const schema = headerValue(req.headers['x-schema']) ?? 'public';
    const storeName = headerValue(req.headers['x-store-name']);
    const layerName = headerValue(req.headers['x-layer-name']);
    const overwrite = headerValue(req.headers['x-overwrite']) === 'true';

    if (!workspace.trim()) {
      res.status(400).json({ error: true, message: 'Workspace GeoServer wajib dipilih.' });
      return;
    }

    const contentLength = Number(req.headers['content-length'] ?? 0);
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      res.status(400).json({ error: true, message: 'File ZIP shapefile tidak ditemukan.' });
      return;
    }

    await shapefileImportService.ensureStagingDir();
    const uploadPath = shapefileImportService.buildUploadPath(fileName);
    await pipeline(req, createWriteStream(uploadPath));

    const job = await shapefileImportService.createJob({
      fileName,
      filePath: uploadPath,
      targetId,
      workspace,
      schema,
      storeName,
      layerName,
      overwrite,
    });

    res.status(202).json(job);
  } catch (error) {
    next(error);
  }
});

geoserverRouter.get(
  '/workspaces/:name/stores',
  asyncHandler(async (req, res) => {
    const [ds, cs] = await Promise.all([
      geoserverService.dataStores(req.params.name),
      geoserverService.coverageStores(req.params.name),
    ]);
    res.json({
      dataStores: toArray(ds?.dataStores?.dataStore),
      coverageStores: toArray(cs?.coverageStores?.coverageStore),
    });
  })
);

geoserverRouter.get(
  '/workspaces/:name/postgis-stores',
  asyncHandler(async (req, res) => {
    const targetId = typeof req.query.target === 'string' ? req.query.target : undefined;
    res.json(await geoserverService.postgisDataStores(req.params.name, targetId));
  })
);

geoserverRouter.get(
  '/layers',
  asyncHandler(async (_req, res) => {
    res.json(await geoserverService.layersDetailed());
  })
);

geoserverRouter.get(
  '/layers/:name',
  asyncHandler(async (req, res) => {
    res.json(await geoserverService.layer(req.params.name));
  })
);

geoserverRouter.get(
  '/layergroups',
  asyncHandler(async (_req, res) => {
    const data = await geoserverService.layerGroups();
    res.json(toArray(data?.layerGroups?.layerGroup));
  })
);

geoserverRouter.get(
  '/styles',
  asyncHandler(async (_req, res) => {
    const data = await geoserverService.styles();
    res.json(toArray(data?.styles?.style));
  })
);

// Public endpoints used by the OpenLayers frontend to build WMS/WFS/WMTS URLs.
geoserverRouter.get('/endpoints', (_req, res) => {
  const base = config.geoserver.publicUrl;
  res.json({
    base,
    wms: `${base}/wms`,
    wfs: `${base}/wfs`,
    wmts: `${base}/gwc/service/wmts`,
    wcs: `${base}/wcs`,
  });
});
