import { describe, it, expect } from 'vitest';
import { readGatewayContent, readStatementResult } from '../../../supabase/functions/parse-landstar-statement/stream';

function body(text: string, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
}

describe('Landstar PDF stream completion', () => {
  it('ignores keep-alives and returns the complete statement across UTF-8 chunk boundaries', async () => {
    const result = { expenses: [{ description: 'Québec fuel', amount: 123.45 }] };
    expect(await readStatementResult(body(`data: {"status":"reading"}\r\n\r\ndata: ${JSON.stringify({ result })}\r\n\r\n`, 1))).toEqual(result);
  });
  it('reconstructs every gateway content chunk before returning JSON', async () => {
    const chunks = ['{"expenses":', '[{"amount":12.34}]}'];
    const text = chunks.map(content => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join('');
    expect(JSON.parse(await readGatewayContent(body(text + 'data: [DONE]\n\n')))).toEqual({ expenses: [{ amount: 12.34 }] });
  });
  it('does not treat a dropped connection as an empty successful statement', async () => {
    await expect(readStatementResult(body('data: {"status":"reading"}\n\n'))).rejects.toThrow('connection ended');
  });
  it('never returns partial gateway output on truncated generation', async () => {
    await expect(readGatewayContent(body('data: {"choices":[{"delta":{"content":"{}"},"finish_reason":"length"}]}\n\n'))).rejects.toThrow('No partial result');
  });
  it('rejects gateway output cut off before a completion marker', async () => {
    await expect(readGatewayContent(body('data: {"choices":[{"delta":{"content":"{}"}}]}\n\n'))).rejects.toThrow('incomplete statement');
  });
  it('surfaces a terminal service error without retries or a successful result', async () => {
    await expect(readStatementResult(body('data: {"error":"AI credits exhausted.","status":402}\n\n'))).rejects.toThrow('AI credits exhausted.');
  });
});