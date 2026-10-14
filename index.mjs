import { Config, PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import { LlmError, assertUsableApiKey, resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm';
import { buildProfiles, ROUTE, LABEL } from './profiles.mjs';
import { discoverGoModels } from './discovery.mjs';
import { createCatalogStore } from './catalog-store.mjs';
import { syncGoModels } from './sync.mjs';

export { Config };
export const name = 'llm-opencode-go-second';
export const inject = ['llm', 'credentials'];

export function apply(ctx, config, options = {}) {
  const catalog = createCatalogStore({ file: options.cacheFile, onWarning: message => ctx.logger.warn(message) });
  const settingsNs = ctx.fiber.entry?.options.id ?? name;
  let lastRaw, lastProfiles, lastVersion;
  const profiles = () => {
    const raw = config.providers.get();
    if (raw !== lastRaw || !lastProfiles || lastVersion !== catalog.version) {
      const next = buildProfiles(raw, catalog.models, { allowMissingMetadata: true });
      lastRaw = raw; lastProfiles = next; lastVersion = catalog.version;
    }
    return lastProfiles;
  };
  const resolveApiKey = async (provider, profile) => {
    if (provider !== ROUTE) throw new LlmError('This plugin does not own that connection', 'NO_ADAPTER');
    const value = (await ctx.get('credentials')?.resolve(profile.apiKeyEnv))?.value;
    if (!value) throw new LlmError('The second Go connection has no configured API key', 'MISSING_CREDENTIAL');
    return assertUsableApiKey(value, name, profile.apiKeyEnv);
  };
  profiles();
  ctx.on('internal/config', function (_raw, next) {
    const raw = next();
    if (this === ctx.fiber) buildProfiles(Config(raw).providers.get(), catalog.models);
    return raw;
  });
  const adapter = new PiAiAdapter({
    profiles, resolveApiKey,
    auth: {
      credentials: { read: async () => undefined, list: async () => [], modify: async () => { throw new Error('Go uses the DSH credential service'); }, delete: async () => {} },
      authContext: { env: async () => undefined, fileExists: async () => false },
    },
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments, hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath), ref),
    onReplayDegrade: ({ reason }) => ctx.logger.warn(`${name}: history replay used provider-neutral content (${reason})`),
  });
  let registration;
  const directory = ctx.llm.registerConfigurableProviders([{
    provider: ROUTE, displayName: LABEL, settingsNs,
    settingsPath: ['providers', ROUTE], declared: true,
  }]);
  const update = () => {
    const current = profiles();
    const routes = [...current.keys()];
    if (registration) registration.replace(routes);
    else if (routes.length) registration = ctx.llm.registerAdapter(routes, adapter);
    directory.replace([{
      provider: ROUTE, displayName: current.get(ROUTE)?.displayName ?? LABEL,
      settingsNs, settingsPath: ['providers', ROUTE], declared: true,
    }]);
  };
  update();
  const discover = (request, signal, refreshMetadata = false) => discoverGoModels(request, () => {
    const profile = profiles().get(ROUTE);
    if (!profile) throw new LlmError('The second Go connection is not configured', 'MISSING_CREDENTIAL');
    return resolveApiKey(ROUTE, profile);
  }, signal, catalog, refreshMetadata);
  ctx.llm.registerModelDiscovery(settingsNs, discover);
  ctx.on('loader/volatile-update', update);
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
    child.effect(() => {
      const controller = new AbortController();
      let running;
      const synchronize = () => {
        if (running || controller.signal.aborted) return running;
        running = syncGoModels({
          settings: child.settings, ns: settingsNs, catalog, signal: controller.signal,
          discover: signal => discover({ provider: ROUTE }, signal, true),
        }).then(() => { if (!controller.signal.aborted) update(); }).catch(() => {
          // Never log SDK/HTTP error details that may contain request headers.
          if (!controller.signal.aborted) ctx.logger.warn('Go 自动同步未完成；保留已保存的模型，稍后重试。');
        }).finally(() => { running = undefined; });
        return running;
      };
      const initial = setTimeout(synchronize, 1000); initial.unref?.();
      const interval = setInterval(synchronize, 6 * 60 * 60 * 1000); interval.unref?.();
      child.on('credentials/record-updated', synchronize);
      child.on('credentials/reference-updated', synchronize);
      return () => { controller.abort(); clearTimeout(initial); clearInterval(interval); };
    });
  });
}
