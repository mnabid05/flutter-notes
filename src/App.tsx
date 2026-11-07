import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, Check, ChevronDown, X } from 'lucide-react';
import Home from './components/Home';
import Presence from './components/Presence';
import CompanionSprite from './components/CompanionSprite';
import NoteEditor from './components/NoteEditor';
import { readNotes, saveNotes, type Note } from './lib/document';
import { policies, fingerprint, shouldEvaluate, type Intervention } from './lib/policy';
import { noteText, contextWindow } from './lib/context';
import { askAgent } from './lib/agent-client';
import type { AgentAnswer, AgentRequest } from './lib/schema';

function stored(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function patchTurn(ed: Editor, id: string, attrs: Record<string, unknown>) {
  if (ed.isDestroyed) return false;
  let position: number | undefined;
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name === 'agentTurn' && node.attrs.turnId === id) {
      position = pos;
      return false;
    }
  });
  if (position === undefined) return false;
  const node = ed.state.doc.nodeAt(position)!;
  ed.view.dispatch(
    ed.state.tr
      .setNodeMarkup(position, undefined, { ...node.attrs, ...attrs })
      .setMeta('agent', true),
  );
  return true;
}
export default function App() {
  const [notes, setNotes] = useState<Note[]>(readNotes);
  const [active, setActive] = useState(() => stored('flutter-active', 'first-flight'));
  const note = notes.find((n) => n.id === active) || notes[0];
  const [home, setHome] = useState(() => stored('flutter-view', 'home') === 'home');
  const [theme, setTheme] = useState(() => stored('flutter-theme', 'dark'));
  const [level, setLevel] = useState<Intervention>(() => {
    const value = stored('flutter-intervention', 'medium');
    return value in policies ? (value as Intervention) : 'medium';
  });
  const [paused, setPaused] = useState(() => stored('flutter-paused', 'false') === 'true');
  const [presence, setPresence] = useState(false);
  const [save, setSave] = useState('Saved on this device');
  const [toast, setToast] = useState('');
  const [status, setStatus] = useState('resting');
  const [stage, setStage] = useState('');
  const [mode, setMode] = useState<'live' | 'offline'>('offline');
  const [ambient, setAmbient] = useState<AgentAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [anchorId, setAnchorId] = useState<string | undefined>();
  const [math, setMath] = useState<{ pos: number; latex: string } | null>(null);
  const editor = useRef<Editor | null>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const pending = useRef<{ controller: AbortController; editor: Editor; turnId?: string } | null>(
    null,
  );
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drift = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previous = useRef('');
  const lastIntervention = useRef(0);
  const homeRef = useRef(home);
  homeRef.current = home;
  const levelRef = useRef(level);
  levelRef.current = level;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const requestRef = useRef<
    (intent: AgentRequest['intent'], text: string, turnId?: string) => void
  >(() => {});
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('flutter-theme', theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('flutter-view', home ? 'home' : 'note');
  }, [home]);
  useEffect(() => {
    localStorage.setItem('flutter-intervention', level);
    localStorage.setItem('flutter-paused', String(paused));
    if (idle.current) clearTimeout(idle.current);
    if (paused && pending.current && !pending.current.turnId) stopCurrent();
  }, [level, paused]);
  useEffect(() => {
    try {
      saveNotes(notes);
    } catch {
      setToast('Device storage is full. Export your note to keep a backup.');
    }
  }, [notes]);
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setMode(d.ai ? 'live' : 'offline'))
      .catch(() => {});
    fetch('/api/notes')
      .then((r) => r.json())
      .then((remote: Note[]) => {
        if (Array.isArray(remote))
          setNotes((local) => {
            const ids = new Set(local.map((n) => n.id));
            return [...local, ...remote.filter((n) => !ids.has(n.id))];
          });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    localStorage.setItem('flutter-active', note.id);
    setAmbient(null);
    setAnchorId(undefined);
    previous.current = '';
    lastIntervention.current = 0;
  }, [note.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPresence(false);
        setMath(null);
      }
      if (!homeRef.current && (e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        beginThought();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(
    () => () => {
      pending.current?.controller.abort();
      if (idle.current) clearTimeout(idle.current);
      if (drift.current) clearTimeout(drift.current);
    },
    [],
  );
  const setEditor = useCallback((value: Editor | null) => {
    editor.current = value;
    setActiveEditor(value);
  }, []);
  const onChange = useCallback((text: string, fromAgent = false) => {
    if (fromAgent || homeRef.current) return;
    setStatus('attentive');
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      setStatus('resting');
      if (
        !homeRef.current &&
        !pausedRef.current &&
        document.visibilityState === 'visible' &&
        shouldEvaluate(
          levelRef.current,
          text,
          previous.current,
          Date.now() - lastIntervention.current,
        )
      ) {
        previous.current = text;
        lastIntervention.current = Date.now();
        requestRef.current('ambient', 'Offer one useful, gentle observation only if warranted.');
      }
    }, policies[levelRef.current].pause);
  }, []);
  function stopCurrent(id?: string) {
    const run = pending.current;
    if (id && run?.turnId !== id) return;
    if (run) {
      run.controller.abort();
      if (run.turnId)
        patchTurn(run.editor, run.turnId, {
          status: 'error',
          message: 'This thought was stopped. You can come back to it whenever you like.',
        });
    }
    pending.current = null;
    setBusy(false);
    setStatus('resting');
    setAnchorId(undefined);
  }
  async function request(intent: AgentRequest['intent'], text: string, turnId?: string) {
    const ed = editor.current;
    if (!ed || ed.isDestroyed || homeRef.current) return;
    if (intent === 'ambient' && (pending.current || ambient || presence || math)) return;
    stopCurrent();
    if (idle.current) clearTimeout(idle.current);
    if (drift.current) clearTimeout(drift.current);
    const controller = new AbortController();
    pending.current = { controller, editor: ed, turnId };
    const revision = fingerprint(noteText(ed));
    setAmbient(null);
    setBusy(true);
    setStatus('thinking');
    setStage('Following your thought…');
    setAnchorId(turnId);
    if (turnId)
      patchTurn(ed, turnId, {
        status: 'thinking',
        message: 'Following your thought…',
        blocks: [],
        accepted: false,
      });
    const history: AgentRequest['history'] = [];
    ed.state.doc.descendants((node) => {
      if (
        node.type.name === 'agentTurn' &&
        node.attrs.turnId !== turnId &&
        node.attrs.status === 'done'
      ) {
        history.push(
          { role: 'user', content: String(node.attrs.prompt).slice(0, 2000) },
          { role: 'assistant', content: String(node.attrs.message).slice(0, 2000) },
        );
      }
    });
    try {
      const result = await askAgent(
        {
          noteId: note.id,
          prompt: text,
          context: contextWindow(noteText(ed)),
          selection: '',
          revision,
          intent,
          intervention: level,
          history: history.slice(-8),
        },
        controller.signal,
        (s) => {
          setStage(s);
          if (turnId) patchTurn(ed, turnId, { message: s });
        },
      );
      if (controller.signal.aborted) return;
      if (result) {
        if (turnId) {
          patchTurn(ed, turnId, { ...result, status: 'done' });
          setStatus('presenting');
        } else if (fingerprint(noteText(ed)) === revision) {
          setAmbient(result);
          setStatus('presenting');
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        const message =
          e instanceof Error ? e.message : 'Your companion couldn’t connect. Try again.';
        if (turnId) patchTurn(ed, turnId, { status: 'error', message });
        else setAmbient({ message, blocks: [], mode });
      }
    } finally {
      if (pending.current?.controller === controller) {
        pending.current = null;
        setBusy(false);
        setStage('');
        if (turnId)
          drift.current = setTimeout(() => {
            setAnchorId(undefined);
            setStatus('resting');
          }, 7000);
        else setStatus('resting');
      }
    }
  }
  requestRef.current = (intent, text, turnId) => {
    void request(intent, text, turnId);
  };
  function beginThought() {
    const ed = editor.current;
    if (!ed || ed.isDestroyed) return;
    const { $from } = ed.state.selection;
    if ($from.parent.type.name === 'paragraph' && !$from.parent.textContent) {
      ed.chain().focus().insertContent('/ ').run();
    } else
      ed.chain()
        .focus()
        .insertContentAt(ed.state.doc.content.size, {
          type: 'paragraph',
          content: [{ type: 'text', text: '/ ' }],
        })
        .run();
  }
  function openNote(id: string) {
    stopCurrent();
    if (idle.current) clearTimeout(idle.current);
    setActive(id);
    setHome(false);
    setPresence(false);
    setMath(null);
  }
  function goHome() {
    stopCurrent();
    if (idle.current) clearTimeout(idle.current);
    setHome(true);
    setPresence(false);
    setMath(null);
    setAmbient(null);
  }
  function addNote() {
    const n = { id: crypto.randomUUID(), title: 'Untitled thought', updatedAt: Date.now() };
    setNotes((v) => [n, ...v]);
    openNote(n.id);
  }
  function exportNote() {
    const ed = editor.current;
    if (!ed || ed.isDestroyed) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ title: note.title, document: ed.getJSON() }, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.replace(/[^\w -]/g, '').trim() || 'note'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast('Your note is exported, including equations and code.');
  }
  return (
    <div className="app-shell">
      {home && (
        <Home
          notes={notes}
          activeId={note.id}
          theme={theme}
          level={level}
          mode={mode}
          onOpen={openNote}
          onNew={addNote}
          onTheme={setTheme}
          onLevel={setLevel}
          onExport={exportNote}
          canExport={!!activeEditor && !activeEditor.isDestroyed}
        />
      )}
      <div className="note-view" hidden={home}>
        <header className="note-header">
          <button className="back-home" onClick={goHome}>
            <ArrowLeft size={14} />
            <span>home</span>
          </button>
          <button className="intervention-trigger" onClick={() => setPresence((v) => !v)}>
            <span className={`status-dot ${paused ? 'paused' : ''}`} />
            {paused ? 'Resting' : `${level[0].toUpperCase() + level.slice(1)} presence`}
            <ChevronDown size={12} />
          </button>
        </header>
        <main className="writing-room quiet-document">
          <input
            aria-label="Note title"
            className="note-title"
            maxLength={300}
            value={note.title}
            onChange={(e) =>
              setNotes((v) =>
                v.map((n) =>
                  n.id === note.id ? { ...n, title: e.target.value, updatedAt: Date.now() } : n,
                ),
              )
            }
            placeholder="Untitled thought"
          />
          <div className="document-wrap">
            <NoteEditor
              key={note.id}
              note={note}
              onEditor={setEditor}
              onChange={onChange}
              onSave={setSave}
              onAsk={(text, id) => void request('ask', text, id)}
              onStop={stopCurrent}
              onMath={(pos, latex) => setMath({ pos, latex })}
            />
          </div>
        </main>
        <div className="quiet-save" aria-live="polite">
          {save === 'Saving…' ? save : ''}
        </div>
      </div>
      <CompanionSprite
        key={note.id}
        editor={activeEditor}
        state={status}
        paused={paused}
        busy={busy}
        stage={anchorId ? '' : stage}
        thought={ambient?.message}
        anchorId={anchorId}
        hidden={home || presence || !!math}
        onTalk={beginThought}
        onDismiss={() => {
          setAmbient(null);
          lastIntervention.current = Date.now();
        }}
      />
      {presence && !home && (
        <Presence
          level={level}
          paused={paused}
          onLevel={setLevel}
          onPause={() => setPaused((p) => !p)}
          onClose={() => setPresence(false)}
        />
      )}
      {math && !home && (
        <div className="modal-overlay" onClick={() => setMath(null)}>
          <section
            className="math-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Edit equation"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <span>A little mathematics</span>
              <button
                className="icon-button"
                aria-label="Close equation"
                onClick={() => setMath(null)}
              >
                <X size={17} />
              </button>
            </div>
            <label htmlFor="latex">LaTeX expression</label>
            <textarea
              id="latex"
              autoFocus
              value={math.latex}
              onChange={(e) => setMath({ ...math, latex: e.target.value })}
            />
            <button
              className="primary-button"
              onClick={() => {
                const ed = editor.current;
                if (!ed || !math.latex.trim()) return;
                const node = ed.state.doc.nodeAt(math.pos);
                if (node)
                  ed.view.dispatch(
                    ed.state.tr.setNodeMarkup(math.pos, undefined, {
                      ...node.attrs,
                      latex: math.latex,
                    }),
                  );
                setMath(null);
              }}
            >
              Keep this equation
              <Check size={14} />
            </button>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={14} />
          {toast}
        </div>
      )}
    </div>
  );
}
