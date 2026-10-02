import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/LockOutlined';
import { useAuthProvider, useLogout } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { checkAccess } from './backend.js';

export function NotAuthorised() {
  const authProvider = useAuthProvider();
  const logout = useLogout();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Re-check on arrival, so a stale redirect heals itself instead of stranding the user.
  useEffect(() => {
    let cancelled = false;
    checkAccess().then((access) => {
      if (cancelled) return;
      if (access === 'allowed') navigate('/', { replace: true });
      else if (access === 'signed-out') navigate('/login', { replace: true });
      else setConfirmed(true);
    });
    authProvider.getIdentity().then((id) => !cancelled && setEmail(id.email || '')).catch(() => {});
    return () => { cancelled = true; };
  }, [authProvider, navigate]);

  if (!confirmed) return null;

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={2.5} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <LockIcon color="warning" sx={{ fontSize: 48 }} />
            <Typography variant="h5" component="h1">This account is not authorised</Typography>
            <Typography color="text.secondary">
              You are signed in as <strong>{email || 'this account'}</strong>, but this account has no access to the data.
            </Typography>
            <Button variant="contained" onClick={() => logout()}>Sign out</Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
