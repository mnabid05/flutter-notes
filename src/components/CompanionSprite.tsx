import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowUpRight, X } from 'lucide-react';
import { Butterfly } from './Butterfly';

type Props = {
  editor: Editor | null;
  state: string;
  paused: boolean;
  busy: boolean;
  stage: string;
  thought?: string;
  hidden: boolean;
  onTalk: () => void;
  onDismiss: () => void;
};

/** The companion lives beside the current line, outside the editable document. */
export default function CompanionSprite({
  editor,
  state,
  paused,
  busy,
  stage,
  thought,
  hidden,
  onTalk,
  onDismiss,
}: Props) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const lastLine = useRef<number | null>(null);

  useEffect(() => {
    if (!editor || editor.isDestroyed || hidden) return;
    let frame = 0;
    let disposed = false;
    const place = () => {
      frame = 0;
      if (disposed || editor.isDestroyed || !editor.view.dom.isConnected) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const bounds = editor.view.dom.getBoundingClientRect();
      let lineY = lastLine.current ?? bounds.top;
      let caretX = bounds.right;
      const following = !paused && editor.view.dom.contains(document.activeElement);

      if (!paused) {
        // CodeMirror owns its own selection; prefer the visible DOM caret when it is
        // inside this document, then use ProseMirror's selection for ordinary prose.
        const selection = window.getSelection();
        if (selection?.rangeCount && editor.view.dom.contains(selection.anchorNode)) {
          const caret = selection.getRangeAt(0).getBoundingClientRect();
          if (caret.height) {
            lineY = caret.top;
            caretX = caret.right;
          } else {
            const caret = editor.view.coordsAtPos(editor.state.selection.head);
            lineY = caret.top;
            caretX = caret.right;
          }
        } else {
          const caret = editor.view.coordsAtPos(editor.state.selection.head);
          lineY = caret.top;
          caretX = caret.right;
        }
        lastLine.current = lineY;
      }
      const anchorX = following && !busy && !thought ? caretX + 28 : bounds.right + 18;
      const x = Math.max(12, Math.min(anchorX, width - 60));
      const y = Math.max(offsetTop + 100, Math.min(lineY - 12, offsetTop + height - 168));
      setPosition((old) =>
        old && Math.abs(old.x - x) < 2 && Math.abs(old.y - y) < 2 ? old : { x, y },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    editor.on('selectionUpdate', schedule);
    editor.on('transaction', schedule);
    editor.on('focus', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    document.addEventListener('selectionchange', schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(editor.view.dom);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      editor.off('selectionUpdate', schedule);
      editor.off('transaction', schedule);
      editor.off('focus', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('selectionchange', schedule);
    };
  }, [editor, paused, hidden, busy, Boolean(thought)]);

  if (hidden || !position) return null;
  return (
    <aside
      className={`companion-sprite ${paused ? 'is-paused' : ''}`}
      aria-label="Floating companion"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <button className="sprite-button" aria-label="Talk to your companion" onClick={onTalk}>
        <Butterfly state={busy ? 'thinking' : paused ? 'resting' : state} />
      </button>
      {(busy || thought) && (
        <div
          className="sprite-thought"
          style={position.x < 260 ? { left: 10, right: 'auto' } : undefined}
        >
          {!busy && (
            <button
              className="sprite-dismiss"
              aria-label="Dismiss companion thought"
              onClick={onDismiss}
            >
              <X size={12} />
            </button>
          )}
          <p role="status">{busy ? stage || 'Thinking with you…' : thought}</p>
          {!busy && (
            <button className="text-button" onClick={onTalk}>
              Think it through <ArrowUpRight size={12} />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
