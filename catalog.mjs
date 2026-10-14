import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const flatten = object => new Map(Object.values(object).flatMap(group => Object.entries(group)));
const go = flatten(read('data/opencode-go-installed.json'));
const zen = flatten(read('data/opencode-installed.json'));
const metadata = read('data/models-dev-go.json');
const legacy = read('data/legacy-models.json');
const advertised = read('data/model-ids.json');
const protocols = {
  '@ai-sdk/anthropic': 'anthropic-messages',
  '@ai-sdk/openai': 'openai-responses',
  '@ai-sdk/openai-compatible': 'openai-completions',
};

// Preserve native protocol quirks, then refresh the fields published for Go.
export const secondGoModels = new Map(advertised.map(id => {
  const old = legacy[id];
  const fallback = old ? {
    ...(id === 'deepseek-flash' ? go.get('deepseek-v4.1-flash') : {}),
    id, name: old.name, api: 'openai-completions', reasoning: true, input: ['text'],
    contextWindow: old.contextWindow, maxTokens: old.maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...(id === 'omen-alpha' ? { thinkingLevelMap: { minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max', off: 'none' } } : {}),
  } : undefined;
  const native = go.get(id) ?? zen.get(id) ?? fallback;
  const current = metadata.models[id];
  if (!native && !current) throw Error(`No verified Go metadata for ${id}`);
  const npm = current?.provider?.npm ?? (current ? metadata.npm : undefined);
  const api = npm ? protocols[npm] : native.api;
  if (!api) throw Error(`Unsupported Go protocol for ${id}: ${npm}`);
  const sameProtocol = native?.api === api;
  const cost = current?.cost;
  const model = {
    ...(sameProtocol ? native : {}),
    id, provider: 'opencode-go-second', name: current?.name ?? native.name,
    api, baseUrl: api === 'anthropic-messages' ? 'https://opencode.ai/zen/go' : 'https://opencode.ai/zen/go/v1',
    reasoning: current?.reasoning ?? native.reasoning,
    input: current ? current.modalities.input.filter(value => ['text', 'image'].includes(value)) : native.input,
    contextWindow: current?.limit.context ?? native.contextWindow,
    maxTokens: current?.limit.output ?? native.maxTokens,
    cost: cost ? { input: cost.input ?? 0, output: cost.output ?? 0, cacheRead: cost.cache_read ?? 0, cacheWrite: cost.cache_write ?? 0 } : native.cost,
  };
  const effort = current?.reasoning_options?.find(option => option.type === 'effort');
  if (effort) {
    model.thinkingLevelMap = Object.fromEntries(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(level => [level, null]));
    for (const level of effort.values) {
      if (level === 'none') model.thinkingLevelMap.off = 'none';
      else if (level in model.thinkingLevelMap) model.thinkingLevelMap[level] = level;
    }
    if (current.reasoning_options.some(option => option.type === 'toggle')) delete model.thinkingLevelMap.off;
  }
  if (id === 'claude-haiku-5-5') model.compat = { ...model.compat, forceAdaptiveThinking: true, supportsTemperature: false };
  return [id, model];
}));
