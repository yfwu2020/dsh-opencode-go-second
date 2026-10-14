import yaml from 'yaml';
import { secondGoModels } from './catalog.mjs';
import { buildProfiles, ROUTE, LABEL } from './profiles.mjs';

export function migrate(manifestText, patchText) {
  const manifest = JSON.parse(manifestText);
  const doc = yaml.parseDocument(patchText);
  if (doc.errors.length) throw doc.errors[0];
  const patch = doc.toJS();
  if (!Array.isArray(patch)) throw new Error('Expected a profile entry list');
  if (manifest.dependencies?.['@deepseek-ai/dsh-llm-pi-ai'] !== 'link:./local/opencode-go-second') {
    throw new Error('The existing core override differs; inspect before migrating');
  }
  if (patch.some(entry => entry.id === 'llm-opencode-go-second')) throw new Error('Plugin entry already exists');
  const coreIndex = patch.findIndex(entry => entry.id === 'llm-pi-ai');
  const providers = patch[coreIndex]?.config?.providers;
  if (!providers?.opencode || !providers['opencode-go']) throw new Error('Expected first and second connection configuration');
  const first = structuredClone(providers['opencode-go']);
  const second = { ...structuredClone(providers.opencode), displayName: LABEL };
  second.models = [...secondGoModels.values()].map(model => ({
    id: model.id, name: model.name, contextWindow: model.contextWindow,
    maxTokens: model.maxTokens, input: [...model.input],
  }));
  buildProfiles({ [ROUTE]: second });
  doc.deleteIn([coreIndex, 'config', 'providers', 'opencode']);
  doc.add({ id: 'llm-opencode-go-second', name: 'dsh-opencode-go-second', config: { providers: { [ROUTE]: second } } });
  const defaultIndex = patch.findIndex(entry => entry.id === 'agent-default-model');
  if (patch[defaultIndex]?.config?.provider === 'opencode') doc.setIn([defaultIndex, 'config', 'provider'], ROUTE);
  delete manifest.dependencies['@deepseek-ai/dsh-llm-pi-ai'];
  manifest.dependencies['dsh-opencode-go-second'] = 'link:./local/dsh-opencode-go-second';
  const bundles = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) throw new Error('Profile bundles are missing');
  if (!bundles.includes('dsh-opencode-go-second')) bundles.push('dsh-opencode-go-second');
  const output = doc.toJS();
  if (JSON.stringify(output[coreIndex].config.providers['opencode-go']) !== JSON.stringify(first)) throw new Error('First connection changed during migration');
  return { manifestText: JSON.stringify(manifest, null, 2) + '\n', patchText: doc.toString({ lineWidth: 0 }) };
}
