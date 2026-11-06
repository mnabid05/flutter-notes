import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createApp } from './app';
const app = createApp();
app.get('/runner.html', (req, res) => {
  const origin = `http://${req.get('host')}`;
  res
    .type('html')
    .send(readFileSync('public/runner.html', 'utf8').replaceAll('__ORIGIN__', origin));
});
app.use(
  '/pyodide',
  (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.resolve('node_modules/pyodide')),
);
const production = process.env.NODE_ENV === 'production';
if (production) {
  if (!existsSync('dist/index.html')) throw Error('Run pnpm build first.');
  app.use(express.static('dist'));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host))
  throw Error(
    'This single-user release must bind to loopback. Add authentication before deploying publicly.',
  );
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, host, () =>
  console.log(`Flutter is ready at http://${host}:${port}`),
);
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
