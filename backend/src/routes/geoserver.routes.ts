import { Router } from 'express';
import { geoserverService, toArray } from '../services/geoserver.service.js';
import { asyncHandler } from '../middleware/error.js';
import { config } from '../config/env.js';

export const geoserverRouter = Router();

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
