import { readFileSync, mkdirSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { buildCatalog, secondGoModels } from './catalog.mjs';
import { readJson } from './json-response.mjs';

export const catalogFile = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'dsh-opencode-go-second', 'catalog.json');
export function createCatalogStore({ file = catalogFile, fetcher = (...args) => fetch(...args), onWarning = () => {} } = {}) {
  const state = { models: new Map(secondGoModels), version: 0, syncedIds: new Set(secondGoModels.keys()) };
  let published = { npm: '@ai-sdk/openai-compatible', models: {} };
  if (file) {
    try {
      if (statSync(file).size > 4 * 1024 * 1024) throw Error('cache too large');
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      const cached = buildCatalog(Object.keys(saved.models), saved);
      published = saved;
      state.models = new Map([...secondGoModels, ...cached]);
      if (Array.isArray(saved.syncedIds) && saved.syncedIds.every(id => state.models.has(id))) state.syncedIds = new Set(saved.syncedIds);
    } catch (error) { if (error.code !== 'ENOENT') onWarning('模型缓存无效，将使用随插件提供的目录。'); }
  }
  const persist = next => {
    const encoded = JSON.stringify(next);
    if (Buffer.byteLength(encoded) > 4 * 1024 * 1024) throw Error('模型资料缓存过大');
    if (file) {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(temporary, encoded, { mode: 0o600 }); renameSync(temporary, file);
    }
  };
  state.recordSynchronized = ids => {
    const combined = [...new Set([...state.syncedIds, ...ids])];
    const next = { ...published, syncedIds: combined };
    persist(next); published = next; state.syncedIds = new Set(combined);
  };
  state.refresh = async (ids, signal) => {
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
    const data = await readJson(await fetcher('https://models.dev/api.json', { signal: combined, redirect: 'error' }), 32 * 1024 * 1024);
    const provider = data?.['opencode-go'];
    if (!provider || typeof provider.models !== 'object' || Array.isArray(provider.models)) throw Error('Go 模型资料暂不可用');
    const next = { npm: provider.npm, models: { ...published.models }, syncedIds: [...state.syncedIds] };
    const merged = new Map(state.models);
    for (const id of ids) {
      // Add new descriptors without changing live, already selected contracts.
      // Existing protocol/capability migrations require a plugin upgrade.
      if (merged.has(id)) continue;
      const current = provider.models[id];
      if (!current) {
        if (!merged.has(id)) throw Error(`暂缺 ${id} 的接入资料；保留已有模型。`);
        continue;
      }
      next.models[id] = current;
      const model = buildCatalog([id], { npm: provider.npm, models: { [id]: current } }).get(id);
      merged.set(id, model);
    }
    combined.throwIfAborted();
    // Persist verified public metadata before a settings write can reference new IDs.
    // Neither credentials nor account-specific settings belong in this cache.
    persist(next);
    published = next; state.models = merged; state.version++;
    return ids.map(id => merged.get(id));
  };
  return state;
}
