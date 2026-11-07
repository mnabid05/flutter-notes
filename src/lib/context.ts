import type { Editor, JSONContent } from '@tiptap/react';
export function nodeText(node: JSONContent): string {
  if (node.type === 'agentTurn')
    return (
      '\nUser: ' +
      node.attrs?.prompt +
      (node.attrs?.status === 'done' ? '\nCompanion: ' + node.attrs?.message : '') +
      '\n'
    );
  if (node.type === 'text') return node.text || '';
  if (node.type === 'pythonBlock') return '\n```python\n' + node.attrs?.code + '\n```\n';
  if (node.type === 'blockMath' || node.type === 'inlineMath') return '$' + node.attrs?.latex + '$';
  if (node.type === 'diagramBlock') return '\nDiagram: ' + node.attrs?.content + '\n';
  if (node.type === 'diceBlock')
    return '\nDice simulation: ' + (node.attrs?.rolls || []).join(',') + '\n';
  return (node.content || [])
    .map(nodeText)
    .join(['paragraph', 'heading'].includes(node.type || '') ? '' : '\n');
}
export function noteText(editor: Editor) {
  return nodeText(editor.getJSON());
}
export function contextWindow(text: string) {
  return text.length <= 18000
    ? text
    : text.slice(0, 2000) + '\n[… earlier content omitted …]\n' + text.slice(-15000);
}
