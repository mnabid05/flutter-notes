import type { JSONContent } from '@tiptap/react';
export const demoCode = `def longest(s: str) -> int:\n    seen = {}\n    left = best = 0\n    for right, char in enumerate(s):\n        if char in seen:\n            left = max(left, seen[char] + 1)\n        seen[char] = right\n        best = max(best, right - left + 1)\n    return best\n\nassert longest("abcabcbb") == 3\nassert longest("bbbbb") == 1\nassert longest("pwwkew") == 3\nassert longest("") == 0\nprint("4 / 4 tests passed. Nicely done.")`;
export const seed: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Given a string, find the longest stretch where no character repeats.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          marks: [{ type: 'italic' }],
          text: 'Start with a small example. Let the pattern find you.',
        },
      ],
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'A little room for the problem' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Return the length of the longest substring with no repeated characters. A substring is continuous; a subsequence doesn’t have to be.',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [{ type: 'code' }],
              text: 'abcabcbb → 3     bbbbb → 1     pwwkew → 3',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Constraint  ' },
            { type: 'inlineMath', attrs: { latex: '0 \\leq |s| \\leq 5 \\cdot 10^4' } },
          ],
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'What if the window could move?' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Keep a window of unique characters. When something repeats, move the left edge just far enough to make room.',
        },
      ],
    },
    { type: 'pythonBlock', attrs: { code: demoCode } },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'A thought to come back to: why should the left edge never move backwards?',
        },
      ],
    },
    { type: 'paragraph' },
  ],
};
export const blank: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
