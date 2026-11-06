import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';
import { withOpenCodeSessionHeader } from '@earendil-works/pi-ai/providers/opencode-headers';
const google = withOpenCodeSessionHeader(googleGenerativeAIApi());

/**
 * The Go gateway routes each `x-opencode-session` to one backend cell, and a cell
 * that is short on prefill capacity answers `prefill_cap_refused` in about a
 * second while its neighbours serve the same body. Retrying that exact session id
 * therefore keeps hitting the same refusal, so one refusal advances this
 * conversation to a derived id and the next attempt lands on another cell.
 * Healthy conversations keep their original id and their prompt-cache affinity.
 */
const CAPACITY_REFUSAL = /prefill_cap_refused/i;
const MAX_ROTATIONS = 32;
const MAX_TRACKED_SESSIONS = 256;
const rotations = new Map();

function rotationOf(sessionId) {
  return rotations.get(sessionId) ?? 0;
}

function noteCapacityRefusal(sessionId) {
  const current = rotationOf(sessionId);
  if (current >= MAX_ROTATIONS) return;
  rotations.set(sessionId, current + 1);
  while (rotations.size > MAX_TRACKED_SESSIONS) rotations.delete(rotations.keys().next().value);
}

/** Keep SDK vendor behavior separate from the public DSH connection identity. */
export function goStream(base, method, route, model, context, options) {
  const sessionId = typeof options?.sessionId === 'string' && options.sessionId !== '' ? options.sessionId : undefined;
  const rotation = sessionId === undefined ? 0 : rotationOf(sessionId);
  // An explicit header wins over the SDK's own `options.sessionId` injection.
  const wireOptions = rotation === 0 ? options : {
    ...options,
    headers: { ...options.headers, 'x-opencode-session': `${sessionId}#r${rotation}` },
  };
  const wireModel = { ...model, provider: 'opencode-go' };
  const wireContext = {
    ...context,
    messages: context.messages.map(message => message.role === 'assistant' && message.provider === route
      ? { ...message, provider: 'opencode-go' } : message),
  };
  let source;
  if (model.api === 'google-generative-ai') {
    // The pinned SDK predates Gemini 4's name. Use its explicit Google thinking
    // option instead of its name-based Gemini 3 detection; retain SDK replay.
    if (method === 'streamSimple') {
      const level = ['low', 'medium', 'high'].includes(options?.reasoning) ? options.reasoning.toUpperCase() : undefined;
      source = google.stream(wireModel, wireContext, { ...wireOptions, thinking: { enabled: model.reasoning && options?.reasoning !== 'off', ...(level ? { level } : {}) } });
    } else source = google[method](wireModel, wireContext, wireOptions);
  } else source = base[method](wireModel, wireContext, wireOptions);
  const routedMessage = message => message?.provider === 'opencode-go'
    ? { ...message, provider: route } : message;
  return {
    async *[Symbol.asyncIterator]() {
      for await (const event of source) {
        const refusal = event?.error?.errorMessage;
        if (sessionId !== undefined && typeof refusal === 'string' && CAPACITY_REFUSAL.test(refusal)) {
          noteCapacityRefusal(sessionId);
        }
        yield {
          ...event,
          ...event.partial === undefined ? {} : { partial: routedMessage(event.partial) },
          ...event.message === undefined ? {} : { message: routedMessage(event.message) },
          ...event.error === undefined ? {} : { error: routedMessage(event.error) },
        };
      }
    },
    result: async () => routedMessage(await source.result()),
  };
}
