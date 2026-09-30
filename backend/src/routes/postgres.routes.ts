import { Router } from 'express';
import { postgresService } from '../services/postgres.service.js';
import { asyncHandler } from '../middleware/error.js';

export const postgresRouter = Router();

function getTargetId(target: unknown): string | undefined {
  return typeof target === 'string' && target.trim() ? target.trim() : undefined;
}

postgresRouter.get(
  '/targets',
  asyncHandler(async (_req, res) => {
    res.json(postgresService.targets());
  })
);

postgresRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json(await postgresService.ping(getTargetId(req.query.target)));
  })
);

postgresRouter.get(
  '/tables',
  asyncHandler(async (req, res) => {
    res.json(await postgresService.tables(getTargetId(req.query.target)));
  })
);

postgresRouter.get(
  '/spatial-columns',
  asyncHandler(async (req, res) => {
    res.json(await postgresService.spatialColumns(getTargetId(req.query.target)));
  })
);
