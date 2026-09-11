import { Request, Response, NextFunction } from 'express';
import { GeoServerService } from '../services/geoserver.service.js';

/** Wrap async route handlers so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const { status, message } = GeoServerService.describeError(err);
  // eslint-disable-next-line no-console
  console.error('[error]', message);
  res.status(status).json({ error: true, message });
}
