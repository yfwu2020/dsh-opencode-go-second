export async function readJson(response, limit = 4 * 1024 * 1024) {
  if (!response.ok) { await response.body?.cancel(); throw Error(`模型服务返回 ${response.status}`); }
  const reader = response.body?.getReader();
  if (!reader) throw Error('模型服务返回了空响应');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) throw Error('模型资料响应过大');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Error('模型服务返回了无效的 JSON'); }
}
