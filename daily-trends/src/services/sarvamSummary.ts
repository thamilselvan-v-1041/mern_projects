const SARVAM_BASE = 'https://api.sarvam.ai'
const CHAT_COMPLETIONS_PATH = '/v1/chat/completions'

const SUMMARY_CACHE_KEY = 'dailyTrends.sarvamSummary.v3'

interface SarvamSummaryCacheItem {
  title: string
  summaryHtml: string
}

function capChars(value: string, maxChars: number): string {
  const text = value.trim()
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
}

function readCache(): Record<string, SarvamSummaryCacheItem> {
  const raw = localStorage.getItem(SUMMARY_CACHE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, SarvamSummaryCacheItem>
  } catch {
    return {}
  }
}

function writeCache(cache: Record<string, SarvamSummaryCacheItem>): void {
  localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(cache))
}

function htmlToPlainText(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const text = doc.body.textContent || ''
  return text.replace(/\s+/g, ' ').trim()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function toSummaryHtml(text: string): string {
  const clean = text.trim()
  if (!clean) return '<p>No summary available.</p>'

  let paragraphs = clean
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean)

  // If model returns a single block, split into sentence-based chunks.
  if (paragraphs.length <= 1) {
    const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean)
    paragraphs = []
    let current = ''
    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence}` : sentence
      if (next.length < 170) {
        current = next
      } else {
        if (current) paragraphs.push(current)
        current = sentence
      }
    }
    if (current) paragraphs.push(current)
  }

  // Ensure at least 3 paragraphs when content length allows it.
  if (paragraphs.length < 3 && clean.length > 600) {
    const merged = paragraphs.join(' ')
    const sentences = merged.split(/(?<=[.!?])\s+/).filter(Boolean)
    const targetParagraphs = 3
    const chunkSize = Math.max(1, Math.ceil(sentences.length / targetParagraphs))
    const rebuilt: string[] = []
    for (let i = 0; i < sentences.length; i += chunkSize) {
      rebuilt.push(sentences.slice(i, i + chunkSize).join(' ').trim())
    }
    paragraphs = rebuilt.filter(Boolean)
  }

  // Prefer substantial paragraphs: merge very short fragments into neighbors.
  const normalized: string[] = []
  for (const paragraph of paragraphs) {
    if (normalized.length > 0 && paragraph.length < 150) {
      normalized[normalized.length - 1] = `${normalized[normalized.length - 1]} ${paragraph}`.trim()
    } else {
      normalized.push(paragraph)
    }
  }

  return normalized.map((p) => `<p>${escapeHtml(p)}</p>`).join('')
}

function extractAssistantContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''

  const first = choices[0] as { message?: { content?: unknown } }
  const content = first?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

function parseRefinedPayload(
  responseText: string,
  fallbackTitle: string
): { title: string; summaryText: string } {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { title?: unknown; summary?: unknown }
      const titleRaw =
        typeof parsed.title === 'string' && parsed.title.trim()
          ? parsed.title.trim()
          : fallbackTitle
      const title = capChars(titleRaw, 80)
      const summaryText =
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : responseText
      return { title, summaryText }
    } catch {
      // Fall back to text parsing below.
    }
  }

  const titleLineMatch = responseText.match(/(?:^|\n)\s*title\s*:\s*(.+)/i)
  const title = capChars(titleLineMatch?.[1]?.trim() || fallbackTitle, 80)
  return { title, summaryText: responseText }
}

export async function summarizeWithSarvam(
  articleId: string,
  articleTitle: string,
  articleHtml: string
): Promise<SarvamSummaryCacheItem> {
  const apiKey = import.meta.env.VITE_SARVAM_API_KEY
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { title: articleTitle, summaryHtml: articleHtml }
  }

  const cache = readCache()
  if (cache[articleId]) return cache[articleId]

  const plain = htmlToPlainText(articleHtml)
  if (!plain) return { title: articleTitle, summaryHtml: articleHtml }

  const clipped = plain.slice(0, 12000)
  const prompt = [
    `Article title: ${articleTitle}`,
    '',
    'Task:',
    '- Remove unrelated or noisy content (ads, references, links, navigation text).',
    '- Rewrite the title to be clear and meaningful in plain English.',
    '- Preserve core meaning of the original title.',
    '- Keep the rewritten title within 80 characters maximum.',
    '- Produce one clean English summary only.',
    '- Keep full meaningful detail; do not over-compress.',
    '- Prefer 3 or more paragraphs when content is long.',
    '- Each paragraph should be substantial (ideally more than 150 characters).',
    '- Keep factual meaning and key points intact.',
    '- Do not include URLs or bullet points.',
    '- Respond in valid JSON exactly with keys: "title" and "summary".',
    '',
    'Article content:',
    clipped,
  ].join('\n')

  const response = await fetch(`${SARVAM_BASE}${CHAT_COMPLETIONS_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      model: 'sarvam-m',
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert news editor. Return only polished English summary paragraphs.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) return { title: articleTitle, summaryHtml: articleHtml }

  const payload = (await response.json()) as unknown
  const raw = extractAssistantContent(payload)
  if (!raw) return { title: articleTitle, summaryHtml: articleHtml }

  const parsed = parseRefinedPayload(raw, articleTitle)
  const normalizedTitle = capChars(parsed.title.trim() || articleTitle, 80)
  const summaryText = parsed.summaryText.trim() || raw
  const summaryHtml = toSummaryHtml(summaryText)
  const item: SarvamSummaryCacheItem = {
    title: normalizedTitle,
    summaryHtml,
  }
  const nextCache = { ...cache, [articleId]: item }
  writeCache(nextCache)
  return item
}
