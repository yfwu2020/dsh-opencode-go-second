import assert from 'node:assert/strict';
import test from 'node:test';
import * as plugin from '../index.mjs';

const route = 'opencode-go-second';

function mount() {
  const state = { adapter: null };
  const ctx = {
    fiber: { entry: { options: { id: 'llm-opencode-go-second' } } },
    inject() {}, on() {},
    logger: { warn() {}, error() {} },
    get(name) { if (name === 'credentials') return { resolve: async () => ({ value: 'test-second-key' }) }; },
    llm: {
      registerAdapter(_routes, adapter) { state.adapter = adapter; return { replace() {} }; },
      registerConfigurableProviders() { return { replace() {} }; },
      registerModelDiscovery() {},
    },
  };
  plugin.apply(ctx, { providers: { get: () => ({ [route]: { displayName: 'OpenCode Go · 2', apiKeyEnv: 'OPENCODE_API_KEY' } }) } }, { cacheFile: null });
  return state.adapter;
}

async function call(adapter, sessionId) {
  const chunks = [];
  for await (const chunk of adapter.stream({
    provider: route, model: 'deepseek-v4.1-flash', sessionId, maxTokens: 16,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Local test' }] }],
  })) chunks.push(chunk);
  return chunks;
}

/** Answers like the Go gateway: one cell refuses large prefills, the rest serve them. */
async function withGateway(sessionId, run, { healthy = false, alwaysRefuse = false } = {}) {
  const seen = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const id = request.headers.get('x-opencode-session');
    seen.push(id);
    if (healthy) {
      const events = [
        { id: 'chatcmpl-local', object: 'chat.completion.chunk', created: 0, model: 'deepseek-v4.1-flash', choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] },
        { id: 'chatcmpl-local', object: 'chat.completion.chunk', created: 0, model: 'deepseek-v4.1-flash', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    }
    const detail = alwaysRefuse || id === sessionId ? 'prefill_cap_refused the cell is at capacity' : 'overloaded the server is overloaded';
    return new Response(JSON.stringify({ type: 'server_error', message: `Upstream request failed: [${detail}]` }), {
      status: 429, headers: { 'content-type': 'application/json', 'retry-after': '2' },
    });
  };
  try {
    return { result: await run(), seen };
  } finally {
    globalThis.fetch = saved;
  }
}

test('a capacity refusal moves the next attempt to another routing cell', async () => {
  const sessionId = 'session-capacity-' + Math.random().toString(36).slice(2);
  const adapter = mount();
  const { seen } = await withGateway(sessionId, async () => {
    await call(adapter, sessionId);
    await call(adapter, sessionId);
    await call(adapter, sessionId);
  });
  assert.deepEqual(seen, [sessionId, `${sessionId}#r1`, `${sessionId}#r1`]);
});

test('a healthy conversation keeps its original routing header', async () => {
  const sessionId = 'session-healthy-' + Math.random().toString(36).slice(2);
  const adapter = mount();
  const { result, seen } = await withGateway(sessionId, async () => {
    const first = await call(adapter, sessionId);
    const second = await call(adapter, sessionId);
    return [first, second];
  }, { healthy: true });
  assert.deepEqual(seen, [sessionId, sessionId]);
  for (const chunks of result) {
    assert.equal(chunks.at(-1).type, 'finish');
    assert.equal(chunks.at(-1).reason.kind, 'stop');
  }
});

test('rotations stay bounded and never invent a header without a session id', async () => {
  const sessionId = 'session-bounded-' + Math.random().toString(36).slice(2);
  const adapter = mount();
  const { seen } = await withGateway(sessionId, async () => {
    for (let i = 0; i < 40; i++) await call(adapter, sessionId);
  }, { alwaysRefuse: true });
  assert.equal(seen[0], sessionId);
  assert.deepEqual(seen.slice(1, 4), [`${sessionId}#r1`, `${sessionId}#r2`, `${sessionId}#r3`]);
  assert.equal(seen.at(-1), `${sessionId}#r32`);
});
