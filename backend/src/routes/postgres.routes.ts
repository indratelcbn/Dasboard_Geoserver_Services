import { Router } from 'express';
import { postgresService } from '../services/postgres.service.js';
import { asyncHandler } from '../middleware/error.js';

export const postgresRouter = Router();

postgresRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json(await postgresService.ping());
  })
);

postgresRouter.get(
  '/tables',
  asyncHandler(async (_req, res) => {
    res.json(await postgresService.tables());
  })
);

postgresRouter.get(
  '/spatial-columns',
  asyncHandler(async (_req, res) => {
    res.json(await postgresService.spatialColumns());
  })
);
