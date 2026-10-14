import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import yaml from 'yaml';
import { migrate } from '../migration.mjs';
const original = JSON.parse(readFileSync(new URL('./original-providers.json', import.meta.url)));
const second = { apiKeyEnv: 'OPENCODE_API_KEY', displayName: 'OpenCode Go · 第二套' };
const core = { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: {
  'opencode-go': original['opencode-go'], typesafe: original.typesafe, opencode: second,
} } };
const manifest = { dependencies: { '@deepseek-ai/dsh-llm-pi-ai': 'link:./local/opencode-go-second', other: '1.0.0' }, dsh: { profile: { bundles: ['other'] } } };
test('migration preserves first and other providers, gives second an independent settings entry', () => {
  const patch = [core, { id: 'agent-default-model', config: { provider: 'opencode', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' } }, { id: 'untouched', config: { thing: true } }];
  const m = migrate(JSON.stringify(manifest), yaml.stringify(patch));
  const next = yaml.parse(m.patchText); const native = next.find(entry => entry.id === 'llm-pi-ai');
  assert.deepEqual(native.config.providers['opencode-go'], core.config.providers['opencode-go']);
  assert.deepEqual(native.config.providers.typesafe, core.config.providers.typesafe);
  assert.ok(!('opencode' in native.config.providers));
  const plugin = next.find(entry => entry.id === 'llm-opencode-go-second');
  assert.equal(plugin.config.providers['opencode-go-second'].apiKeyEnv, 'OPENCODE_API_KEY');
  assert.equal(plugin.config.providers['opencode-go-second'].models.length, 38);
  assert.equal(next.find(entry => entry.id === 'agent-default-model').config.provider, 'opencode-go-second');
  assert.deepEqual(next.find(entry => entry.id === 'untouched'), patch[2]);
  const pkg = JSON.parse(m.manifestText);
  assert.ok(!('@deepseek-ai/dsh-llm-pi-ai' in pkg.dependencies));
  assert.equal(pkg.dependencies.other, '1.0.0');
  assert.equal(pkg.dependencies['dsh-opencode-go-second'], 'link:./local/dsh-opencode-go-second');
  assert.deepEqual(pkg.dsh.profile.bundles, ['other', 'dsh-opencode-go-second']);
});
test('first default selection is preserved and repeated migration is refused', () => {
  const m = migrate(JSON.stringify(manifest), yaml.stringify([core, { id: 'agent-default-model', config: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' } }]));
  assert.equal(yaml.parse(m.patchText).find(e => e.id === 'agent-default-model').config.provider, 'opencode-go');
  assert.throws(() => migrate(m.manifestText, m.patchText));
});
test('unexpected core overrides or absent second configuration are refused', () => {
  const wrong = structuredClone(manifest); wrong.dependencies['@deepseek-ai/dsh-llm-pi-ai'] = 'other-path';
  assert.throws(() => migrate(JSON.stringify(wrong), yaml.stringify([core])));
  assert.throws(() => migrate(JSON.stringify(manifest), yaml.stringify([])));
});
