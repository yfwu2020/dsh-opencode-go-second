import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as plugin from '../index.mjs';
import { apply as nativeApply } from '@deepseek-ai/dsh-llm-pi-ai';
const ids = JSON.parse(readFileSync(new URL('../data/model-ids.json', import.meta.url)));
const first = JSON.parse(readFileSync(new URL('./original-providers.json', import.meta.url)))['opencode-go'];
const route = 'opencode-go-second';
function mount(raw = { [route]: { displayName: 'OpenCode Go · 第二套', apiKeyEnv: 'OPENCODE_API_KEY' } }, apply = plugin.apply) {
  let current = raw;
  const state = { routes: [], directory: [], handlers: {}, resolvedRefs: [], settingsId: null };
  const ctx = {
    fiber: { entry: { options: { id: 'llm-opencode-go-second' } } },
    inject() {}, on(event, callback) { state.handlers[event] = callback; },
    logger: { warn() {}, error() {} },
    get(name) { if (name === 'credentials') return { resolve: async ref => {
      state.resolvedRefs.push(ref);
      return { value: ref === 'OPENCODE_API_KEY' ? 'test-second-key' : 'test-first-key' };
    } }; },
    llm: {
      registerAdapter(routes, adapter) { state.routes = routes; state.adapter = adapter; return { replace(routes) { state.routes = routes; } }; },
      registerConfigurableProviders(entries) { state.directory = entries; return { replace(entries) { state.directory = entries; } }; },
      registerModelDiscovery(ns, fn) { state.discoveryNs = ns; state.discover = fn; },
    },
  };
  apply(ctx, { providers: { get: () => current } });
  state.replace = raw => { current = raw; state.handlers['loader/volatile-update']?.(); };
  return state;
}
const state = mount();
const expectedProtocols = {
  'claude-haiku-5-5': '/v1/messages', 'minimax-m3': '/v1/messages', 'minimax-m2.7': '/v1/messages',
  'qwen3.8-max': '/v1/messages', 'qwen3.8-flash': '/v1/messages', 'qwen3.7-plus': '/v1/messages',
  'gpt-5.6-luna': '/v1/responses', 'gpt-6-luna': '/v1/responses',
  'grok-4.6': '/v1/responses', 'grok-4.7': '/v1/responses',
  'muse-spark-1.2-contributor': '/v1/responses', 'muse-spark-1.3-contributor': '/v1/responses',
};
const seen = [];
const savedFetch = globalThis.fetch;
let responseMode;
globalThis.fetch = async (input, init = {}) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const body = JSON.parse(await request.text());
  seen.push({ url: request.url, headers: request.headers, body });
  if (responseMode === 'error') return new Response(JSON.stringify({ error: { message: 'unsupported_country_region_territory' } }), { status: 403, headers: { 'content-type': 'application/json' } });
  const suffix = new URL(request.url).pathname;
  let events;
  if (suffix.endsWith('/chat/completions')) {
    events = [
      ...(responseMode === 'reasoning-tool' ? [{ id: 'chatcmpl-local', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta: { reasoning: 'Private local test plan', tool_calls: [{ index: 0, id: 'call-local', type: 'function', function: { name: 'local_lookup', arguments: '{}' } }] }, finish_reason: null }] }] : []),
      { id: 'chatcmpl-local', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] },
      { id: 'chatcmpl-local', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: responseMode === 'reasoning-tool' ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } },
    ].map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  } else if (suffix.endsWith('/messages')) {
    events = [
      { type: 'message_start', message: { id: 'msg-local', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 2, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ].map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  } else if (suffix.endsWith('/responses')) {
    const item = { id: 'msg-local', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] };
    events = [
      { type: 'response.created', response: { id: 'resp-local', model: body.model, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [], status: 'in_progress' } },
      { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp-local', model: body.model, status: 'completed', output: [item], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
    ].map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
  } else throw Error(`Unexpected endpoint: ${request.url}`);
  return new Response(events, { headers: { 'content-type': 'text/event-stream' } });
};



test.after(() => { globalThis.fetch = savedFetch; });
async function call(model, sessionId, adapter = state.adapter, provider = route, extra = {}) {
  const output = [];
  for await (const chunk of adapter.stream({ provider, model, sessionId, maxTokens: 32,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Local test' }] }], ...extra })) output.push(chunk);
  return output;
}
test('independent route, settings and full catalog expose all current Go models', async () => {
  assert.deepEqual(state.routes, [route]);
  assert.equal(state.directory.length, 1);
  assert.equal(state.directory[0].provider, route);
  assert.deepEqual(state.directory[0].settingsPath, ['providers', route]);
  assert.equal(state.directory[0].settingsNs, 'llm-opencode-go-second');
  assert.equal(state.discoveryNs, 'llm-opencode-go-second');
  assert.deepEqual((await state.adapter.listModels(route)).map(m => m.id).sort(), [...ids].sort());
  for (const id of ids) assert.ok((await state.adapter.resolveModel(route, id)).context.contextWindow > 0);
});
test('real schema-materialized settings retain the default Go catalog', async () => {
  const parsed = plugin.Config({ providers: { [route]: { apiKeyEnv: 'OPENCODE_API_KEY' } } });
  const mounted = mount(parsed.providers.get());
  assert.equal((await mounted.adapter.listModels(route)).length, 38);
});
test('all 38 models use their own Go protocol, second key and real session ID', async () => {
  for (const id of ids) {
    const output = await call(id, 'session-second-A');
    const wire = seen.at(-1); const url = new URL(wire.url);
    assert.equal(url.origin + url.pathname, 'https://opencode.ai/zen/go' + (expectedProtocols[id] ?? '/v1/chat/completions'), id);
    assert.equal(wire.body.model, id);
    assert.equal(wire.headers.get('authorization') ?? `Bearer ${wire.headers.get('x-api-key')}`, 'Bearer test-second-key', id);
    assert.equal(wire.headers.get('x-opencode-session'), 'session-second-A', id);
    assert.match(wire.headers.get('user-agent'), /deepseek-harness/i);
    assert.equal(output.at(-1).type, 'finish'); assert.equal(output.at(-1).reason.kind, 'stop');
    assert.ok(JSON.stringify(output).includes('OK'));
    assert.equal(output.at(-1).replayState.response.provider, route);
  }
});
test('first and second connections interleave without key/session/endpoint interference', async () => {
  const native = mount({ 'opencode-go': first }, nativeApply);
  const before = seen.length;
  await Promise.all([
    call('deepseek-v4.1-flash', 'session-first', native.adapter, 'opencode-go'),
    call('claude-haiku-5-5', 'session-second-B'), call('gpt-6-luna', 'session-second-C'),
  ]);
  const wires = seen.slice(before);
  const firstWire = wires.find(w => w.headers.get('authorization') === 'Bearer test-first-key');
  assert.ok(firstWire); assert.equal(firstWire.headers.get('x-opencode-session'), first.headers['x-opencode-session']);
  assert.equal(firstWire.url, first.baseURL + '/chat/completions');
  assert.deepEqual(wires.filter(w => w !== firstWire).map(w => w.headers.get('x-opencode-session')).sort(), ['session-second-B','session-second-C']);
  assert.deepEqual((await native.adapter.listModels('opencode-go')).map(m => m.id), first.models.map(m => m.id));
  assert.ok(state.resolvedRefs.every(ref => ref === 'OPENCODE_API_KEY'));
});
test('unsupported routes, protocols and reserved headers are refused without I/O', async () => {
  const before = seen.length;
  for (const raw of [
    { 'opencode-go': { apiKeyEnv: 'OPENCODE_API_KEY' } },
    { [route]: { api: 'openai-completions', apiKeyEnv: 'OPENCODE_API_KEY' } },
    { [route]: { baseURL: 'https://example.com', apiKeyEnv: 'OPENCODE_API_KEY' } },
    { [route]: { headers: { 'X-OpenCode-Session': 'fixed' }, apiKeyEnv: 'OPENCODE_API_KEY' } },
    { [route]: { models: [{ id: 'unverified-new-model' }], apiKeyEnv: 'OPENCODE_API_KEY' } },
  ]) assert.throws(() => mount(raw));
  await assert.rejects(() => state.adapter.resolveModel(route, 'unverified-new-model'));
  assert.equal(seen.length, before);
});
test('settings updates use new snapshots and support dormant/reactivated route', async () => {
  const mounted = mount();
  const prepared = await mounted.adapter.prepareCall(route, 'deepseek-v4.1-flash');
  mounted.replace({}); assert.deepEqual(mounted.routes, []);
  const output = [];
  for await (const chunk of prepared.stream({ provider: route, model: 'deepseek-v4.1-flash', sessionId: 'old-snapshot', maxTokens: 32,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Captured request' }] }] })) output.push(chunk);
  assert.equal(output.at(-1).reason.kind, 'stop');
  mounted.replace({ [route]: { displayName: 'OpenCode Go · 第二套', apiKeyEnv: 'OPENCODE_API_KEY', models: [{ id: 'claude-haiku-5-5' }] } });
  assert.deepEqual(mounted.routes, [route]);
  assert.deepEqual((await mounted.adapter.listModels(route)).map(m => m.id), ['claude-haiku-5-5']);
});
test('provider errors finish as errors instead of being reported successful', async () => {
  responseMode = 'error';
  try { const chunks = await call('gpt-6-luna', 'session-error');
    assert.equal(chunks.at(-1).reason.kind, 'error');
    assert.match(chunks.at(-1).reason.failure.message, /403|unsupported_country_region_territory/);
  } finally { responseMode = undefined; }
});
test('Go thinking and tool replay retain native reasoning_content across turns', async () => {
  const model = 'deepseek-v4.1-flash';
  const tools = [{ name: 'local_lookup', description: 'Local test only', parameters: { type: 'object', properties: {} } }];
  responseMode = 'reasoning-tool';
  let chunks;
  try { chunks = await call(model, 'session-tool', state.adapter, route, { tools }); }
  finally { responseMode = undefined; }
  const finish = chunks.at(-1);
  assert.equal(finish.reason.kind, 'tool-calls');
  const thinking = finish.replayState.blocks.find(block => block.type === 'reasoning');
  assert.equal(thinking.thinkingSignature, 'reasoning_content');
  const content = chunks.filter(chunk => chunk.type === 'block-end').sort((a,b) => a.index-b.index).map(chunk => chunk.block);
  await call(model, 'session-tool', state.adapter, route, {
    tools, messages: [
      { role: 'user', content: [{ type: 'text', text: 'Use the local tool.' }] },
      { role: 'assistant', id: 'assistant-local', content, source: { provider: route, model, replayState: finish.replayState } },
      { role: 'tool', id: 'tool-local', toolCallId: 'call-local', content: [{ type: 'text', text: 'Local result' }] },
    ],
  });
  const assistant = seen.at(-1).body.messages.find(message => message.role === 'assistant');
  assert.equal(assistant.reasoning_content, 'Private local test plan');
  assert.equal(assistant.tool_calls[0].function.name, 'local_lookup');
  assert.ok(!('reasoning' in assistant));
});
test('discovery uses only second or draft key and refuses unknown metadata atomically', async () => {
  const saved = globalThis.fetch;
  const requests = [];
  let reply = ids.map(id => ({ id }));
  globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(JSON.stringify({ data: reply }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const discovered = await state.discover({ provider: route }, AbortSignal.timeout(3000));
    assert.deepEqual(discovered.map(m => m.id).sort(), [...ids].sort());
    assert.ok(discovered.every(m => m.contextWindow > 0 && m.maxTokens > 0));
    assert.equal(requests.at(-1).url, 'https://opencode.ai/zen/go/v1/models');
    assert.equal(requests.at(-1).headers.get('authorization'), 'Bearer test-second-key');
    await state.discover({ provider: route, apiKey: 'draft-key' });
    assert.equal(requests.at(-1).headers.get('authorization'), 'Bearer draft-key');
    reply.push({ id: 'unverified-new-model' });
    await assert.rejects(() => state.discover({ provider: route }), /unverified-new-model/);
    assert.equal((await state.adapter.listModels(route)).length, 38);
    const before = requests.length;
    await assert.rejects(() => state.discover({ provider: route, baseURL: 'https://example.com' }));
    assert.equal(requests.length, before);
  } finally { globalThis.fetch = saved; }
});
