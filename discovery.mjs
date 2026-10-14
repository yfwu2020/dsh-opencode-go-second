import { LlmError, assertUsableApiKey, attributionHeaders } from '@deepseek-ai/dsh-llm';
import { secondGoModels } from './catalog.mjs';
import { ROUTE } from './profiles.mjs';
import { readJson } from './json-response.mjs';

const URL = 'https://opencode.ai/zen/go/v1/models';
export async function discoverGoModels(request, resolveKey, signal, catalog, refreshMetadata = false) {
  if (request.provider !== undefined && request.provider !== ROUTE) throw new LlmError('Wrong Go connection', 'DISCOVERY_FAILED');
  if (request.baseURL && request.baseURL.replace(/\/+$/, '') !== 'https://opencode.ai/zen/go/v1') {
    throw new LlmError('Go discovery uses the official Go endpoint', 'DISCOVERY_FAILED');
  }
  const apiKey = assertUsableApiKey(request.apiKey ?? await resolveKey(), 'Go second connection', 'API key');
  const response = await fetch(URL, {
    headers: { accept: 'application/json', authorization: `Bearer ${apiKey}`, ...attributionHeaders() },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    redirect: 'error',
  });
  const body = await readJson(response);
  if (!Array.isArray(body.data) || !body.data.length) throw new LlmError('Go model listing is empty or invalid', 'DISCOVERY_FAILED');
  const ids = [...new Set(body.data.map(row => row?.id))];
  if (ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,150}$/.test(id))) throw new LlmError('Go 返回了无效的模型 ID', 'DISCOVERY_FAILED');
  let models = catalog?.models ?? secondGoModels;
  const unknown = ids.filter(id => !models.has(id));
  if (catalog && (unknown.length || refreshMetadata)) {
    try { await catalog.refresh(ids, signal); models = catalog.models; }
    catch (error) { throw new LlmError(`自动更新模型资料失败${unknown.length ? `（${unknown.join(', ')}）` : ''}：${error.message} 已保留现有配置。`, 'DISCOVERY_FAILED'); }
  } else if (unknown.length) throw new LlmError(`暂缺 ${unknown.join(', ')} 的接入资料；保留现有配置。`, 'DISCOVERY_FAILED');
  return ids.map(id => {
    const model = models.get(id);
    return { id, name: model.name, contextWindow: model.contextWindow, maxTokens: model.maxTokens, inputModalities: [...model.input] };
  });
}
