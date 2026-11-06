import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/react';
import {
  ArrowDownToLine,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Command,
  FileText,
  Lightbulb,
  Moon,
  Plus,
  Search,
  Settings2,
  Sigma,
  Sun,
  X,
  Network,
  Dices,
  PanelLeft,
  Pause,
  Play,
  Undo2,
  Redo2,
  Square,
  ArrowUpRight,
} from 'lucide-react';
import { Butterfly } from './components/Butterfly';
import NoteEditor from './components/NoteEditor';
import { readNotes, saveNotes, type Note } from './lib/document';
import { policies, fingerprint, shouldEvaluate, type Intervention } from './lib/policy';
import { noteText, contextWindow } from './lib/context';
import { askAgent } from './lib/agent-client';
import type { AgentAnswer, AgentRequest } from './lib/schema';

type Message = { role: 'user' | 'assistant'; content: string };
function stored(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
export default function App() {
  const [notes, setNotes] = useState<Note[]>(readNotes);
  const [active, setActive] = useState(() => stored('flutter-active', 'first-flight'));
  const note = notes.find((n) => n.id === active) || notes[0];
  const [theme, setTheme] = useState(() => stored('flutter-theme', 'dark'));
  const [level, setLevel] = useState<Intervention>(() => {
    const v = stored('flutter-intervention', 'medium');
    return v in policies ? (v as Intervention) : 'medium';
  });
  const [paused, setPaused] = useState(() => stored('flutter-paused', 'false') === 'true');
  const [sidebar, setSidebar] = useState(false);
  const [settings, setSettings] = useState(false);
  const [command, setCommand] = useState(false);
  const [chat, setChat] = useState(false);
  const [query, setQuery] = useState('');
  const [prompt, setPrompt] = useState('');
  const [save, setSave] = useState('Saved on this device');
  const [toast, setToast] = useState('');
  const [status, setStatus] = useState('resting');
  const [stage, setStage] = useState('');
  const [mode, setMode] = useState<'live' | 'offline'>('offline');
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [math, setMath] = useState<{ pos: number | null; latex: string } | null>(null);
  const editor = useRef<Editor | null>(null);
  const abort = useRef<AbortController | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previous = useRef('');
  const lastIntervention = useRef(0);
  const currentRevision = useRef('');
  const answerRevision = useRef('');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('flutter-theme', theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('flutter-intervention', level);
  }, [level]);
  useEffect(() => {
    try {
      saveNotes(notes);
    } catch {
      setToast('Device storage is full. Export your notes to keep a backup.');
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
    abort.current?.abort();
    if (idle.current) clearTimeout(idle.current);
    setBusy(false);
    setStatus('resting');
    setAnswer(null);
    setMessages([]);
    setError('');
    previous.current = '';
    lastIntervention.current = 0;
    currentRevision.current = '';
  }, [note.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommand((v) => !v);
      }
      if (e.key === 'Escape') {
        setCommand(false);
        setSettings(false);
        setSidebar(false);
        setChat(false);
        setMath(null);
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, []);
  const setEditor = useCallback((value: Editor | null) => {
    editor.current = value;
  }, []);
  const noteRef = useRef(note);
  noteRef.current = note;
  const levelRef = useRef(level);
  levelRef.current = level;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const requestRef = useRef<(intent: AgentRequest['intent'], text: string) => void>(() => {});
  const onChange = useCallback((text: string) => {
    currentRevision.current = fingerprint(text);
    setStatus('attentive');
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      setStatus('resting');
      if (
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
        requestRef.current(
          'ambient',
          'Offer one useful, gentle observation only if it is genuinely warranted.',
        );
      }
    }, policies[levelRef.current].pause);
  }, []);
  useEffect(() => {
    localStorage.setItem('flutter-paused', String(paused));
    if (idle.current) clearTimeout(idle.current);
    if (paused) {
      abort.current?.abort();
      setBusy(false);
      setStatus('resting');
    }
    return () => {
      if (idle.current) clearTimeout(idle.current);
    };
  }, [paused, level]);
  useEffect(() => {
    if (!command && !math) return;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector('[role="dialog"]');
      const controls = dialog?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input, textarea, [tabindex="0"]',
      );
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => window.removeEventListener('keydown', trap);
  }, [command, Boolean(math)]);
  useEffect(() => () => abort.current?.abort(), []);
  async function request(intent: AgentRequest['intent'], text: string) {
    const ed = editor.current;
    if (!ed) return;
    if (intent === 'ambient' && (busy || answer || chat || command)) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const context = contextWindow(noteText(ed));
    const revision = fingerprint(noteText(ed));
    currentRevision.current = revision;
    const selection = ed.state.doc
      .textBetween(ed.state.selection.from, ed.state.selection.to, ' ')
      .slice(0, 4000);
    setBusy(true);
    setStatus('thinking');
    setError('');
    setStage(intent === 'ambient' ? 'Listening to the thought…' : 'Following your thought…');
    setAnswer(null);
    if (intent !== 'ambient') {
      setMessages((m) => [...m, { role: 'user', content: text }]);
      setChat(true);
      setCommand(false);
      setPrompt('');
    }
    try {
      const result = await askAgent(
        {
          noteId: noteRef.current.id,
          prompt: text,
          context,
          selection,
          revision,
          intent,
          intervention: levelRef.current,
          history: messages.slice(-8).map((m) => ({ ...m, content: m.content.slice(0, 2000) })),
        },
        controller.signal,
        setStage,
      );
      if (controller.signal.aborted) return;
      setStatus('resting');
      if (result) {
        const stale = currentRevision.current !== revision;
        if (intent === 'ambient' && stale) return;
        answerRevision.current = revision;
        setAnswer({ ...result, stale });
        setStatus('presenting');
        setMessages((m) => [...m, { role: 'assistant', content: result.message }]);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
        setStatus('resting');
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setStage('');
      }
    }
  }
  requestRef.current = (intent, text) => {
    void request(intent, text);
  };
  function addNote() {
    const created = { id: crypto.randomUUID(), title: 'Untitled thought', updatedAt: Date.now() };
    setNotes((n) => [created, ...n]);
    setActive(created.id);
    setSidebar(false);
  }
  function rename(title: string) {
    setNotes((n) => n.map((v) => (v.id === note.id ? { ...v, title, updatedAt: Date.now() } : v)));
  }
  function insert(type: string) {
    const ed = editor.current;
    if (!ed) return;
    setCommand(false);
    if (type === 'math') {
      setMath({ pos: null, latex: 'E = mc^2' });
      return;
    }
    const node: JSONContent =
      type === 'code'
        ? { type: 'pythonBlock', attrs: { code: '# A small experiment\nprint(2 ** 10)' } }
        : type === 'dice'
          ? { type: 'diceBlock' }
          : { type: 'diagramBlock' };
    ed.chain()
      .focus()
      .insertContent([node, { type: 'paragraph' }])
      .run();
  }
  function accept() {
    if (!answer || !editor.current) return;
    const ed = editor.current;
    if (fingerprint(noteText(ed)) !== answerRevision.current) {
      setAnswer({ ...answer, stale: true });
      setToast('Your note changed. Ask again to get a current suggestion.');
      return;
    }
    const nodes: JSONContent[] = answer.blocks.map((b) =>
      b.type === 'code'
        ? { type: 'pythonBlock', attrs: { code: b.content } }
        : b.type === 'math'
          ? { type: 'blockMath', attrs: { latex: b.content } }
          : b.type === 'diagram'
            ? { type: 'diagramBlock', attrs: { content: b.content } }
            : {
                type: b.type,
                attrs: b.type === 'heading' ? { level: 2 } : undefined,
                content: [{ type: 'text', text: b.content || ' ' }],
              },
    );
    ed.chain()
      .focus()
      .insertContentAt(ed.state.doc.content.size, [...nodes, { type: 'paragraph' }])
      .run();
    setAnswer(null);
    setToast('Added to your note. You can undo this anytime.');
  }
  function exportNote() {
    const ed = editor.current;
    if (!ed) return;
    const blob = new Blob(
      [JSON.stringify({ title: note.title, document: ed.getJSON() }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.replace(/[^\w -]/g, '').trim() || 'note'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast('Note exported, including math and code.');
  }
  const actions = [
    {
      label: 'Ask your companion',
      hint: 'A fresh perspective',
      icon: Lightbulb,
      run: () => {
        setCommand(false);
        setChat(true);
      },
    },
    {
      label: 'Python block',
      hint: 'Write and run a little code',
      icon: Code2,
      run: () => insert('code'),
    },
    { label: 'Math equation', hint: 'Make room for LaTeX', icon: Sigma, run: () => insert('math') },
    { label: 'Diagram', hint: 'Connect the dots', icon: Network, run: () => insert('diagram') },
    {
      label: 'Roll 100 dice',
      hint: 'An experiment in chance',
      icon: Dices,
      run: () => insert('dice'),
    },
  ];
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <button
            className="brand"
            onClick={() => setSidebar((v) => !v)}
            aria-label="Open notebook"
          >
            <Butterfly small />
            <span>flutter</span>
          </button>
          <span className="header-divider" />
          <button className="notebook-trigger" onClick={() => setSidebar((v) => !v)}>
            <span>Personal notebook</span>
            <ChevronDown size={12} />
          </button>
        </div>
        <div className="header-right">
          <span className="save-indicator">
            <Check size={12} />
            {save}
          </span>
          <button className="intervention-trigger" onClick={() => setSettings((v) => !v)}>
            <span className={`status-dot ${paused ? 'paused' : ''}`} />
            {paused ? 'Resting' : `${level[0].toUpperCase() + level.slice(1)} presence`}
            <ChevronDown size={12} />
          </button>
          <button
            className="icon-button theme-button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>
      <main className="writing-room">
        <div className="page-eyebrow">
          <span className="tiny-star">✳</span> A LITTLE ROOM TO THINK{' '}
          <span className="eyebrow-line" />
        </div>
        <div className="title-row">
          <input
            aria-label="Note title"
            className="note-title"
            value={note.title}
            onChange={(e) => rename(e.target.value)}
            placeholder="Untitled thought"
          />
        </div>
        <div className="note-meta">
          <span>THE WORKING NOTE</span>
          <span>·</span>
          <span>
            {new Date(note.updatedAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>
        <div className="document-wrap">
          <NoteEditor
            key={note.id}
            note={note}
            onEditor={setEditor}
            onChange={onChange}
            onSave={setSave}
            onSlash={() => setCommand(true)}
            onMath={(pos, latex) => setMath({ pos, latex })}
          />
        </div>
        <div className="end-mark">a thought is a beginning, not a conclusion.</div>
        <aside
          className={`companion-margin ${busy ? 'is-thinking' : ''}`}
          aria-label="Your companion"
        >
          <button
            className="companion-button"
            onClick={() => setChat((v) => !v)}
            aria-label="Talk to your companion"
          >
            <Butterfly state={status} />
          </button>
          <div className="companion-rule" />
          <span className="companion-label">YOUR COMPANION</span>
          <p>
            {busy
              ? stage
              : answer && !chat
                ? answer.message
                : paused
                  ? 'I’ll be here when you need me.'
                  : 'There’s a pattern in here. Take your time — I’m thinking with you.'}
          </p>
          {answer && !chat && (
            <>
              <button className="text-button" onClick={() => setChat(true)}>
                Take a closer look <ArrowUpRight size={12} />
              </button>
              <button
                className="text-button muted"
                onClick={() => {
                  setAnswer(null);
                  lastIntervention.current = Date.now();
                }}
              >
                Let it pass
              </button>
            </>
          )}
          <span className="presence-caption">
            <span className="status-dot" />
            {busy ? 'following along' : paused ? 'resting nearby' : 'quietly alongside'}
          </span>
        </aside>
      </main>
      <footer className="bottom-bar">
        <div className="bottom-status">
          <span className="status-dot" />
          <span>{mode === 'live' ? 'Connected companion' : 'Offline companion'}</span>
        </div>
        <div className="editor-dock">
          <button aria-label="Open notebook" onClick={() => setSidebar(true)}>
            <PanelLeft size={16} />
          </button>
          <span className="dock-separator" />
          <button aria-label="Insert block" onClick={() => setCommand(true)}>
            <Plus size={18} />
          </button>
          <button aria-label="Insert equation" onClick={() => insert('math')}>
            <Sigma size={17} />
          </button>
          <button aria-label="Insert code" onClick={() => insert('code')}>
            <Code2 size={17} />
          </button>
          <span className="dock-separator" />
          <button
            className="ask-button"
            onClick={() => {
              setChat(true);
              setCommand(false);
            }}
          >
            <Butterfly small /> Ask companion <kbd>/</kbd>
          </button>
          <span className="dock-separator" />
          <button aria-label="Undo" onClick={() => editor.current?.commands.undo()}>
            <Undo2 size={15} />
          </button>
          <button aria-label="Redo" onClick={() => editor.current?.commands.redo()}>
            <Redo2 size={15} />
          </button>
        </div>
        <button className="export-button" onClick={exportNote}>
          <ArrowDownToLine size={14} />
          <span>Export note</span>
        </button>
      </footer>
      {settings && (
        <>
          <button
            className="popover-dismiss"
            onClick={() => setSettings(false)}
            aria-label="Close settings"
          />
          <section className="settings-popover" aria-label="Companion settings">
            <div className="popover-heading">
              <span>A presence, at your pace</span>
              <button
                className="icon-button"
                onClick={() => setSettings(false)}
                aria-label="Close settings"
              >
                <X size={15} />
              </button>
            </div>
            <p className="popover-description">Choose how often your companion chimes in.</p>
            <div className="level-options">
              {(['light', 'medium', 'high'] as const).map((l) => (
                <button
                  key={l}
                  className={level === l ? 'selected' : ''}
                  onClick={() => setLevel(l)}
                >
                  <span className={`level-mark ${l}`}>
                    ●{l !== 'light' ? '●' : ''}
                    {l === 'high' ? '●' : ''}
                  </span>
                  <span>{l[0].toUpperCase() + l.slice(1)}</span>
                </button>
              ))}
            </div>
            <strong className="setting-label">{policies[level].label}</strong>
            <p className="popover-description">{policies[level].description}</p>
            <button className="pause-control" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={14} /> : <Pause size={14} />}{' '}
              {paused ? 'Resume observing' : 'Let me think alone'}
              <span>{paused ? 'Paused' : 'Pause'}</span>
            </button>
            <div className="settings-theme">
              <span>Canvas</span>
              <div>
                <button
                  className={theme === 'light' ? 'selected' : ''}
                  onClick={() => setTheme('light')}
                >
                  <Sun size={13} />
                  Light
                </button>
                <button
                  className={theme === 'dark' ? 'selected' : ''}
                  onClick={() => setTheme('dark')}
                >
                  <Moon size={13} />
                  Dark
                </button>
              </div>
            </div>
            <p className="privacy-note">
              Only this note is shared with AI when it’s connected. Your keystrokes stay on your
              device.
            </p>
          </section>
        </>
      )}
      {sidebar && (
        <>
          <button className="scrim" onClick={() => setSidebar(false)} aria-label="Close notebook" />
          <aside className="notebook-panel">
            <div className="panel-heading">
              <span>Your notebook</span>
              <button
                className="icon-button"
                onClick={() => setSidebar(false)}
                aria-label="Close notebook"
              >
                <X size={18} />
              </button>
            </div>
            <p className="panel-subtitle">A place for unfinished thoughts.</p>
            <button className="new-note" onClick={addNote}>
              <Plus size={16} />
              New thought
            </button>
            <label className="search-field">
              <Search size={14} />
              <input
                placeholder="Find a thought…"
                aria-label="Find a note"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="notes-list">
              {notes
                .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
                .map((n) => (
                  <button
                    key={n.id}
                    className={n.id === note.id ? 'active' : ''}
                    onClick={() => {
                      setActive(n.id);
                      setSidebar(false);
                    }}
                  >
                    <FileText size={16} />
                    <span>
                      {n.title || 'Untitled thought'}
                      <small>
                        {new Date(n.updatedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </small>
                    </span>
                    <ChevronRight size={13} />
                  </button>
                ))}
            </div>
            <div className="notebook-bottom">
              <Butterfly small />
              <span>
                Collect thoughts.
                <br />
                Leave room for wonder.
              </span>
            </div>
          </aside>
        </>
      )}
      {command && (
        <div className="modal-overlay" onClick={() => setCommand(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Insert or ask"
            className="command-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-input">
              <Command size={17} />
              <input
                autoFocus
                placeholder="Ask anything, or add to your note…"
                aria-label="Command or question"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && prompt.trim()) void request('ask', prompt);
                }}
              />
              <button
                onClick={() => setCommand(false)}
                className="icon-button"
                aria-label="Close commands"
              >
                <X size={16} />
              </button>
            </div>
            <div className="command-actions">
              {actions
                .filter((a) => !prompt || a.label.toLowerCase().includes(prompt.toLowerCase()))
                .map((a) => (
                  <button key={a.label} onClick={a.run}>
                    <a.icon size={18} />
                    <span>
                      {a.label}
                      <small>{a.hint}</small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              {prompt && (
                <button onClick={() => void request('ask', prompt)}>
                  <Lightbulb size={18} />
                  <span>
                    Ask “{prompt}”<small>Think it through together</small>
                  </span>
                  <ArrowUp size={15} />
                </button>
              )}
            </div>
            <div className="command-footer">
              A small nudge can open a new direction.<kbd>esc</kbd>
            </div>
          </section>
        </div>
      )}
      {chat && (
        <section className="chat-panel" aria-label="Companion conversation">
          <div className="chat-heading">
            <div>
              <Butterfly small />
              <span>
                Think with me
                <small>
                  {mode === 'live' ? 'Your connected companion' : 'Offline · built-in guidance'}
                </small>
              </span>
            </div>
            <button
              className="icon-button"
              onClick={() => setChat(false)}
              aria-label="Close conversation"
            >
              <X size={17} />
            </button>
          </div>
          <div className="chat-scroll">
            {!messages.length && !busy && (
              <div className="chat-welcome">
                <p>What’s on your mind?</p>
                <span>
                  A question, a half-formed idea, a place you’re stuck. We can start anywhere.
                </span>
                <div className="starter-prompts">
                  {[
                    ['Give me a gentle hint', 'hint'],
                    ['Help me see the pattern', 'diagram'],
                    ['Explain this idea', 'explain'],
                  ].map(([t, i]) => (
                    <button key={i} onClick={() => void request(i as AgentRequest['intent'], t)}>
                      {t}
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
                {mode === 'offline' && (
                  <p className="offline-note">
                    Built-in examples work now. Connect an AI Gateway key on the server for
                    open-ended conversation.
                  </p>
                )}
              </div>
            )}
            {messages.slice(-6).map((m, i) => (
              <div className={`chat-message ${m.role}`} key={i}>
                <span>{m.role === 'user' ? 'YOU' : 'COMPANION'}</span>
                <p>{m.content}</p>
              </div>
            ))}
            {busy && (
              <div className="thinking-line">
                <span className="thinking-dots">···</span>
                {stage}
              </div>
            )}
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            {answer?.blocks.length ? (
              <div className="proposal">
                <div className="cell-label">A THOUGHT TO KEEP</div>
                {answer.blocks.map((b, i) => (
                  <div key={i} className="proposal-block">
                    <small>{b.type}</small>
                    <pre>{b.content}</pre>
                  </div>
                ))}
                {answer.stale && (
                  <p className="muted">
                    Your note changed while I was thinking. Ask again before adding this.
                  </p>
                )}
                <div className="proposal-actions">
                  <button className="primary-button" disabled={answer.stale} onClick={accept}>
                    <Plus size={14} />
                    Add to note
                  </button>
                  <button className="text-button" onClick={() => setAnswer(null)}>
                    Let it pass
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              if (prompt.trim()) void request('ask', prompt);
            }}
          >
            <textarea
              aria-label="Message your companion"
              autoFocus
              placeholder="A thought, a question…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (prompt.trim()) void request('ask', prompt);
                }
              }}
            />
            {busy ? (
              <button
                type="button"
                aria-label="Stop response"
                onClick={() => {
                  abort.current?.abort();
                  setBusy(false);
                  setStatus('resting');
                }}
              >
                <Square size={14} />
              </button>
            ) : (
              <button type="submit" disabled={!prompt.trim()} aria-label="Send message">
                <ArrowUp size={17} />
              </button>
            )}
          </form>
          <div className="chat-footnote">
            Your work stays yours. Suggestions are always optional.
          </div>
        </section>
      )}
      {math && (
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
            <p className="muted">Inline equations also work with $…$ as you type.</p>
            <button
              className="primary-button"
              onClick={() => {
                const ed = editor.current;
                if (!ed || !math.latex.trim()) return;
                if (math.pos !== null) {
                  const node = ed.state.doc.nodeAt(math.pos);
                  if (node)
                    ed.view.dispatch(
                      ed.state.tr.setNodeMarkup(math.pos, undefined, {
                        ...node.attrs,
                        latex: math.latex,
                      }),
                    );
                } else
                  ed.chain()
                    .focus()
                    .insertContent([
                      { type: 'blockMath', attrs: { latex: math.latex } },
                      { type: 'paragraph' },
                    ])
                    .run();
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
