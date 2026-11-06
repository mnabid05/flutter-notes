import type { AgentRequest, AgentAnswer } from './schema';
export async function askAgent(
  request: AgentRequest,
  signal: AbortSignal,
  onStage: (stage: string) => void,
): Promise<AgentAnswer | null> {
  const response = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Your companion couldn’t connect. Try again in a moment.');
  }
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer: AgentAnswer | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === 'stage') onStage(event.stage);
      if (event.type === 'result') answer = event.answer;
      if (event.type === 'error') throw new Error(event.message);
    }
  }
  return answer;
}
