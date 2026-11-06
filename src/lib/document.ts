import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
export type Note = { id: string; title: string; updatedAt: number };
const key = 'flutter-notes-v1';
export function readNotes(): Note[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(saved) && saved.length)
      return saved.filter((n) => typeof n.id === 'string' && typeof n.title === 'string');
  } catch {}
  return [{ id: 'first-flight', title: 'Longest run without repeats', updatedAt: Date.now() }];
}
export function saveNotes(notes: Note[]) {
  localStorage.setItem(key, JSON.stringify(notes));
}
export function encode(doc: Y.Doc) {
  const bytes = Y.encodeStateAsUpdate(doc);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function apply(doc: Y.Doc, value: string) {
  Y.applyUpdate(
    doc,
    Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
    'remote',
  );
}
export function openDocument(id: string) {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(`flutter-${id}`, doc);
  return { doc, persistence };
}
