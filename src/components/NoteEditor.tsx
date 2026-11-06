import { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Mathematics } from '@tiptap/extension-mathematics';
import Collaboration from '@tiptap/extension-collaboration';
import UniqueID from '@tiptap/extension-unique-id';
import type * as Y from 'yjs';
import { PythonBlock, DiceBlock, DiagramBlock } from './Blocks';
import { openDocument, apply, encode, type Note } from '../lib/document';
import { noteText } from '../lib/context';
import { seed, blank } from '../lib/seed';

type Props = {
  note: Note;
  onEditor: (editor: Editor | null) => void;
  onChange: (text: string) => void;
  onSave: (status: string) => void;
  onSlash: () => void;
  onMath: (position: number, latex: string) => void;
};
export default function NoteEditor(props: Props) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  useEffect(() => {
    const { doc: document, persistence } = openDocument(props.note.id);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let syncing = false,
      dirty = false;
    async function sync() {
      if (!active || syncing) {
        dirty = true;
        return;
      }
      syncing = true;
      dirty = false;
      try {
        const res = await fetch(`/api/notes/${props.note.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: callbacks.current.note.title, update: encode(document) }),
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) throw Error();
        const data = await res.json();
        if (active) {
          apply(document, data.update);
          callbacks.current.onSave('Saved');
        }
      } catch {
        if (active) callbacks.current.onSave('Saved on this device');
      } finally {
        syncing = false;
        if (dirty && active) timer = setTimeout(sync, 700);
      }
    }
    const changed = (_: unknown, origin: unknown) => {
      if (origin === 'remote') return;
      queueMicrotask(() => {
        if (active) callbacks.current.onSave('Saving…');
      });
      clearTimeout(timer);
      timer = setTimeout(sync, 700);
    };
    void (async () => {
      await persistence.whenSynced;
      try {
        const res = await fetch(`/api/notes/${props.note.id}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          apply(document, data.update);
        }
      } catch {}
      if (!active) return;
      document.on('update', changed);
      setDoc(document);
    })();
    const interval = setInterval(() => {
      if (active && globalThis.document.visibilityState !== 'hidden') void sync();
    }, 15000);
    // IndexedDB owns immediate persistence; the server is a second durable copy.
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(interval);
      document.off('update', changed);
      void persistence.destroy();
      document.destroy();
    };
  }, [props.note.id]);
  useEffect(() => {
    if (doc) doc.getMap('metadata').set('title', props.note.title);
  }, [doc, props.note.title]);
  return doc ? (
    <EditorBody {...props} doc={doc} />
  ) : (
    <div className="loading-note">Opening a little room to think…</div>
  );
}
function EditorBody({ doc, ...props }: Props & { doc: Y.Doc }) {
  const handlers = useRef(props);
  handlers.current = props;
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ undoRedo: false, codeBlock: false }),
        Placeholder.configure({
          placeholder: 'Let a thought land here. Type / to ask your companion…',
        }),
        Collaboration.configure({ document: doc }),
        UniqueID.configure({
          types: [
            'paragraph',
            'heading',
            'blockquote',
            'pythonBlock',
            'blockMath',
            'diagramBlock',
            'diceBlock',
          ],
        }),
        Mathematics.configure({
          inlineOptions: { onClick: (node, pos) => handlers.current.onMath(pos, node.attrs.latex) },
          blockOptions: { onClick: (node, pos) => handlers.current.onMath(pos, node.attrs.latex) },
          katexOptions: { throwOnError: false, trust: false },
        }),
        PythonBlock,
        DiceBlock,
        DiagramBlock,
      ],
      editorProps: {
        attributes: { class: 'note-prose', 'aria-label': 'Note content', spellcheck: 'true' },
        handleKeyDown: (view, event) => {
          const parent = view.state.selection.$from.parent;
          if (
            event.key === '/' &&
            !event.metaKey &&
            !event.ctrlKey &&
            parent.type.name === 'paragraph' &&
            parent.textContent.trim() === ''
          ) {
            event.preventDefault();
            handlers.current.onSlash();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        const text = noteText(editor);
        queueMicrotask(() => handlers.current.onChange(text));
      },
      onCreate: ({ editor }) => {
        if (editor.isEmpty && !doc.getMap('metadata').get('initialized')) {
          editor.commands.setContent(props.note.id === 'first-flight' ? seed : blank);
          doc.getMap('metadata').set('initialized', true);
        }
      },
    },
    [doc],
  );
  useEffect(() => {
    if (editor) props.onEditor(editor);
  }, [editor]);
  return <EditorContent editor={editor} />;
}
