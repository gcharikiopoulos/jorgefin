import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { useLogin } from 'react-admin';
import { isMock } from './backend.js';

// Reads ?error= left by a failed OAuth redirect and removes it from the URL.
function takeOAuthError() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('error');
  if (!code) return '';
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  window.history.replaceState(window.history.state, '', url.href);
  return `Sign-in did not complete (${code}). Please try again.`;
}

const initialError = takeOAuthError();

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginPage() {
  const login = useLogin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      await login({});
    } catch (err) {
      console.error(err);
      setError(navigator.onLine ? 'Could not start sign-in. Please try again.' : 'You are offline.');
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default',
      backgroundImage: (t) => `radial-gradient(circle at 20% 10%, ${t.palette.mode === 'dark' ? 'rgba(91,156,240,0.12)' : 'rgba(42,120,214,0.10)'}, transparent 45%)` }}>
      <Card sx={{ width: '100%', maxWidth: 380 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Box component="img" src="icons/icon.svg" alt="" sx={{ width: 64, height: 64 }} />
            <Box>
              <Typography variant="h5" component="h1">Finance</Typography>
              <Typography color="text.secondary">Your household money at a glance</Typography>
            </Box>
            <Button fullWidth size="large" variant="outlined" onClick={signIn} disabled={busy} startIcon={busy ? <CircularProgress size={18} /> : <GoogleIcon />} sx={{ py: 1.25, fontWeight: 600 }}>
              {isMock ? 'Enter demo' : 'Sign in with Google'}
            </Button>
            {error && <Alert severity="error" sx={{ width: '100%', textAlign: 'left' }}>{error}</Alert>}
            {isMock && <Typography variant="caption" color="text.secondary">Demo mode: invented data, no sign-in.</Typography>}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
