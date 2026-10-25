import { expect, it } from 'vitest';
import { signInErrorMessage } from '../signInError';

it('identifies deactivated accounts from the Auth ban error', () => {
  expect(signInErrorMessage({ code: 'user_banned', message: 'User is banned' }))
    .toBe('Your account is deactivated. Contact your company owner to restore access.');
  expect(signInErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
    .toBe('Invalid email or password');
});