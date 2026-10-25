/** Drive document paths are relative to the server-selected company root.
 * This exception is upload-only: it must never authorize reading/deleting files.
 */
export function uploadPathError(
  bucket: string,
  path: string,
  orgId: string,
  callerId: string,
  googleDrive: boolean,
): string | null {
  if (!path || /^(?:gdrive:|http)/i.test(path) || /[\\'\u0000-\u001f\u007f]/.test(path)
    || path.split('/').some(part => part === '..' || part === '.' || part === '')) {
    return 'Invalid path';
  }
  if (bucket === 'documents') {
    // Creating folders under this org's Drive root cannot access another org.
    if (googleDrive || path.startsWith(`${orgId}/`)) return null;
    return 'Forbidden: path does not belong to your organization';
  }
  if (['dvir-photos', 'dvir-signatures', 'branding-assets', 'beta_feedback'].includes(bucket)) {
    return path.startsWith(`${callerId}/`) ? null : 'Forbidden: path does not belong to you';
  }
  return 'Forbidden: bucket not allowed';
}