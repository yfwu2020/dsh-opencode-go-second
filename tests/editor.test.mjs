import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function mount() {
  let factory, Component, cursor = 0;
  const states = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(x => x !== false && x != null) }),
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useMemo: callback => callback(),
  };
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(module) { factory = module.factory; } } },
  });
  const client = factory(() => React);
  const models = [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }, { id: 'gpt-6-luna', name: 'GPT 6 Luna' }];
  const view = { ns: 'llm-opencode-go-second', revision: 1, value: { providers: { 'opencode-go-second': { apiKeyEnv: 'OPENCODE_API_KEY', models } } } };
  const api = { settings: { describe: async () => ({ ok: true, value: { namespaces: [view] } }) } };
  client.apply({ slots: { inject: (_, callback) => callback(), register: (_, component) => { Component = component; } }, remote: api });
  const render = () => { cursor = 0; return Component({ api, keyConfigured: true, provider: { displayName: 'OpenCode Go · 2' } }); };
  function walk(node) { return typeof node === 'object' ? [node, ...node.children.flatMap(walk)] : []; }
  const text = node => typeof node === 'object' ? node.children.map(text).join('') : String(node);
  const find = (tree, type, label) => walk(tree).find(node => node.type === type && (label === undefined || text(node) === label));
  return { render, walk, text, find };
}

test('one manager opens without a redundant reload control; collapse preserves drafts', async () => {
  const ui = mount();
  let tree = ui.render();
  assert.ok(ui.text(tree).includes('OpenCode Go · 2'));
  await ui.find(tree, 'button', '管理').props.onClick();
  tree = ui.render();
  assert.ok(ui.find(tree, 'button', '收起'));
  assert.ok(!ui.text(tree).includes('重新加载'));
  assert.ok(!ui.find(tree, 'button', '撤销修改'));
  ui.walk(tree).find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: false } });
  tree = ui.render();
  assert.ok(ui.find(tree, 'button', '撤销修改'));
  ui.find(tree, 'button', '收起').props.onClick();
  tree = ui.render();
  await ui.find(tree, 'button', '管理').props.onClick();
  tree = ui.render();
  assert.equal(ui.walk(tree).find(node => node.type === 'input' && node.props.type === 'checkbox').props.checked, false);
  ui.find(tree, 'button', '撤销修改').props.onClick();
  tree = ui.render();
  assert.ok(!ui.find(tree, 'button', '撤销修改'));
  assert.equal(ui.walk(tree).find(node => node.type === 'input' && node.props.type === 'checkbox').props.checked, true);
});

test('model search narrows rows without losing enabled selections', async () => {
  const ui = mount();
  await ui.find(ui.render(), 'button', '管理').props.onClick();
  let tree = ui.render();
  ui.walk(tree).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: 'gpt' } });
  tree = ui.render();
  const boxes = ui.walk(tree).filter(node => node.type === 'input' && node.props.type === 'checkbox');
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].props.checked, true);
  assert.ok(ui.text(tree).includes('已启用 2 / 2'));
});
