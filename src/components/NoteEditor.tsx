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
import { TextSelection } from '@tiptap/pm/state';
import { AgentTurn } from './AgentTurn';
import { InlineDirective } from './InlineDirective';
import { parseInlineCommand } from '../lib/inline-commands';

type Props = {
  note: Note;
  onEditor: (editor: Editor | null) => void;
  onChange: (text: string, fromAgent?: boolean) => void;
  onSave: (status: string) => void;
  onAsk: (prompt: string, turnId: string) => void;
  onStop: (turnId: string) => void;
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
          placeholder: ({ node }) =>
            node.type.name === 'paragraph' ? 'Bring a thought. Type / to think together…' : '',
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
        AgentTurn.configure({
          onRetry: (prompt: string, id: string) => handlers.current.onAsk(prompt, id),
          onStop: (id: string) => handlers.current.onStop(id),
        }),
        InlineDirective,
        PythonBlock,
        DiceBlock,
        DiagramBlock,
      ],
      editorProps: {
        attributes: { class: 'note-prose', 'aria-label': 'Note content', spellcheck: 'true' },
        handleKeyDown: (view, event) => {
          if (
            event.isComposing ||
            event.key !== 'Enter' ||
            event.shiftKey ||
            event.metaKey ||
            event.ctrlKey
          )
            return false;
          const { $from, empty } = view.state.selection;
          if (!empty || $from.parent.type.name !== 'paragraph') return false;
          const command = parseInlineCommand($from.parent.textContent);
          if (!command) return false;
          event.preventDefault();
          const from = $from.before(),
            to = $from.after();
          const turnId = crypto.randomUUID();
          const content =
            command.kind === 'insert'
              ? command.node
              : {
                  type: 'agentTurn',
                  attrs: { turnId, prompt: command.prompt, status: 'thinking' },
                };
          // One undoable transaction replaces the directive and opens the next writing line.
          const ed = handlers.current;
          const replacement = view.state.schema.nodeFromJSON(content);
          const paragraph = view.state.schema.nodes.paragraph.create();
          const tr = view.state.tr.replaceWith(from, to, [replacement, paragraph]);
          tr.setSelection(TextSelection.create(tr.doc, from + replacement.nodeSize + 1));
          view.dispatch(tr);
          // Let the editor's native transaction settle before starting a network request.
          if (command.kind === 'ask') queueMicrotask(() => ed.onAsk(command.prompt, turnId));
          return true;
        },
      },
      onUpdate: ({ editor, transaction }) => {
        const text = noteText(editor);
        const fromAgent = Boolean(transaction.getMeta('agent'));
        queueMicrotask(() => handlers.current.onChange(text, fromAgent));
      },
      onCreate: ({ editor }) => {
        const tr = editor.state.tr;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'agentTurn' && node.attrs.status === 'thinking')
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              status: 'error',
              message: 'This thought was interrupted. You can try it again.',
            });
        });
        if (tr.docChanged) editor.view.dispatch(tr);
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
