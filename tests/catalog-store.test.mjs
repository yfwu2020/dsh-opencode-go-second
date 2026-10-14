import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCatalogStore } from '../catalog-store.mjs';
import { secondGoModels } from '../catalog.mjs';
import { buildProfiles } from '../profiles.mjs';

const route = 'opencode-go-second';
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

test('refreshing metadata cannot reduce capabilities of an already usable model', async () => {
  const id='deepseek-v4.1-flash', old=secondGoModels.get(id);
  const catalog=createCatalogStore({file:null,fetcher:async()=>new Response(JSON.stringify({'opencode-go':{npm:'@ai-sdk/openai-compatible',models:{[id]:{name:'Changed',modalities:{input:['text']},limit:{context:10000,output:1000}}}}}))});
  await catalog.refresh([id]);
  assert.deepEqual(catalog.models.get(id),old);
});

test('saved new models wait for manual metadata recovery when cache is missing', () => {
  const config = { [route]: { apiKeyEnv: 'SECOND_TEST_REF', models: [{ id: catId }] } };
  const profiles = buildProfiles(config, secondGoModels, { allowMissingMetadata: true });
  assert.deepEqual(profiles.get(route).piProvider.getModels(), []);
  assert.throws(() => buildProfiles(config, secondGoModels), /No verified Go protocol metadata/);
});
