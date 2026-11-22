/** Decode SSE frames across arbitrary network/UTF-8 chunk boundaries. */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const dataOf = (frame: string) => frame.split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart()).join('\n');
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      pending = pending.replace(/\r\n/g, '\n');
      let boundary = pending.indexOf('\n\n');
      while (boundary !== -1) {
        const data = dataOf(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
        if (data) yield data;
        boundary = pending.indexOf('\n\n');
      }
      if (done) break;
    }
    const remaining = dataOf(pending);
    if (remaining) yield remaining;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readStatementResult<T>(body: ReadableStream<Uint8Array>): Promise<T> {
  for await (const data of readSseData(body)) {
    const event = JSON.parse(data);
    if (event.error) throw new Error(event.error);
    if (event.result) return event.result as T;
  }
  throw new Error('The statement connection ended before reading finished. Please try again.');
}

export async function readGatewayContent(body: ReadableStream<Uint8Array>): Promise<string> {
  let content = '';
  let completed = false;
  for await (const data of readSseData(body)) {
    if (data === '[DONE]') { completed = true; break; }
    const event = JSON.parse(data);
    if (event.error) throw new Error('Document processing service is temporarily unavailable.');
    const choice = event.choices?.[0];
    content += choice?.delta?.content ?? '';
    if (choice?.finish_reason === 'stop') completed = true;
    if (choice?.finish_reason && choice.finish_reason !== 'stop') {
      throw new Error('The document service could not finish this statement. No partial result was imported.');
    }
  }
  if (!completed || !content.trim()) {
    throw new Error('The document service returned an incomplete statement. No partial result was imported.');
  }
  return content;
}