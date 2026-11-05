import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { cleanupExpired } from './db.js';
import { loadKeys } from './keys.js';
import { ltiRouter } from './lti.js';
import { apiRouter, mediaStatic } from './api.js';
import { views } from './views.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function createApp() {
  await loadKeys();
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // The tool must be framable by ReachLMS, so no X-Frame-Options. Basic hardening only.
  app.use((req, res, next) => {
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.static(path.join(root, 'public'), { maxAge: '1h' }));
  app.use('/media', mediaStatic());
  app.use(ltiRouter);
  app.use(apiRouter);
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.get('/', (req, res) => res.send(views.message(config.toolName,
    `Interactive content for ReachLMS. Administrators: install with Dynamic Registration using <code>${views.esc(config.publicUrl)}/lti/register</code>, or manually with the JSON at <a href="/lti/canvas-config.json">/lti/canvas-config.json</a>. Teachers can also <a href="/studio">open the studio</a> directly.`)));
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${config.maxUploadMb} MB.` : 'Something went wrong.' });
  });
  setInterval(cleanupExpired, 10 * 60 * 1000).unref();
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const app = await createApp();
  app.listen(config.port, () => console.log(`${config.toolName} listening on ${config.port} (public URL ${config.publicUrl})`));
}
