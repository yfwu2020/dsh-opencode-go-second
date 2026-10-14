import assert from 'node:assert/strict';
import test from 'node:test';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import { buildProfiles } from '../profiles.mjs';
import { buildCatalog } from '../catalog.mjs';

test('Google Go transport keeps second key, conversation header, thinking level and tool replay', async () => {
  const id = 'gemini-4-argon-contributor', route = 'opencode-go-second';
  const catalog = buildCatalog([id], { npm:'@ai-sdk/openai-compatible', models: { [id]: {
    name:'Gemini 4 Argon Contributor', provider:{npm:'@ai-sdk/google'}, reasoning:true,
    reasoning_options:[{type:'effort',values:['low','medium','high']}],
    modalities:{input:['text','image']},limit:{context:1048576,output:65536},
  } } });
  const profiles = buildProfiles({[route]:{apiKeyEnv:'SECOND_TEST_REF',models:[{id}]}},catalog);
  const adapter = new PiAiAdapter({profiles:()=>profiles,resolveApiKey:async()=> 'fake-google-go-key'});
  const saved = globalThis.fetch, requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input,init);requests.push({url:request.url,headers:request.headers,body:JSON.parse(await request.text())});
    const parts = requests.length === 1 ? [{text:'Plan',thought:true,thoughtSignature:'dGVzdC10aG91Z2h0'}, {functionCall:{name:'local_lookup',args:{}},thoughtSignature:'dGVzdC10b29s'}] : [{text:'OK'}];
    const chunk = {candidates:[{content:{role:'model',parts},finishReason:'STOP'}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:1,totalTokenCount:3}};
    return new Response(`data: ${JSON.stringify(chunk)}\n\n`,{headers:{'content-type':'text/event-stream'}});
  };
  const options = {provider:route,model:id,sessionId:'google-test-session',reasoningEffort:'high',maxTokens:32,tools:[{name:'local_lookup',description:'Local test',parameters:{type:'object',properties:{}}}]};
  try {
    const events=[];
    for await(const event of adapter.stream({...options,messages:[{role:'user',content:[{type:'text',text:'Local test'}]}]}))events.push(event);
    const finish = events.find(x=>x.type==='finish');
    assert.equal(finish?.reason.kind,'tool-calls',JSON.stringify(events));
    assert.ok(requests[0].url.startsWith('https://opencode.ai/inference/go/v1/models/'+id+':streamGenerateContent'));
    assert.equal(requests[0].headers.get('x-goog-api-key'),'fake-google-go-key');
    assert.equal(requests[0].headers.get('x-opencode-session'),'google-test-session');
    assert.match(requests[0].headers.get('user-agent'),/deepseek-harness/i);
    assert.equal(requests[0].body.generationConfig.thinkingConfig.thinkingLevel,'HIGH');
    assert.ok(!('thinkingBudget' in requests[0].body.generationConfig.thinkingConfig));
    const content = events.filter(x=>x.type==='block-end').sort((a,b)=>a.index-b.index).map(x=>x.block);
    const call = content.find(x=>x.type==='tool-call');assert.ok(call);
    const second=[];
    for await(const event of adapter.stream({...options,messages:[
      {role:'user',content:[{type:'text',text:'Local test'}]},
      {role:'assistant',content,source:{provider:route,model:id,replayState:finish.replayState}},
      {role:'tool',toolCallId:call.id,content:[{type:'text',text:'Local result'}]},
    ]}))second.push(event);
    assert.equal(second.find(x=>x.type==='finish')?.reason.kind,'stop',JSON.stringify(second));
    const modelTurn=requests[1].body.contents.find(x=>x.role==='model');
    assert.ok(modelTurn.parts.some(x=>x.thoughtSignature==='dGVzdC10b29s'));
    const defaults=[];
    for await(const event of adapter.stream({...options,reasoningEffort:undefined,messages:[{role:'user',content:[{type:'text',text:'Local test'}]}]}))defaults.push(event);
    assert.equal(defaults.find(x=>x.type==='finish')?.reason.kind,'stop');
    assert.notEqual(requests[2].body.generationConfig.thinkingConfig?.thinkingBudget,0);
    assert.throws(()=>buildProfiles({[route]:{apiKeyEnv:'SECOND_TEST_REF',headers:{'X-Goog-Api-Key':'fake-override'},models:[{id}]}},catalog),/managed/);
  } finally {globalThis.fetch=saved;}
});
