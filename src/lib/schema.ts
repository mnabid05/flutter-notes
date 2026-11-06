import { z } from 'zod';
export const blockSchema = z.object({
  type: z.enum(['paragraph', 'heading', 'code', 'math', 'diagram']),
  content: z.string().max(12000),
});
export const responseSchema = z.object({
  message: z.string().max(5000),
  blocks: z.array(blockSchema).max(8),
});
export type AgentAnswer = z.infer<typeof responseSchema> & {
  mode: 'live' | 'offline';
  stale?: boolean;
};
export const requestSchema = z.object({
  noteId: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
  prompt: z.string().max(4000),
  context: z.string().max(18000),
  selection: z.string().max(4000).default(''),
  revision: z.string().max(40),
  intent: z.enum(['ask', 'hint', 'explain', 'diagram', 'code', 'ambient']),
  intervention: z.enum(['light', 'medium', 'high']),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .max(8)
    .default([]),
});
export type AgentRequest = z.infer<typeof requestSchema>;
