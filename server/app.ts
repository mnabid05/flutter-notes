import express from 'express';
import { z } from 'zod';
import { NoteStore } from './store';
import { requestSchema } from '../src/lib/schema';
import { policies } from '../src/lib/policy';
import { respond } from './companion';
export function createApp(directory = '.data/notes') {
  const app = express();
  const store = new NoteStore(directory);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) {
      res.status(403).end('Invalid host');
      return;
    }
    next();
  });
  // This single-user release is loopback-only. Never expose it as a multi-tenant service.
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && origin !== `http://${req.get('host')}`) {
      res.status(403).json({ error: 'Cross-origin API requests are not allowed.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, ai: !!process.env.AI_GATEWAY_API_KEY }),
  );
  app.get('/api/notes', async (_req, res, next) => {
    try {
      res.json(await store.list());
    } catch (e) {
      next(e);
    }
  });
  const validId = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
  app.get('/api/notes/:id', async (req, res, next) => {
    try {
      const id = validId.parse(req.params.id);
      const note = await store.get(id);
      if (!note) {
        res.sendStatus(404);
        return;
      }
      res.json(note);
    } catch (e) {
      next(e);
    }
  });
  app.put('/api/notes/:id', async (req, res, next) => {
    try {
      const id = validId.parse(req.params.id);
      const body = z
        .object({
          title: z.string().max(300),
          update: z
            .string()
            .max(1800000)
            .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        })
        .parse(req.body);
      res.json(await store.merge(id, body.title, body.update));
    } catch (e) {
      next(e);
    }
  });
  const running = new Map<string, AbortController>();
  const ambientTimes = new Map<string, number>();
  let recent: number[] = [];
  app.post('/api/agent', async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request. Please shorten your message.' });
      return;
    }
    const input = parsed.data;
    const now = Date.now();
    recent = recent.filter((t) => now - t < 60000);
    if (recent.length >= 20) {
      res.status(429).json({ error: 'A lot of thoughts at once. Give your companion a minute.' });
      return;
    }
    if (
      input.intent === 'ambient' &&
      now - (ambientTimes.get(input.noteId) || 0) < policies[input.intervention].cooldown
    ) {
      res.type('application/x-ndjson').end(JSON.stringify({ type: 'result', answer: null }) + '\n');
      return;
    }
    if (input.intent === 'ambient') ambientTimes.set(input.noteId, now);
    if (ambientTimes.size > 1000)
      for (const [id, time] of ambientTimes) if (now - time > 120000) ambientTimes.delete(id);
    recent.push(now);
    running.get(input.noteId)?.abort();
    const controller = new AbortController();
    running.set(input.noteId, controller);
    const timeout = setTimeout(() => controller.abort(), 45000);
    res.on('close', () => controller.abort());
    res.status(200).type('application/x-ndjson').setHeader('X-Content-Type-Options', 'nosniff');
    res.flushHeaders();
    const send = (event: unknown) => {
      if (!res.destroyed) res.write(JSON.stringify(event) + '\n');
    };
    try {
      const answer = await respond(input, controller.signal, (stage) =>
        send({ type: 'stage', stage }),
      );
      if (!controller.signal.aborted) send({ type: 'result', answer, revision: input.revision });
    } catch (e) {
      if (!res.destroyed)
        send({
          type: 'error',
          message: controller.signal.aborted
            ? 'This thought took too long. Try a shorter question.'
            : 'The AI connection failed. Check the server’s API key and model access, then try again.',
        });
      console.error('Companion request failed:', e instanceof Error ? e.name : 'unknown');
    } finally {
      clearTimeout(timeout);
      if (running.get(input.noteId) === controller) running.delete(input.noteId);
      res.end();
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res
        .status(error instanceof z.ZodError ? 400 : 500)
        .json({
          error:
            error instanceof z.ZodError
              ? 'Invalid note data.'
              : 'Could not save this note. Your local copy is still available.',
        });
    },
  );
  return app;
}
