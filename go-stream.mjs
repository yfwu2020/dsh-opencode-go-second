/** Keep SDK vendor behavior separate from the public DSH connection identity. */
export function goStream(base, method, route, model, context, options) {
  const wireModel = { ...model, provider: 'opencode-go' };
  const wireContext = {
    ...context,
    messages: context.messages.map(message => message.role === 'assistant' && message.provider === route
      ? { ...message, provider: 'opencode-go' } : message),
  };
  const source = base[method](wireModel, wireContext, options);
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
