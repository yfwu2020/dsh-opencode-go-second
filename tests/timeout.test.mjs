import assert from 'node:assert/strict';
import test from 'node:test';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import { buildProfiles } from '../profiles.mjs';

test('a stalled Go response settles at the configured idle timeout even when transport ignores abort', async () => {
  const route = 'opencode-go-second';
  const profiles = buildProfiles({ [route]: {
    apiKeyEnv: 'SECOND_TEST_REF', streamIdleTimeoutMs: 20,
    models: [{ id: 'deepseek-v4.1-flash' }],
  } });
  const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => 'fake-timeout-key' });
  const savedFetch = globalThis.fetch;
  let body, guard, cancelled = false;
  // Deliberately leave the HTTP body open and ignore the request's signal.
  // A signal-only timeout cannot settle a pending read from this transport.
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) { body = controller; },
    cancel() { cancelled = true; },
  }), {
    headers: { 'content-type': 'text/event-stream' },
  });
  const consume = (async () => {
    for await (const _ of adapter.stream({ provider: route, model: 'deepseek-v4.1-flash', maxTokens: 16,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Local timeout test' }] }],
    })) { /* consume the real adapter stream */ }
  })();
  try {
    await assert.rejects(Promise.race([consume, new Promise((_, reject) => {
      guard = setTimeout(() => reject(new Error('Go stream did not enforce its idle timeout')), 1000);
    })]), error => error.code === 'TIMEOUT');
  } finally {
    clearTimeout(guard);
    if (!cancelled) body?.close();
    await consume.catch(() => {});
    globalThis.fetch = savedFetch;
  }
});
