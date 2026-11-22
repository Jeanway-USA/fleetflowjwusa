import { invokeWithAuth } from '@/lib/invoke-with-auth';
import { readStatementResult } from '../../supabase/functions/parse-landstar-statement/stream';

/** Both statement entry points use the same streaming contract (no timer/retry races). */
export async function parseLandstarPdf(pdfBase64: string): Promise<any> {
  const { data, error } = await invokeWithAuth<Response | Record<string, any>>(
    'parse-landstar-statement', { body: { pdfBase64, stream: true } },
  );
  if (error) throw error;
  if (!data) throw new Error('No statement was returned.');
  if (data instanceof Response) {
    if (!data.body) throw new Error('The statement connection ended before reading finished.');
    return readStatementResult(data.body);
  }
  // Older deployed functions return JSON during rollout.
  if (data.error) throw new Error(data.error);
  return data;
}