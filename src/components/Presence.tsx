import { Pause, Play, X } from 'lucide-react';
import { policies, type Intervention } from '../lib/policy';
export default function Presence({
  level,
  paused,
  onLevel,
  onPause,
  onClose,
}: {
  level: Intervention;
  paused: boolean;
  onLevel: (level: Intervention) => void;
  onPause: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <button className="popover-dismiss" onClick={onClose} aria-label="Close presence controls" />
      <section className="settings-popover" aria-label="Presence controls">
        <div className="popover-heading">
          <span>A presence, at your pace</span>
          <button className="icon-button" onClick={onClose} aria-label="Close presence controls">
            <X size={15} />
          </button>
        </div>
        <p className="popover-description">Choose how often your companion chimes in.</p>
        <div className="level-options">
          {(['light', 'medium', 'high'] as const).map((l) => (
            <button
              key={l}
              aria-pressed={level === l}
              className={level === l ? 'selected' : ''}
              onClick={() => onLevel(l)}
            >
              <span className="level-mark">
                {'●'.repeat(l === 'light' ? 1 : l === 'medium' ? 2 : 3)}
              </span>
              {l[0].toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <strong className="setting-label">{policies[level].label}</strong>
        <p className="popover-description">{policies[level].description}</p>
        <button className="pause-control" onClick={onPause}>
          {paused ? <Play size={14} /> : <Pause size={14} />}{' '}
          {paused ? 'Resume observing' : 'Let me think alone'}
          <span>{paused ? 'Paused' : 'Pause'}</span>
        </button>
      </section>
    </>
  );
}
