import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/error.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/', (_req, res) => {
  res.json({
    name: 'Dashboard Geoserver Services API',
    version: '1.0.0',
    status: 'ok',
    docs: '/api/health',
  });
});

app.use('/api', apiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: true, message: 'Not found' });
});

app.use(errorHandler);

app.listen(config.port, () => {
  const primaryPostgres =
    config.postgres.targets.find((target) => target.id === config.postgres.defaultTargetId) ??
    config.postgres.targets[0];

  // eslint-disable-next-line no-console
  console.log(`\n  Dashboard Geoserver Services API`);
  // eslint-disable-next-line no-console
  console.log(`  ▸ Listening on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`  ▸ GeoServer:   ${config.geoserver.url}`);
  // eslint-disable-next-line no-console
  console.log(
    `  ▸ PostGIS:     ${primaryPostgres.host}:${primaryPostgres.port}/${primaryPostgres.database} (${config.postgres.targets.length} target)` +
      `${config.postgres.targets.length > 1 ? 's' : ''}\n`
  );
});
