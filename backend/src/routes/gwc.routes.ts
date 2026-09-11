import { Router } from 'express';
import { gwcService } from '../services/geowebcache.service.js';
import { toArray } from '../services/geoserver.service.js';
import { asyncHandler } from '../middleware/error.js';

export const gwcRouter = Router();

gwcRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json(await gwcService.summary());
  })
);

gwcRouter.get(
  '/layers',
  asyncHandler(async (_req, res) => {
    const data = await gwcService.layers();
    res.json(toArray(data?.layers?.string));
  })
);

gwcRouter.get(
  '/gridsets',
  asyncHandler(async (_req, res) => {
    const data = await gwcService.gridSets();
    res.json(toArray(data?.gridSets?.string));
  })
);

gwcRouter.get(
  '/statistics',
  asyncHandler(async (_req, res) => {
    res.json(await gwcService.statistics());
  })
);

gwcRouter.get(
  '/layers/:name',
  asyncHandler(async (req, res) => {
    res.json(await gwcService.layer(req.params.name));
  })
);

gwcRouter.post(
  '/layers/:name/truncate',
  asyncHandler(async (req, res) => {
    await gwcService.truncateLayer(req.params.name);
    res.json({ ok: true, message: `Cache truncated for ${req.params.name}` });
  })
);
