import { useEffect, useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { Play, Square, RotateCcw, ArrowRight } from 'lucide-react';

function PythonView({ node, updateAttributes }: NodeViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const cm = useRef<EditorView | null>(null);
  const update = useRef(updateAttributes);
  update.current = updateAttributes;
  const runner = useRef<HTMLIFrameElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const code = useRef(String(node.attrs.code));
  code.current = String(node.attrs.code);
  useEffect(() => {
    const view = new EditorView({
      parent: container.current!,
      state: EditorState.create({
        doc: code.current,
        extensions: [
          python(),
          lineNumbers(),
          syntaxHighlighting(defaultHighlightStyle),
          keymap.of([...defaultKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            'aria-label': 'Python code editor',
            spellcheck: 'false',
          }),
          EditorView.updateListener.of((v) => {
            if (v.docChanged) update.current({ code: v.state.doc.toString() });
          }),
        ],
      }),
    });
    cm.current = view;
    return () => {
      view.destroy();
      stopRef.current?.();
    };
  }, []);
  useEffect(() => {
    const view = cm.current;
    if (view && view.state.doc.toString() !== node.attrs.code)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: node.attrs.code } });
  }, [node.attrs.code]);
  function run() {
    if (running) {
      stopRef.current?.();
      setStatus('Stopped.');
      return;
    }
    const snapshot = code.current;
    setRunning(true);
    setStatus('Warming up Python…');
    // Opaque-origin iframe + its own worker: Python cannot read the app DOM, storage, or API.
    const frame = document.createElement('iframe');
    frame.sandbox.add('allow-scripts');
    frame.hidden = true;
    frame.src = '/runner.html';
    document.body.append(frame);
    runner.current = frame;
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      frame.remove();
      runner.current = null;
      setRunning(false);
      stopRef.current = null;
    };
    const receive = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      if (e.data?.type === 'ready')
        frame.contentWindow!.postMessage({ type: 'run', code: snapshot }, '*');
      if (e.data?.type === 'started') {
        clearTimeout(timer);
        timer = setTimeout(() => {
          finish();
          setStatus('Stopped after 8 seconds. Check for an infinite loop.');
        }, 8000);
        setStatus('Running…');
      }
      if (e.data?.type === 'result') {
        const message = String(e.data.output).slice(0, 16000);
        finish();
        setStatus(
          code.current === snapshot
            ? message || 'Finished with no output.'
            : 'Code changed during execution. Run again for a current result.',
        );
      }
    };
    window.addEventListener('message', receive);
    timer = setTimeout(() => {
      finish();
      setStatus('Python could not start in time. Try again.');
    }, 45000);
    stopRef.current = finish;
  }
  return (
    <NodeViewWrapper className="code-cell" contentEditable={false}>
      <div className="cell-label">
        <span>
          <span className="status-dot" /> PYTHON{' '}
          <span className="cell-caption">a small experiment</span>
        </span>
        <button
          onClick={run}
          className="run-button"
          aria-label={running ? 'Stop Python' : 'Run Python'}
        >
          {running ? <Square size={12} /> : <Play size={12} />} {running ? 'Stop' : 'Run'}
        </button>
      </div>
      <div ref={container} />
      {status && (
        <div className={`code-output ${running ? 'pending' : ''}`} role="status">
          <span>↳</span>
          <pre>{status}</pre>
        </div>
      )}
    </NodeViewWrapper>
  );
}
export const PythonBlock = Node.create({
  name: 'pythonBlock',
  group: 'block',
  atom: true,
  addAttributes: () => ({ code: { default: 'print("Hello, possibility.")' } }),
  parseHTML: () => [{ tag: 'div[data-python]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-python': '' }),
  ],
  addNodeView: () => ReactNodeViewRenderer(PythonView),
});

function DiceView({ node, updateAttributes }: NodeViewProps) {
  const rolls: number[] = node.attrs.rolls;
  function roll() {
    const values = new Uint32Array(100);
    crypto.getRandomValues(values);
    updateAttributes({ rolls: Array.from(values, (v) => 1 + Math.floor((v / 4294967296) * 6)) });
  }
  const count = rolls.filter((v) => v === 5).length;
  return (
    <NodeViewWrapper className="dice-block" contentEditable={false}>
      <div className="cell-label">
        <span>AN EXPERIMENT IN CHANCE</span>
        <button className="run-button" onClick={roll}>
          <RotateCcw size={12} /> Roll 100 dice
        </button>
      </div>
      {rolls.length ? (
        <>
          <div className="dice-grid">
            {rolls.map((v, i) => (
              <span
                className={`die ${v === 5 ? 'chosen' : ''}`}
                key={i}
                style={{ animationDelay: `${i * 9}ms` }}
                aria-label={`Die ${i + 1}: ${v}`}
              >
                {['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][v - 1]}
              </span>
            ))}
          </div>
          <div className="experiment-footer">
            <span>
              <b>{count}</b> fives in {rolls.length} rolls
            </span>
            <span>expected ≈ 16.7</span>
          </div>
        </>
      ) : (
        <p className="muted">A hundred possibilities. Roll to see what happens.</p>
      )}
    </NodeViewWrapper>
  );
}
export const DiceBlock = Node.create({
  name: 'diceBlock',
  group: 'block',
  atom: true,
  addAttributes: () => ({ rolls: { default: [] } }),
  parseHTML: () => [{ tag: 'div[data-dice]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-dice': '' })],
  addNodeView: () => ReactNodeViewRenderer(DiceView),
});
function DiagramView({ node }: NodeViewProps) {
  const steps = String(node.attrs.content).split('\n').filter(Boolean).slice(0, 8);
  return (
    <NodeViewWrapper className="diagram-block" contentEditable={false}>
      <div className="cell-label">A WAY TO SEE IT</div>
      <div className="diagram-steps">
        {steps.map((s, i) => (
          <div className="diagram-step" key={i}>
            <span>{s}</span>
            {i < steps.length - 1 && <ArrowRight size={18} />}
          </div>
        ))}
      </div>
    </NodeViewWrapper>
  );
}
export const DiagramBlock = Node.create({
  name: 'diagramBlock',
  group: 'block',
  atom: true,
  addAttributes: () => ({ content: { default: 'Observe\nMake a small guess\nTest it\nRefine' } }),
  parseHTML: () => [{ tag: 'div[data-diagram]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-diagram': '' }),
  ],
  addNodeView: () => ReactNodeViewRenderer(DiagramView),
});
