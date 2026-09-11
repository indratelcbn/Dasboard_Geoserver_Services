import { Router } from 'express';
import { geoserverRouter } from './geoserver.routes.js';
import { gwcRouter } from './gwc.routes.js';
import { postgresRouter } from './postgres.routes.js';
import { storageRouter } from './storage.routes.js';
import { geoserverService } from '../services/geoserver.service.js';
import { gwcService } from '../services/geowebcache.service.js';
import { postgresService } from '../services/postgres.service.js';
import { storageService } from '../services/storage.service.js';
import { asyncHandler } from '../middleware/error.js';

export const apiRouter = Router();

/** Aggregated health of every backing service — powers the dashboard header. */
apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const [geoserver, gwc, postgres, storage] = await Promise.all([
      geoserverService.summary(),
      gwcService.summary(),
      postgresService.ping(),
      storageService.summary(),
    ]);
    res.json({
      timestamp: new Date().toISOString(),
      geoserver,
      geowebcache: gwc,
      postgres,
      storage,
    });
  })
);

apiRouter.use('/geoserver', geoserverRouter);
apiRouter.use('/gwc', gwcRouter);
apiRouter.use('/postgres', postgresRouter);
apiRouter.use('/storage', storageRouter);
