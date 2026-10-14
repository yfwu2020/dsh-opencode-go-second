import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
let factory;
vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(module) { factory = module.factory; } } },
});
const client = factory(() => ({}));
const ns = 'llm-opencode-go-second', route = 'opencode-go-second';
test('settings extension belongs only to the second provider card', () => {
  let registration;
  client.apply({ slots: { inject(name, callback) { callback(); }, register(options) { registration = options; } }, remote: {} });
  assert.equal(registration.name, 'settings.models.provider-card');
  assert.equal(registration.key, ns);
});
test('settings management reads and writes only second models and preserves blank key', async () => {
  const calls = [];
  const view = { ns, revision: 3, value: { providers: { [route]: { apiKeyEnv: 'OPENCODE_API_KEY', models: [{ id: 'deepseek-v4.1-flash' }] } } } };
  const api = {
    settings: {
      describe: async () => ({ ok: true, value: { namespaces: [view] } }),
      mutate: async (...args) => { calls.push(args); return { ok: true, value: view }; },
    },
    credentials: { set: async (...args) => { calls.push(args); return { ok: true }; } },
    llm: { discoverModels: async (...args) => { calls.push(args); return { ok: true, value: [{ id: 'deepseek-v4.1-flash' }] }; } },
  };
  const actions = client.createActions(api);
  assert.equal((await actions.load()).revision, 3);
  await actions.save(view, view.value.providers[route].models, '');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], ns);
  assert.deepEqual(Array.from(calls[0][1][0].path), ['providers', route, 'models']);
  assert.equal(calls[0][2], 3);
  await actions.discover();
  assert.equal(calls.at(-1)[0], ns);
  assert.equal(calls.at(-1)[1].provider, route);
  await actions.discover('draft-test-key');
  assert.equal(calls.at(-1)[1].apiKey, 'draft-test-key');
  await actions.storeKey(view, 'replacement-test-key');
  assert.equal(calls.at(-1)[0], 'OPENCODE_API_KEY');
});
test('a conflicting model save never changes the live credential', async () => {
  let keyWrites = 0;
  const actions = client.createActions({
    settings: { mutate: async () => ({ ok: false, error: { message: 'revision conflict' } }) },
    credentials: { set: async () => { keyWrites++; return { ok: true }; } },
  });
  const view = { revision: 2, value: { providers: { [route]: { apiKeyEnv: 'OPENCODE_API_KEY' } } } };
  await assert.rejects(() => actions.save(view, [{ id: 'deepseek-v4.1-flash' }], 'draft-test-key'), /conflict/);
  assert.equal(keyWrites, 0);
});
test('settings errors and empty selections refuse updates', async () => {
  const actions = client.createActions({ settings: { describe: async () => ({ ok: false, error: { message: 'unavailable' } }) } });
  await assert.rejects(() => actions.load(), /unavailable/);
  await assert.rejects(() => actions.save({ value: { providers: {} } }, [], ''), /至少/);
});
