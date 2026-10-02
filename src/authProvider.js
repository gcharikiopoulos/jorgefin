// React Admin auth provider over Neon Auth (Google, full-page redirect).
// The session stays where the Neon SDK keeps it; nothing is copied to storage here.

import { appUrl, getClient, getMock, isMock } from './backend.js';

let mockSignedIn = true;

export const authProvider = {
  // Starts the Google redirect. The page navigates away, so this never resolves.
  async login() {
    if (isMock) {
      mockSignedIn = true;
      return;
    }
    const client = await getClient();
    const { error } = await client.auth.signIn.social({
      provider: 'google',
      callbackURL: appUrl(),
      errorCallbackURL: appUrl(),
    });
    if (error) throw new Error(error.message || 'Could not start sign-in');
    await new Promise(() => {});
  },

  async logout() {
    if (isMock) {
      mockSignedIn = false;
      return;
    }
    const client = await getClient();
    const { error } = await client.auth.signOut();
    if (error) console.error('Sign-out error', error);
  },

  async checkAuth() {
    if (isMock) {
      if (mockSignedIn) return;
      throw { redirectTo: '/login', message: false };
    }
    const client = await getClient();
    const { data, error } = await client.auth.getSession();
    if (error) console.error('Session check failed', error);
    if (!data?.session) throw { redirectTo: '/login', message: false };
  },

  // 401: the session is gone, sign in again. 403: signed in but not on the allow-list.
  async checkError(error) {
    const status = error?.status;
    if (status === 401) throw { redirectTo: '/login', message: 'Your session has ended. Please sign in again.' };
    if (status === 403) throw { logoutUser: false, redirectTo: '/not-authorised', message: false };
  },

  async getIdentity() {
    if (isMock) {
      const { mockUser } = await getMock();
      return { id: mockUser.id, fullName: mockUser.name, email: mockUser.email };
    }
    const client = await getClient();
    const { data } = await client.auth.getSession();
    const user = data?.user;
    if (!user) throw new Error('No session');
    return { id: user.id, fullName: user.name || user.email, email: user.email };
  },

  async getPermissions() {
    return null;
  },
};
