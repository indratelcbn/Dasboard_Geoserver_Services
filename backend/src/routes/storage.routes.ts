import { Router } from 'express';
import { storageService } from '../services/storage.service.js';
import { asyncHandler } from '../middleware/error.js';

export const storageRouter = Router();

storageRouter.get(
  '/stores',
  asyncHandler(async (_req, res) => {
    res.json(await storageService.fileStores());
  })
);

storageRouter.get(
  '/stores/:workspace/:store',
  asyncHandler(async (req, res) => {
    res.json(await storageService.storeContents(req.params.workspace, req.params.store));
  })
);
