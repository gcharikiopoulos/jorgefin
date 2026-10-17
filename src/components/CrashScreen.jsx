// Last-resort error screen: anything that crashes the app shows its message and a
// reload button instead of a blank page.

import { Component } from 'react';

export class CrashScreen extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const reload = async () => {
      // Drop the cached app shell too, in case a stale copy is what failed.
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('finance-shell-')).map((k) => caches.delete(k)));
      } catch { /* no cache access: a plain reload still helps */ }
      window.location.reload();
    };
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 560, margin: '40px auto', color: '#1b1f24' }}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Something went wrong</h1>
        <p style={{ margin: '0 0 16px', color: '#555' }}>The app hit an error while loading. Reload to try again; if it keeps happening, send this message:</p>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f1f2f4', padding: 12, borderRadius: 8, fontSize: 13 }}>
          {String(error?.message || error)}
          {error?.stack ? `\n\n${String(error.stack).split('\n').slice(0, 6).join('\n')}` : ''}
        </pre>
        <button type="button" onClick={reload} style={{ marginTop: 16, font: 'inherit', fontWeight: 600, padding: '10px 18px', border: 0, borderRadius: 8, background: '#2456d6', color: '#fff' }}>
          Reload
        </button>
      </div>
    );
  }
}
