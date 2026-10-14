import { LlmError, assertUsableApiKey, attributionHeaders } from '@deepseek-ai/dsh-llm';
import { secondGoModels } from './catalog.mjs';
import { ROUTE } from './profiles.mjs';

const URL = 'https://opencode.ai/zen/go/v1/models';
const LIMIT = 4 * 1024 * 1024;

export async function discoverGoModels(request, resolveKey, signal) {
  if (request.provider !== undefined && request.provider !== ROUTE) throw new LlmError('Wrong Go connection', 'DISCOVERY_FAILED');
  if (request.baseURL && request.baseURL.replace(/\/+$/, '') !== 'https://opencode.ai/zen/go/v1') {
    throw new LlmError('Go discovery uses the official Go endpoint', 'DISCOVERY_FAILED');
  }
  const apiKey = assertUsableApiKey(request.apiKey ?? await resolveKey(), 'Go second connection', 'API key');
  const response = await fetch(URL, {
    headers: { accept: 'application/json', authorization: `Bearer ${apiKey}`, ...attributionHeaders() },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new LlmError(`Go model listing answered ${response.status}`, 'DISCOVERY_FAILED'); }
  const reader = response.body?.getReader();
  if (!reader) throw new LlmError('Go model listing has no body', 'DISCOVERY_FAILED');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > LIMIT) throw new LlmError('Go model listing is too large', 'DISCOVERY_FAILED');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new LlmError('Go model listing is invalid JSON', 'DISCOVERY_FAILED'); }
  if (!Array.isArray(body.data) || !body.data.length) throw new LlmError('Go model listing is empty or invalid', 'DISCOVERY_FAILED');
  const ids = [...new Set(body.data.map(row => row?.id))];
  const unknown = ids.filter(id => typeof id !== 'string' || !secondGoModels.has(id));
  if (unknown.length) throw new LlmError(`Update Go plugin metadata for: ${unknown.join(', ')}. Existing configuration is unchanged.`, 'DISCOVERY_FAILED');
  return ids.map(id => {
    const model = secondGoModels.get(id);
    return { id, name: model.name, contextWindow: model.contextWindow, maxTokens: model.maxTokens, inputModalities: [...model.input] };
  });
}
