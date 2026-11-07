import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
export const InlineDirective = Extension.create({
  name: 'inlineDirective',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'paragraph' && node.textContent.startsWith('/'))
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'direct-thought',
                    'data-hint':
                      node.textContent.trim() === '/' ? 'a thought for your companion…' : '',
                  }),
                );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
