import { ROUTE } from './profiles.mjs';

export async function syncGoModels({ settings, ns, catalog, discover, signal }) {
  const view = settings.describe().find(row => row.ns === ns);
  const config = view?.value?.providers?.[ROUTE];
  if (!config) return;
  const known = new Map(catalog.models);
  const previouslySynced = catalog.syncedIds ?? new Set(known.keys());
  const enabled = new Map((config.models ?? []).map(model => [model.id, model]));
  const recovering = [...enabled.keys()].some(id => !known.has(id));
  const rows = await discover(signal);
  signal?.throwIfAborted();
  const next = rows.filter(row => !enabled.size || enabled.has(row.id) || (!recovering && !previouslySynced.has(row.id))).map(row => {
    const entry = { id: row.id, name: row.name, contextWindow: row.contextWindow, maxTokens: row.maxTokens, input: row.inputModalities };
    const custom = enabled.get(row.id), previous = known.get(row.id);
    if (custom) {
      for (const field of ['name', 'contextWindow', 'maxTokens', 'input']) {
        if (custom[field] !== undefined && (!previous || JSON.stringify(custom[field]) !== JSON.stringify(previous[field]))) entry[field] = custom[field];
      }
      if (custom.reasoningEfforts !== undefined) entry.reasoningEfforts = custom.reasoningEfforts;
    }
    return entry;
  });
  if (!next.length) throw Error('没有可启用的 Go 模型，保留已有设置。');
  if (JSON.stringify(config.models) !== JSON.stringify(next)) {
    await settings.mutate(ns, [{ op: 'set', path: ['providers', ROUTE, 'models'], value: next }], view.revision);
  }
  catalog.recordSynchronized?.(rows.map(row => row.id));
  return next;
}
