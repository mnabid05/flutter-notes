export type Intervention = 'light' | 'medium' | 'high';
export const policies = {
  light: {
    pause: 12000,
    cooldown: 120000,
    minChange: 100,
    label: 'Only when it matters',
    description: 'An occasional nudge after a longer pause.',
  },
  medium: {
    pause: 6500,
    cooldown: 60000,
    minChange: 45,
    label: 'A thoughtful balance',
    description: 'Helpful connections when you pause to think.',
  },
  high: {
    pause: 3500,
    cooldown: 25000,
    minChange: 20,
    label: 'Think out loud together',
    description: 'More frequent ideas, questions, and gentle guidance.',
  },
} as const;
export function shouldEvaluate(
  level: Intervention,
  text: string,
  previous: string,
  elapsed: number,
) {
  if (text.trim().length < 30 || text === previous || elapsed < policies[level].cooldown)
    return false;
  let prefix = 0;
  while (prefix < Math.min(text.length, previous.length) && text[prefix] === previous[prefix])
    prefix++;
  const change = Math.max(text.length, previous.length) - prefix;
  return change >= policies[level].minChange;
}
export function fingerprint(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
