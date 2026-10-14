import assert from 'node:assert/strict';
import test from 'node:test';
import { apply } from '../index.mjs';

test('startup and credential changes never schedule a refresh; discovery remains available on demand', async () => {
  const original = { timeout: globalThis.setTimeout, interval: globalThis.setInterval, fetch: globalThis.fetch };
  const timers = [], events = [], requests = [];
  let discover, credentialReads = 0, settingsWrites = 0;
  globalThis.setTimeout = globalThis.setInterval = (...args) => { timers.push(args); return { unref() {} }; };
  globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(JSON.stringify({ data: [{ id: 'deepseek-v4.1-flash' }] }));
  };
  const settings = { configure: () => () => {}, describe: () => [], mutate: async () => { settingsWrites++; } };
  const child = { settings, effect: callback => callback(), on: event => events.push(event) };
  const ctx = {
    fiber: { entry: { options: { id: 'llm-opencode-go-second' } } },
    logger: { warn() {} }, inject: (_, callback) => callback(child), on: () => {},
    get: name => name === 'credentials' ? { resolve: async () => { credentialReads++; return { value: 'fake-manual-key' }; } } : undefined,
    llm: {
      registerAdapter: () => ({ replace() {} }),
      registerConfigurableProviders: () => ({ replace() {} }),
      registerModelDiscovery: (_, callback) => { discover = callback; },
    },
  };
  try {
    apply(ctx, { providers: { get: () => ({ 'opencode-go-second': { apiKeyEnv: 'SECOND_TEST_REF' } }) } }, { cacheFile: null });
    assert.equal(timers.length, 0, 'No startup or recurring refresh timers');
    assert.ok(!events.some(event => event.startsWith('credentials/')));
    assert.equal(credentialReads, 0);
    assert.equal(requests.length, 0);
    const models = await discover({ provider: 'opencode-go-second' });
    assert.equal(models[0].id, 'deepseek-v4.1-flash');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.get('authorization'), 'Bearer fake-manual-key');
    assert.equal(settingsWrites, 0, 'Manual discovery does not save the model selection');
  } finally {
    globalThis.setTimeout = original.timeout; globalThis.setInterval = original.interval; globalThis.fetch = original.fetch;
  }
});
