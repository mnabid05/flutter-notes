import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { NoteStore } from '../server/store';
import { shouldEvaluate, policies, fingerprint } from '../src/lib/policy';
import { offlineAnswer } from '../server/companion';
import { requestSchema, responseSchema, type AgentRequest } from '../src/lib/schema';
import { createApp } from '../server/app';
const request: AgentRequest = {
  noteId: 'test-note',
  prompt: 'Give me a hint',
  context: 'Find the longest substring without repeats.',
  selection: '',
  revision: 'r1',
  intent: 'hint',
  intervention: 'medium',
  history: [],
};
test('intervention budgets respect the level and suppress repeated content', () => {
  const text = 'I am stuck on a problem and need to find a simpler approach.';
  assert.equal(shouldEvaluate('high', text, '', 30000), true);
  assert.equal(shouldEvaluate('medium', text, '', 30000), false);
  assert.equal(shouldEvaluate('light', text, '', 150000), false);
  assert.equal(shouldEvaluate('high', text, text, 150000), false);
  assert.ok(policies.high.pause < policies.light.pause);
  assert.notEqual(fingerprint('one'), fingerprint('two'));
});
test('offline help is transparent and normal writing remains quiet', () => {
  const answer = offlineAnswer(request)!;
  assert.equal(answer.mode, 'offline');
  assert.match(answer.message, /abba/);
  assert.equal(offlineAnswer({ ...request, intent: 'ambient' }), null);
  assert.match(
    offlineAnswer({ ...request, prompt: 'What is the weather?', intent: 'ask' })!.message,
    /offline mode/,
  );
  assert.equal(
    responseSchema.safeParse({ ...answer, blocks: [{ type: 'html', content: '<script>' }] })
      .success,
    false,
  );
  assert.equal(requestSchema.safeParse({ ...request, noteId: '../secrets' }).success, false);
});
test('concurrent Yjs edits merge, survive restart, and preserve both changes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flutter-store-'));
  try {
    const store = new NoteStore(directory);
    const a = new Y.Doc();
    a.getText('text').insert(0, 'Hello');
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    a.getText('text').insert(5, ' A');
    b.getText('text').insert(5, ' B');
    await Promise.all([
      store.merge('note', 'A', Buffer.from(Y.encodeStateAsUpdate(a)).toString('base64')),
      store.merge('note', 'B', Buffer.from(Y.encodeStateAsUpdate(b)).toString('base64')),
    ]);
    const persisted = await new NoteStore(directory).get('note');
    const restored = new Y.Doc();
    Y.applyUpdate(restored, Buffer.from(persisted.update, 'base64'));
    assert.match(restored.getText('text').toString(), /A/);
    assert.match(restored.getText('text').toString(), /B/);
    assert.equal((await store.list()).length, 1);
    a.destroy();
    b.destroy();
    restored.destroy();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('HTTP validates requests, rejects opaque origins, saves notes and streams offline answers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flutter-api-'));
  const app = createApp(directory);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const addr = server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}`;
  try {
    assert.equal((await fetch(url + '/api/health')).status, 200);
    assert.equal((await fetch(url + '/api/notes', { headers: { Origin: 'null' } })).status, 403);
    assert.equal(
      (
        await fetch(url + '/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      400,
    );
    const doc = new Y.Doc();
    doc.getText('body').insert(0, 'A durable thought.');
    const result = await fetch(url + '/api/notes/test', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test',
        update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
      }),
    });
    assert.equal(result.status, 200);
    assert.equal((await (await fetch(url + '/api/notes/test')).json()).title, 'Test');
    const savedKey = process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    try {
      const stream = await fetch(url + '/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      assert.equal(stream.status, 200);
      const events = (await stream.text())
        .trim()
        .split('\n')
        .map((s) => JSON.parse(s));
      assert.equal(events.at(-1).answer.mode, 'offline');
    } finally {
      if (savedKey) process.env.AI_GATEWAY_API_KEY = savedKey;
    }
    doc.destroy();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await rm(directory, { recursive: true, force: true });
  }
});

test('agent context includes code and LaTeX, and changes invalidate stale suggestions', async () => {
  const { nodeText, contextWindow } = await import('../src/lib/context');
  const before = nodeText({
    type: 'doc',
    content: [
      { type: 'pythonBlock', attrs: { code: 'print(1)' } },
      { type: 'blockMath', attrs: { latex: 'x^2' } },
    ],
  });
  const after = nodeText({
    type: 'doc',
    content: [
      { type: 'pythonBlock', attrs: { code: 'print(2)' } },
      { type: 'blockMath', attrs: { latex: 'x^2' } },
    ],
  });
  assert.match(before, /print\(1\)/);
  assert.match(before, /x\^2/);
  assert.notEqual(fingerprint(before), fingerprint(after));
  assert.ok(contextWindow('a'.repeat(40000)).length <= 18000);
});
