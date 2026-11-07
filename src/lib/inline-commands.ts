import type { JSONContent } from '@tiptap/react';
import type { AgentAnswer } from './schema';
export function parseInlineCommand(
  text: string,
): { kind: 'ask'; prompt: string } | { kind: 'insert'; node: JSONContent } | null {
  if (!text.startsWith('/')) return null;
  const prompt = text.slice(1).trim();
  if (!prompt) return null;
  // A space after / always means a direct thought, even if it begins with “math”.
  if (/^\s/.test(text.slice(1))) return { kind: 'ask', prompt };
  if (prompt === 'code')
    return {
      kind: 'insert',
      node: { type: 'pythonBlock', attrs: { code: '# A small experiment\nprint(2 ** 10)' } },
    };
  if (prompt === 'dice') return { kind: 'insert', node: { type: 'diceBlock' } };
  if (prompt === 'diagram') return { kind: 'insert', node: { type: 'diagramBlock' } };
  if (prompt === 'math' || prompt.startsWith('math '))
    return {
      kind: 'insert',
      node: { type: 'blockMath', attrs: { latex: prompt.slice(4).trim() || 'E = mc^2' } },
    };
  return { kind: 'ask', prompt };
}
export function proposedNodes(blocks: AgentAnswer['blocks']): JSONContent[] {
  return blocks.map((b) =>
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
}
