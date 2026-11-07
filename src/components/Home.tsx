import { useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Moon, Plus, Search, Sun } from 'lucide-react';
import { Butterfly } from './Butterfly';
import type { Note } from '../lib/document';
import type { Intervention } from '../lib/policy';

type Props = {
  notes: Note[];
  activeId: string;
  theme: string;
  level: Intervention;
  mode: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onTheme: (theme: string) => void;
  onLevel: (level: Intervention) => void;
  onExport: () => void;
  canExport: boolean;
};
export default function Home({
  notes,
  activeId,
  theme,
  level,
  mode,
  onOpen,
  onNew,
  onTheme,
  onLevel,
  onExport,
  canExport,
}: Props) {
  const [query, setQuery] = useState('');
  return (
    <div className="home-page">
      <header className="home-header">
        <div className="brand">
          <Butterfly small />
          <span>flutter</span>
        </div>
        <span className="home-tagline">a little room to think</span>
      </header>
      <main className="home-content">
        <section className="home-intro">
          <span className="home-eyebrow">YOUR PERSONAL NOTEBOOK</span>
          <h1>
            Where a thought
            <br />
            takes flight.
          </h1>
          <p>
            Bring a question. Follow a possibility.
            <br />
            You don’t have to think alone.
          </p>
          <button className="home-new" onClick={onNew}>
            <Plus size={16} />
            New document
            <ArrowUpRight size={15} />
          </button>
        </section>
        <aside className="home-companion">
          <Butterfly />
          <span className="companion-label">YOUR COMPANION</span>
          <p>
            A quiet presence, a fresh perspective.
            <br />
            I’ll follow along as you write.
            <br />
            Type <em>/ a thought</em> when you want to talk to me.
          </p>
        </aside>
        <section className="home-notebook" aria-label="Your documents">
          <div className="home-section-heading">
            <h2>Thoughts to return to</h2>
            <label className="home-search">
              <Search size={13} />
              <input
                aria-label="Find a document"
                placeholder="Find a thought…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="home-note-list">
            {notes
              .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
              .map((n) => (
                <button key={n.id} onClick={() => onOpen(n.id)}>
                  <span>
                    {n.title || 'Untitled thought'}
                    {n.id === 'first-flight' && <small>a starting point</small>}
                  </span>
                  <time>
                    {new Date(n.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                  <ArrowUpRight size={14} />
                </button>
              ))}
          </div>
        </section>
        <section className="home-preferences" aria-label="Notebook settings">
          <h2>Make yourself at home</h2>
          <div className="home-preference-grid">
            <div>
              <label>Canvas</label>
              <div className="home-segmented">
                <button aria-pressed={theme === 'light'} onClick={() => onTheme('light')}>
                  <Sun size={13} />
                  Light
                </button>
                <button aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}>
                  <Moon size={13} />
                  Dark
                </button>
              </div>
            </div>
            <div>
              <label>Companion presence</label>
              <div className="home-segmented">
                {(['light', 'medium', 'high'] as const).map((l) => (
                  <button key={l} aria-pressed={level === l} onClick={() => onLevel(l)}>
                    {l[0].toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label>A copy to keep</label>
              <button className="home-export" disabled={!canExport} onClick={onExport}>
                <ArrowDownToLine size={13} />
                Export {notes.find((n) => n.id === activeId)?.title || 'last note'}
              </button>
            </div>
          </div>
          <p className="home-connection">
            <span className="status-dot" />
            {mode === 'live'
              ? 'Your companion is connected.'
              : 'Offline companion · built-in examples. Connect AI in your server configuration for open-ended conversations.'}
          </p>
        </section>
        <p className="home-help">
          <code>/code</code> for Python · <code>/math</code> for equations · <code>/diagram</code>{' '}
          to connect ideas · <code>/dice</code> to experiment
          <br />
          Type a command on its own line and press Enter. Any other <code>/ thought</code> goes
          straight to your companion.
        </p>
      </main>
    </div>
  );
}
