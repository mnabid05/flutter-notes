import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import * as Y from 'yjs';
export class NoteStore {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private directory: string) {}
  async get(id: string) {
    try {
      return JSON.parse(await readFile(path.join(this.directory, `${id}.json`), 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const files = await readdir(this.directory);
    return Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const n = await this.get(f.slice(0, -5));
          return { id: n.id, title: n.title, updatedAt: n.updatedAt };
        }),
    );
  }
  async merge(id: string, title: string, update: string) {
    const previous = this.locks.get(id) || Promise.resolve();
    const job = previous
      .catch(() => {})
      .then(async () => {
        await mkdir(this.directory, { recursive: true });
        const existing = await this.get(id);
        const doc = new Y.Doc();
        try {
          if (existing?.update) Y.applyUpdate(doc, Buffer.from(existing.update, 'base64'));
          Y.applyUpdate(doc, Buffer.from(update, 'base64'));
          const value = {
            id,
            title,
            updatedAt: Date.now(),
            update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
          };
          const filename = path.join(this.directory, `${id}.json`);
          await writeFile(filename + '.tmp', JSON.stringify(value));
          await rename(filename + '.tmp', filename);
          return value;
        } finally {
          doc.destroy();
        }
      });
    this.locks.set(id, job);
    try {
      return await job;
    } finally {
      if (this.locks.get(id) === job) this.locks.delete(id);
    }
  }
}
