/**
 * Unified LLM client. Auto-detects provider from the API key prefix.
 *
 * Why no SDK: OpenAI, Groq, and OpenRouter all speak the OpenAI Chat
 * Completions JSON, so a single fetch path covers three providers.
 * Anthropic's /v1/messages shape is a small translation. Skipping SDKs
 * keeps the dep tree small and the request path one screenful.
 *
 * Resolution order:
 *   1. Provider-named vars (GROQ_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY
 *      / ANTHROPIC_API_KEY) — pinned to that provider, in that order.
 *   2. Generic LLM_API_KEY — provider auto-detected from prefix.
 * Optional LLM_MODEL overrides the per-provider default model.
 */

const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    style: 'openai',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    style: 'openai',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-4o-mini',
    style: 'openai',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-haiku-4-5-20251001',
    style: 'anthropic',
  },
};

function detectProvider(key) {
  if (!key || typeof key !== 'string') return null;
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-')) return 'openai';
  return null;
}

function isPlaceholder(value) {
  return !value || /^your_.+_here$/i.test(value);
}

function makeCreds(provider, key, env) {
  const p = PROVIDERS[provider];
  return {
    provider,
    key,
    model: env.LLM_MODEL || p.defaultModel,
    url: p.url,
    style: p.style,
  };
}

function resolveCredentials(env = process.env) {
  const named = [
    ['groq', env.GROQ_API_KEY],
    ['anthropic', env.ANTHROPIC_API_KEY],
    ['openai', env.OPENAI_API_KEY],
    ['openrouter', env.OPENROUTER_API_KEY],
  ];
  for (const [provider, key] of named) {
    if (!isPlaceholder(key)) return makeCreds(provider, key, env);
  }
  if (!isPlaceholder(env.LLM_API_KEY)) {
    const provider = detectProvider(env.LLM_API_KEY);
    if (provider) return makeCreds(provider, env.LLM_API_KEY, env);
  }
  return null;
}

async function chat({ creds, systemPrompt, userPrompt, temperature, maxTokens, timeoutMs }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let headers, body;
    if (creds.style === 'anthropic') {
      headers = {
        'x-api-key': creds.key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      };
      body = JSON.stringify({
        model: creds.model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
    } else {
      headers = {
        'Authorization': `Bearer ${creds.key}`,
        'Content-Type': 'application/json',
      };
      body = JSON.stringify({
        model: creds.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      });
    }

    const response = await fetch(creds.url, { method: 'POST', headers, body, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${creds.provider} API ${response.status}: ${detail.slice(0, 200)}`);
    }
    const data = await response.json();
    const text = creds.style === 'anthropic'
      ? (data.content?.[0]?.text || '')
      : (data.choices?.[0]?.message?.content || '');
    return text.trim();
  } finally {
    clearTimeout(t);
  }
}

module.exports = { PROVIDERS, detectProvider, resolveCredentials, chat };
