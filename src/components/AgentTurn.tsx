import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { responseSchema } from '../lib/schema';
import { proposedNodes } from '../lib/inline-commands';

function TurnView({ node, editor, getPos, extension }: NodeViewProps) {
  const { prompt, message, status, mode, accepted, turnId } = node.attrs;
  const parsed = responseSchema.safeParse({
    message: message || '',
    blocks: node.attrs.blocks || [],
  });
  const blocks = parsed.success ? parsed.data.blocks : [];
  const keep = () => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, accepted: true });
        return true;
      })
      .insertContentAt(pos + node.nodeSize, proposedNodes(blocks))
      .run();
  };
  return (
    <NodeViewWrapper className="agent-turn" data-turn-id={turnId} contentEditable={false}>
      <p className="inline-question">
        <span aria-hidden="true">→</span>
        {prompt}
      </p>
      <div className={`inline-answer ${status === 'thinking' ? 'thinking' : ''}`} role="status">
        {status === 'thinking' ? (
          <>
            <span className="inline-thinking-dot" />
            {message || 'Following your thought…'}
            <button className="inline-stop" onClick={() => extension.options.onStop(turnId)}>
              Stop
            </button>
          </>
        ) : (
          <>
            {mode === 'offline' && <span className="inline-mode">offline example</span>}
            <p>{message}</p>
            {status === 'error' && (
              <button
                className="text-button"
                onClick={() => extension.options.onRetry(prompt, turnId)}
              >
                Try this thought again ↗
              </button>
            )}
          </>
        )}
      </div>
      {!!blocks.length && !accepted && status === 'done' && (
        <div className="inline-proposal">
          {blocks.map((b, i) => (
            <div key={i} className={`inline-proposed-${b.type}`}>
              {b.type === 'code' || b.type === 'math' ? (
                <pre>{b.content}</pre>
              ) : b.type === 'diagram' ? (
                <div className="diagram-steps">
                  {b.content
                    .split('\n')
                    .filter(Boolean)
                    .map((step, j) => (
                      <span key={j}>
                        {j > 0 ? ' → ' : ''}
                        {step}
                      </span>
                    ))}
                </div>
              ) : (
                <p>{b.content}</p>
              )}
            </div>
          ))}
          <div className="inline-proposal-actions">
            <button className="text-button" onClick={keep}>
              Keep in note ↗
            </button>
            <button
              className="text-button muted"
              onClick={() => {
                const pos = getPos();
                if (typeof pos === 'number')
                  editor.view.dispatch(
                    editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, blocks: [] }),
                  );
              }}
            >
              Let it pass
            </button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}
export const AgentTurn = Node.create({
  name: 'agentTurn',
  group: 'block',
  atom: true,
  addOptions: () => ({
    onRetry: (_prompt: string, _id: string) => {},
    onStop: (_id: string) => {},
  }),
  addAttributes: () => ({
    turnId: { default: '' },
    prompt: { default: '' },
    message: { default: '' },
    status: { default: 'thinking' },
    mode: { default: '' },
    blocks: { default: [] },
    accepted: { default: false },
  }),
  parseHTML: () => [{ tag: 'div[data-agent-turn]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-agent-turn': '' }),
  ],
  addNodeView: () => ReactNodeViewRenderer(TurnView),
});
