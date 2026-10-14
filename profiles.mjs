import { Config } from '@deepseek-ai/dsh-llm-pi-ai';
import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go';
import { secondGoModels } from './catalog.mjs';
import { goStream } from './go-stream.mjs';

export const ROUTE = 'opencode-go-second';
export const LABEL = 'OpenCode Go · 2';
const base = opencodeGoProvider();
const reservedHeaders = new Set(['authorization', 'x-api-key', 'x-goog-api-key', 'x-opencode-session', 'user-agent']);
const invalid = message => { throw new LlmError(message, 'INVALID_CONFIG'); };
const hasCompatibility = compat => Object.values(compat ?? {}).some(value =>
  value !== undefined && !(value && typeof value === 'object' && !Object.keys(value).length));

export function buildProfiles(raw, catalog = secondGoModels, { allowMissingMetadata = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('Go providers must be a dictionary');
  if (Object.keys(raw).some(key => key !== ROUTE)) invalid(`This plugin owns only ${ROUTE}`);
  const source = raw[ROUTE];
  if (source === undefined) return new Map();
  if (source.api !== undefined || (source.baseURL !== undefined && source.baseURL !== '')) {
    invalid('Go protocol and endpoint are chosen separately for each model; remove API/address overrides');
  }
  if (Object.keys(source.modelOverrides ?? {}).length) invalid('Use the Go models list to edit this connection');
  if (hasCompatibility(source.compat)) invalid('Protocol compatibility is supplied by the verified Go catalog');
  for (const [key, value] of Object.entries(source.headers ?? {})) {
    if (reservedHeaders.has(key.toLowerCase())) invalid(`Header ${key} is managed by the Go plugin`);
    try { new Headers([[key, value]]); } catch { invalid(`Invalid header ${key}`); }
  }
  const parsed = Config({ providers: { [ROUTE]: structuredClone(source) } }).providers.get()[ROUTE];
  if (!parsed.apiKeyEnv) invalid('Configure a credential reference for the second Go connection');
  const entries = source.models?.length ? source.models : [...catalog.values()].map(model => ({ id: model.id }));
  if (!Array.isArray(entries)) invalid('Go models must be an array');
  const seen = new Set();
  const models = entries.filter(entry => !allowMissingMetadata || catalog.has(entry.id)).map(entry => {
    const native = catalog.get(entry.id);
    if (!native) invalid(`No verified Go protocol metadata for ${entry.id}`);
    if (seen.has(entry.id)) invalid(`Duplicate Go model ${entry.id}`);
    seen.add(entry.id);
    if (hasCompatibility(entry.compat)) invalid('Model compatibility is supplied by the verified Go catalog');
    const model = structuredClone(native);
    for (const field of ['contextWindow', 'maxTokens']) {
      if (entry[field] !== undefined) {
        if (!Number.isSafeInteger(entry[field]) || entry[field] <= 0) invalid(`Invalid ${field} for ${entry.id}`);
        model[field] = entry[field];
      }
    }
    if (model.maxTokens > model.contextWindow) invalid(`Output limit exceeds context for ${entry.id}`);
    if (entry.name !== undefined) {
      if (typeof entry.name !== 'string' || !entry.name.trim()) invalid(`Invalid name for ${entry.id}`);
      model.name = entry.name;
    }
    if (entry.input?.length) {
      if (entry.input.some(input => !native.input.includes(input))) invalid(`Unsupported input for ${entry.id}`);
      model.input = [...new Set(entry.input)];
    }
    if (entry.reasoningEfforts !== undefined) {
      if (entry.reasoningEfforts === false) model.reasoning = false;
      else {
        const allowed = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
        const mapping = Object.fromEntries([...allowed].map(level => [level, null]));
        for (const [level, value] of Object.entries(entry.reasoningEfforts)) {
          if (!allowed.has(level) || native.thinkingLevelMap?.[level] === null ||
              (['xhigh','max'].includes(level) && native.thinkingLevelMap?.[level] === undefined) ||
              value !== native.thinkingLevelMap?.[level]) {
            invalid(`Unsupported reasoning mapping ${level} for ${entry.id}`);
          }
          mapping[level] = value;
        }
        model.thinkingLevelMap = mapping;
      }
    }
    return model;
  });
  const displayName = parsed.displayName ?? LABEL;
  const piProvider = {
    id: ROUTE, name: displayName,
    // Resolve only the credential captured by this adapter. No ambient fallback
    // or shared pi-ai login store can select the first connection's key.
    auth: { apiKey: { name: displayName, resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key ? { apiKey: credential.key } : {}, source: displayName,
    }) } },
    getModels: () => models,
    stream: (model, context, options) => goStream(base, 'stream', ROUTE, model, context, options),
    streamSimple: (model, context, options) => goStream(base, 'streamSimple', ROUTE, model, context, options),
  };
  return new Map([[ROUTE, {
    ...parsed, provider: ROUTE, displayName, piProvider,
    retryPolicy: resolveRetryPolicy(parsed.retryPolicy, 'Go second connection'),
    configuredMaxTokens: new Map(entries.flatMap(entry => entry.maxTokens === undefined ? [] : [[entry.id, entry.maxTokens]])),
    modelErrors: new Map(),
  }]]);
}
