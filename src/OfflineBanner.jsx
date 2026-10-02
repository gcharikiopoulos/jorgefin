import { useEffect, useState } from 'react';
import { Alert } from '@mui/material';

// Shown while the browser is offline; the cached shell keeps working.
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (online) return null;
  return <Alert severity="warning" sx={{ mt: 1, borderRadius: 2 }}>You are offline. Data will load when you reconnect.</Alert>;
}
