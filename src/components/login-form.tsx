'use client';
import { useState, type FormEvent } from 'react';
export default function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Sign-in failed.');
      }
      setPassword(''); window.location.replace('/');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 440, margin: '12vh auto', padding: 24 }}>
    <div className="eyebrow">IDEA LAB · PRIVATE WORKSPACE</div>
    <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, marginBottom: 16 }}>Welcome to Idea Lab.</h1>
    <p className="dialog-intro">Enter the shared workspace password to access research, reports, and settings.</p>
    <form onSubmit={submit}>
      <label htmlFor="access-password">Workspace password</label>
      <input id="access-password" type="password" autoComplete="current-password" required maxLength={1024}
        value={password} onChange={event => setPassword(event.target.value)} />
      {error && <p role="alert" className="notice error" style={{ marginTop: 16 }}>{error}</p>}
      <button type="submit" className="primary-button full-width" style={{ marginTop: 18 }} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  </main>;
}
