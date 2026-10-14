import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';
import { withOpenCodeSessionHeader } from '@earendil-works/pi-ai/providers/opencode-headers';
const google = withOpenCodeSessionHeader(googleGenerativeAIApi());

/** Keep SDK vendor behavior separate from the public DSH connection identity. */
export function goStream(base, method, route, model, context, options) {
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
      source = google.stream(wireModel, wireContext, { ...options, thinking: { enabled: model.reasoning && options?.reasoning !== 'off', ...(level ? { level } : {}) } });
    } else source = google[method](wireModel, wireContext, options);
  } else source = base[method](wireModel, wireContext, options);
  const routedMessage = message => message?.provider === 'opencode-go'
    ? { ...message, provider: route } : message;
  return {
    async *[Symbol.asyncIterator]() {
      for await (const event of source) {
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
