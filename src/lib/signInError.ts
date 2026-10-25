export function signInErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === 'user_banned') return 'Your account is deactivated. Contact your company owner to restore access.';
  return error.message.includes('Invalid login') ? 'Invalid email or password' : error.message;
}