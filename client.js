window.__ModuleLoader__.load({
  id: 'dsh-opencode-go-second',
  factory: require => {
    const React = require('react');
    const ns = 'llm-opencode-go-second', route = 'opencode-go-second';
    const valueOf = response => {
      if (!response.ok) throw new Error(response.error?.message ?? '操作失败');
      return response.value;
    };
    function createActions(api) {
      return {
        async load() {
          const view = valueOf(await api.settings.describe()).namespaces.find(view => view.ns === ns);
          if (!view) throw new Error('第二套设置尚未加载');
          return view;
        },
        async discover(key = '') {
          return valueOf(await api.llm.discoverModels(ns, { provider: route, ...(key.trim() ? { apiKey: key.trim() } : {}) }));
        },
        async save(view, models) {
          if (!models.length) throw new Error('至少保留一个模型');
          return valueOf(await api.settings.mutate(ns, [{ op: 'set', path: ['providers', route, 'models'], value: models }], view.revision));
        },
        async storeKey(view, key) {
          if (!/^[\x21-\x7E]+$/.test(key.trim())) throw new Error('请输入有效的 API 密钥');
          const ref = view.value.providers[route].apiKeyEnv;
          const latest = valueOf(await api.settings.describe()).namespaces.find(view => view.ns === ns);
          if (!ref || ref === 'OPENCODE_GO_API_KEY' || latest?.value?.providers?.[route]?.apiKeyEnv !== ref) {
            throw new Error('第二套密钥引用已变化，请重新加载设置');
          }
          valueOf(await api.credentials.set(ref, key.trim()));
        },
      };
    }
    // The public seat extends the native card. Scope replacement chrome to the
    // card containing our marker; no host file changes or global button rules.
    const styles = `
      li:has(.dsh-go2-settings) > :not(.dsh-go2-settings):not(:has(.dsh-go2-settings)) { display: none !important; }
      .dsh-go2-settings { color: var(--dsw-alias-label-primary); font: inherit; }
      .dsh-go2-settings * { box-sizing: border-box; }
      .dsh-go2-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .dsh-go2-title { font-size: 14px; line-height: 22px; font-weight: 500; }
      .dsh-go2-identity { display: inline-flex; align-items: center; gap: 6px; }
      .dsh-go2-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--dsw-alias-state-success-primary); }
      .dsh-go2-dot-missing { background: var(--dsw-alias-state-error-primary); }
      .dsh-go2-meta { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
      .dsh-go2-settings button { font: inherit; font-size: 12px; line-height: 18px; height: 28px; padding: 0 10px; border: .5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-sm, 6px); color: inherit; background: transparent; cursor: pointer; white-space: nowrap; }
      .dsh-go2-settings button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-solid); }
      .dsh-go2-settings button:disabled { opacity: .45; cursor: default; }
      .dsh-go2-settings :focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 3px; }
      .dsh-go2-settings .dsh-go2-primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); border-color: transparent; }
      .dsh-go2-settings .dsh-go2-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
      .dsh-go2-body { margin-top: 12px; padding: 12px 14px; border-radius: var(--dsw-radius-lg, 10px); background: var(--dsw-alias-bg-module-platform); display: grid; gap: 16px; font-size: 12px; line-height: 18px; }
      .dsh-go2-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .dsh-go2-heading { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
      .dsh-go2-keyrow { display: flex; gap: 8px; margin-top: 6px; }
      .dsh-go2-settings input[type=password], .dsh-go2-settings input[type=search] { font: inherit; height: 30px; padding: 0 10px; min-width: 0; width: 100%; border-radius: var(--dsw-radius-sm, 6px); border: .5px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-input-fill, transparent); color: inherit; }
      .dsh-go2-hint { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; margin: 5px 0 0; }
      .dsh-go2-tools { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
      .dsh-go2-tools input { flex: 1; }
      .dsh-go2-list { max-height: 280px; overflow-y: auto; border: .5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-sm, 6px); }
      .dsh-go2-model { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; border-bottom: .5px solid var(--dsw-alias-border-l3); }
      .dsh-go2-model:last-child { border-bottom: 0; }
      .dsh-go2-model:hover { background: rgba(128,128,128,.07); }
      .dsh-go2-model input { width: 14px; height: 14px; accent-color: var(--dsw-alias-label-primary); flex-shrink: 0; }
      .dsh-go2-modeltext { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      .dsh-go2-id { display: block; margin-top: 1px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
      .dsh-go2-context { font-size: 11px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
      .dsh-go2-footer { display: flex; gap: 10px; justify-content: flex-end; align-items: center; padding-top: 10px; }
      .dsh-go2-footer span { margin-right: auto; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .dsh-go2-notice { font-size: 12px; line-height: 18px; margin: 8px 0 0; }
      .dsh-go2-error { color: var(--dsw-alias-label-error, #ef9292); }
      @media (max-width: 560px) { .dsh-go2-keyrow { flex-wrap: wrap; } .dsh-go2-context { display: none; } }
    `;
    function GoSettings(props) {
      const [open, setOpen] = React.useState(false);
      const [view, setView] = React.useState();
      const [models, setModels] = React.useState([]);
      const [selected, setSelected] = React.useState([]);
      const [key, setKey] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [notice, setNotice] = React.useState('');
      const [failed, setFailed] = React.useState(false);
      const [search, setSearch] = React.useState('');
      const actions = React.useMemo(() => createActions(props.api), [props.api]);
      const h = React.createElement;
      const baseline = view?.value.providers[route].models ?? [];
      const modelDirty = JSON.stringify(models.filter(model => selected.includes(model.id))) !== JSON.stringify(baseline);
      const dirty = !!key.trim() || modelDirty;
      const visible = models.filter(model => `${model.name ?? ''} ${model.id}`.toLowerCase().includes(search.trim().toLowerCase()));
      const perform = async operation => {
        setBusy(true); setNotice(''); setFailed(false);
        try { await operation(); } catch (error) { setFailed(true); setNotice(error.message); }
        finally { setBusy(false); }
      };
      const reset = next => {
        const rows = next.value.providers[route].models ?? [];
        setModels(rows); setSelected(rows.map(model => model.id)); setKey(''); setNotice(''); setFailed(false);
      };
      const load = () => perform(async () => {
        const next = await actions.load(); setView(next); reset(next); setOpen(true);
      });
      const toggle = () => { if (open) setOpen(false); else if (view) setOpen(true); else return load(); };
      const refresh = () => perform(async () => {
        const rows = (await actions.discover(key)).map(model => ({
          id: model.id, name: model.name, contextWindow: model.contextWindow,
          maxTokens: model.maxTokens, input: model.inputModalities,
        }));
        setModels(rows); setSelected(rows.map(model => model.id));
        setNotice(`已获取 ${rows.length} 个模型${JSON.stringify(rows) === JSON.stringify(baseline) ? '，与已保存目录一致。' : '；点击保存模型后生效。'}`);
      });
      const save = () => perform(async () => {
        const rows = models.filter(model => selected.includes(model.id));
        const next = await actions.save(view, rows);
        setView(next); setModels(rows); setNotice('模型已保存。');
      });
      const storeKey = () => perform(async () => {
        await actions.storeKey(view, key); setKey(''); setNotice('API 密钥已更新。');
      });
      const button = (text, onClick, disabled = busy, primary = false) => h('button', { type: 'button', onClick, disabled, className: primary ? 'dsh-go2-primary' : undefined }, text);
      const contextLabel = value => value ? `上下文 ${value >= 1000000 ? `${+(value / 1000000).toFixed(1)}M` : `${Math.round(value / 1000)}K`}` : '';
      return h('div', { className: 'dsh-go2-settings' },
        h('style', null, styles),
        h('div', { className: 'dsh-go2-head' },
          h('div', { className: 'dsh-go2-identity' },
            h('span', { className: 'dsh-go2-title' }, props.provider?.displayName ?? 'OpenCode Go · 2'),
            h('span', { className: `dsh-go2-dot${props.keyConfigured ? '' : ' dsh-go2-dot-missing'}`, role: 'img', 'aria-label': props.keyConfigured ? 'API 密钥已配置' : '尚未配置 API 密钥', title: props.keyConfigured ? 'API 密钥已配置' : '尚未配置 API 密钥' })),
          button(open ? '收起' : '管理', toggle)),
        props.provider?.error && h('p', { role: 'alert', className: 'dsh-go2-notice dsh-go2-error' }, props.provider.error),
        open && h('div', { className: 'dsh-go2-body' },
          h('section', { 'aria-label': 'API 密钥' },
            h('label', { className: 'dsh-go2-heading', htmlFor: 'dsh-go2-key' }, 'API 密钥'),
            h('div', { className: 'dsh-go2-keyrow' },
              h('input', { id: 'dsh-go2-key', type: 'password', value: key, disabled: busy, autoComplete: 'off', placeholder: '输入新密钥以替换', onChange: event => setKey(event.target.value) }),
              button('更新密钥', storeKey, busy || !key.trim())),
            h('p', { className: 'dsh-go2-hint' }, '留空保留当前密钥。密钥与模型分别保存。')),
          h('section', { 'aria-label': '模型' },
            h('div', { className: 'dsh-go2-line' }, h('div', null,
              h('span', { className: 'dsh-go2-heading' }, '模型'),
              h('span', { className: 'dsh-go2-meta', style: { marginLeft: 12 } }, `已启用 ${selected.length} / ${models.length}`)),
              button(busy ? '处理中…' : '获取可用模型', refresh)),
            h('div', { className: 'dsh-go2-tools' },
              h('input', { type: 'search', value: search, placeholder: '搜索模型名称或 ID', 'aria-label': '搜索模型', onChange: event => setSearch(event.target.value) }),
              button('全部启用', () => setSelected(models.map(model => model.id)), busy || selected.length === models.length)),
            h('div', { className: 'dsh-go2-list' },
              visible.length ? visible.map(model => h('label', { key: model.id, className: 'dsh-go2-model' },
                h('input', { type: 'checkbox', checked: selected.includes(model.id), disabled: busy, onChange: event => setSelected(previous => event.target.checked ? [...previous, model.id] : previous.filter(id => id !== model.id)) }),
                h('span', { className: 'dsh-go2-modeltext' }, model.name ?? model.id, h('small', { className: 'dsh-go2-id' }, model.id)),
                h('small', { className: 'dsh-go2-context' }, contextLabel(model.contextWindow)))) : h('p', { className: 'dsh-go2-hint', style: { padding: 12 } }, '没有匹配的模型')),
            dirty && h('div', { className: 'dsh-go2-footer' },
              h('span', null, '有未保存的修改'),
              button('撤销修改', () => reset(view)),
              modelDirty && button('保存模型', save, busy || !selected.length, true)))),
        notice && h('p', { role: failed ? 'alert' : 'status', className: `dsh-go2-notice${failed ? ' dsh-go2-error' : ''}` }, notice),
        failed && /conflict|revision|已变化|冲突/i.test(notice) && button('重新读取设置', load));
    }
    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.credentials', 'remote.llm'],
      createActions,
      apply(ctx) {
        ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
          name: 'settings.models.provider-card', key: ns,
          inject: () => ({ api: ctx.remote }),
        }, GoSettings));
      },
    };
  },
});
