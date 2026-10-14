import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCatalogStore } from '../catalog-store.mjs';
import { syncGoModels } from '../sync.mjs';
import { secondGoModels } from '../catalog.mjs';
import { buildProfiles } from '../profiles.mjs';

const route = 'opencode-go-second', ns = 'llm-opencode-go-second';
const googleId = 'gemini-4-argon-contributor', catId = 'cat-jam-free';
const metadata = { npm: '@ai-sdk/openai-compatible', models: {
  [googleId]: { id: googleId, name: 'Gemini 4 Argon Contributor', provider: { npm: '@ai-sdk/google' }, reasoning: true, temperature: false,
    reasoning_options: [{ type: 'effort', values: ['low','medium','high'] }], modalities: { input: ['text','image','audio','pdf'] }, limit: { context: 1048576, output: 65536 } },
  [catId]: { id: catId, name: 'Cat Jam Free', reasoning: true, interleaved: { field: 'reasoning_content' },
    reasoning_options: [{ type: 'effort', values: ['low','medium','high','xhigh','max'] }], modalities: { input: ['text'] }, limit: { context: 262144, output: 131072 } },
} };
test('new metadata becomes callable and survives restart without caching credentials', async () => {
  const dir = mkdtempSync(join(tmpdir(),'go-catalog-')); const file = join(dir,'catalog.json');
  const requests = [];
  const fetcher = async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify({ 'opencode-go': metadata })); };
  try {
    const store = createCatalogStore({ file, fetcher });
    await store.refresh([...secondGoModels.keys(), googleId, catId]);
    assert.equal(requests[0].url, 'https://models.dev/api.json');
    assert.ok(!requests[0].options?.headers?.authorization);
    assert.equal(store.models.get(googleId).api, 'google-generative-ai');
    assert.equal(store.models.get(googleId).baseUrl, 'https://opencode.ai/inference/go/v1');
    assert.deepEqual(store.models.get(googleId).input, ['text','image']);
    assert.equal(store.models.get(catId).compat.requiresReasoningContentOnAssistantMessages, true);
    assert.equal(store.models.get(catId).thinkingLevelMap.max, 'max');
    const restored = createCatalogStore({ file, fetcher });
    const profile = buildProfiles({ [route]: { apiKeyEnv: 'SECOND_TEST_REF', models: [{ id: googleId }, { id: catId }] } }, restored.models).get(route);
    assert.deepEqual(profile.piProvider.getModels().map(m => m.id), [googleId,catId]);
    assert.ok(!readFileSync(file,'utf8').includes('SECOND_TEST_REF'));
    const before = [...restored.models.keys()];
    await assert.rejects(() => restored.refresh(['unverified-new-model']), /unverified-new-model/);
    assert.deepEqual([...restored.models.keys()], before);
  } finally { rmSync(dir,{ recursive:true,force:true }); }
});

test('automatic synchronization adds new models but preserves disabled models and custom names', async () => {
  const previous = new Map(secondGoModels);
  const selected = [{ id: 'deepseek-v4.1-flash', name: 'My local name' }];
  const view = { ns, revision: 8, value: { providers: { [route]: { apiKeyEnv: 'SECOND_TEST_REF', models: selected } } } };
  const writes = [];
  const settings = { describe: () => [view], mutate: async (...args) => writes.push(args) };
  await syncGoModels({ settings, ns, catalog: { models: previous }, discover: async () => [
    { id:'deepseek-v4.1-flash', name:'Updated name', contextWindow:1000000, maxTokens:384000, inputModalities:['text','image'] },
    { id:'gpt-6-luna', name:'GPT 6 Luna' },
    { id:catId, name:'Cat Jam Free', contextWindow:262144, maxTokens:131072, inputModalities:['text'] },
  ] });
  assert.equal(writes.length,1);
  assert.equal(writes[0][0],ns); assert.equal(writes[0][2],8);
  assert.deepEqual(writes[0][1][0].path,['providers',route,'models']);
  assert.deepEqual(writes[0][1][0].value.map(m=>m.id),['deepseek-v4.1-flash',catId]);
  assert.equal(writes[0][1][0].value[0].name,'My local name');
});

test('failed fetch, stale settings, or a removed connection do not replace user settings', async () => {
  let writes = 0, discoveries = 0;
  const view = { ns, revision:2, value:{ providers:{[route]:{ models:[{id:'deepseek-v4.1-flash'}] }} } };
  const settings = { describe:()=>[view], mutate:async()=>{writes++;throw Error('revision conflict');} };
  await assert.rejects(() => syncGoModels({settings,ns,catalog:{models:secondGoModels},discover:async()=>{throw Error('offline');}}),/offline/);
  assert.equal(writes,0);
  await assert.rejects(() => syncGoModels({settings,ns,catalog:{models:secondGoModels},discover:async()=>[{id:catId,name:'Cat Jam Free'}]}),/conflict/);
  assert.equal(writes,1);
  await syncGoModels({settings:{describe:()=>[]},ns,catalog:{models:secondGoModels},discover:async()=>{discoveries++;}});
  assert.equal(discoveries,0);
});

test('a conflicted settings write retries new models even after metadata was cached', async () => {
  const catalog=createCatalogStore({file:null,fetcher:async()=>new Response(JSON.stringify({'opencode-go':metadata}))});
  let fail=true, saved;
  const settings={describe:()=>[{ns,revision:3,value:{providers:{[route]:{models:[{id:'deepseek-v4.1-flash'}]}}}}],mutate:async(_,ops)=>{if(fail)throw Error('revision conflict');saved=ops[0].value;}};
  const discover=async()=>{await catalog.refresh([catId]);return [{id:'deepseek-v4.1-flash'},{id:catId}];};
  await assert.rejects(()=>syncGoModels({settings,ns,catalog,discover}),/conflict/);
  fail=false;await syncGoModels({settings,ns,catalog,discover});
  assert.ok(saved.some(m=>m.id===catId));
});

test('refreshing metadata cannot reduce capabilities of an already usable model', async () => {
  const id='deepseek-v4.1-flash', old=secondGoModels.get(id);
  const catalog=createCatalogStore({file:null,fetcher:async()=>new Response(JSON.stringify({'opencode-go':{npm:'@ai-sdk/openai-compatible',models:{[id]:{name:'Changed',modalities:{input:['text']},limit:{context:10000,output:1000}}}}}))});
  await catalog.refresh([id]);
  assert.deepEqual(catalog.models.get(id),old);
});

test('a missing cache can bootstrap saved new models without enabling unrelated models', async () => {
  const custom={id:catId,name:'My Cat',contextWindow:1024,maxTokens:64,input:['text'],reasoningEfforts:false};
  const config={[route]:{apiKeyEnv:'SECOND_TEST_REF',models:[custom]}};
  const profiles=buildProfiles(config,secondGoModels,{allowMissingMetadata:true});
  assert.deepEqual(profiles.get(route).piProvider.getModels(),[]);
  const settings={describe:()=>[{ns,revision:1,value:{providers:config}}],mutate:async(_,ops)=>{assert.deepEqual(ops[0].value,[custom]);}};
  await syncGoModels({settings,ns,catalog:{models:secondGoModels},discover:async()=>[{id:catId,name:'Cat Jam Free',contextWindow:262144,maxTokens:131072,inputModalities:['text']},{id:googleId,name:'Gemini'}]});
});

test('a disabled model stays disabled after temporarily disappearing from the service', async () => {
  const catalog=createCatalogStore({file:null});
  let models=[{id:'deepseek-v4.1-flash'}], listings=[{id:'deepseek-v4.1-flash'}];
  const settings={describe:()=>[{ns,revision:1,value:{providers:{[route]:{models}}}}],mutate:async(_,ops)=>{models=ops[0].value;}};
  const discover=async()=>listings;
  await syncGoModels({settings,ns,catalog,discover});
  listings=[...listings,{id:'gpt-6-luna',name:'GPT 6 Luna'}];
  await syncGoModels({settings,ns,catalog,discover});
  assert.deepEqual(models.map(m=>m.id),['deepseek-v4.1-flash']);
});
