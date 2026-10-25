import { describe, expect, it } from 'vitest';
import { uploadPathError } from '../../../supabase/functions/storage-proxy/upload-path';

const org = 'company-one';
const user = 'driver-one';
describe('storage proxy upload paths', () => {
  it.each(['statements/1.xlsx', 'rate-confirmations/1.pdf', 'general/1.txt',
    'driver-one/1.jpg', 'loads/load-one/1.pdf'])('accepts Drive document path %s under the caller company root', path => {
    expect(uploadPathError('documents', path, org, user, true)).toBeNull();
  });
  it('keeps built-in documents company-prefixed', () => {
    expect(uploadPathError('documents', 'general/1.pdf', org, user, false)).toBe('Forbidden: path does not belong to your organization');
    expect(uploadPathError('documents', 'company-two/general/1.pdf', org, user, false)).toBe('Forbidden: path does not belong to your organization');
    expect(uploadPathError('documents', `${org}/general/1.pdf`, org, user, false)).toBeNull();
  });
  it.each(['../1.pdf', 'general/./1.pdf', 'general//1.pdf', '/1.pdf', 'general\\1.pdf', "general'/1.pdf", 'https://other/file.pdf', 'gdrive:123'])('rejects unsafe Drive path %s', path => {
    expect(uploadPathError('documents', path, org, user, true)).toBe('Invalid path');
  });
  it('keeps user-scoped bucket ownership on Drive', () => {
    expect(uploadPathError('dvir-photos', 'someone-else/1.jpg', org, user, true)).toBe('Forbidden: path does not belong to you');
    expect(uploadPathError('dvir-photos', `${user}/1.jpg`, org, user, true)).toBeNull();
  });
  it('rejects unknown buckets on Drive', () => {
    expect(uploadPathError('private-other', 'general/1.pdf', org, user, true)).toBe('Forbidden: bucket not allowed');
  });
});