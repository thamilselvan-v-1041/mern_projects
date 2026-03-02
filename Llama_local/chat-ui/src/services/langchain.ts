const LC_BASE = `http://${window.location.hostname}:8200`;

export type Provider = 'ollama' | 'openai' | 'groq';

interface SmartEvent {
  event: 'status' | 'chunk' | 'done';
  provider: string;
  content?: string;
  message?: string;
}

export async function checkLangChainHealth(): Promise<{
  status: string;
  providers: string[];
  groq_configured: boolean;
}> {
  const res = await fetch(`${LC_BASE}/health`);
  if (!res.ok) throw new Error('LangChain server unreachable');
  return res.json();
}

export async function* streamSmartChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  directGroq = false
): AsyncGenerator<SmartEvent> {
  const res = await fetch(`${LC_BASE}/chat/smart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, direct_groq: directGroq }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `Error ${res.status}` }));
    throw new Error(err.detail || `LangChain error: ${res.status}`);
  }
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as SmartEvent;
      } catch {
        // skip malformed
      }
    }
  }
}
