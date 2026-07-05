import React, { useState, useRef, useEffect } from 'react';
import { isFirebaseConfigured } from '../../lib/firebase';
import { useAuthContext } from '../../contexts/AuthContext';
import { useProjectsStore } from '../../store/useProjectsStore';

/** Small inline email/password sign-in form shown in a popover. */
const SignInForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { signIn, error } = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
      onClose();
    } catch {
      /* error surfaced via context */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 p-3 w-60"
    >
      <span className="font-mono text-[11px] uppercase tracking-wider text-ink-600">
        Sign in
      </span>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        autoFocus
        className="bg-ink-100 border border-ink-200 rounded px-2 py-1.5 text-[12px] text-ink-800 outline-none focus:border-ink-400"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="bg-ink-100 border border-ink-200 rounded px-2 py-1.5 text-[12px] text-ink-800 outline-none focus:border-ink-400"
      />
      {error && <span className="text-[12px] text-destructive">{error}</span>}
      <button
        type="submit"
        disabled={submitting || !email || !password}
        className="mt-1 rounded bg-primary hover:bg-primary/85 disabled:opacity-50 text-white text-[12px] py-1.5 cursor-pointer border-0"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
};

/** Account menu shown when signed in. */
const AccountMenu: React.FC<{ email: string; onClose: () => void }> = ({ email, onClose }) => {
  const { signOut } = useAuthContext();
  return (
    <div className="flex flex-col p-2 w-56">
      <span className="px-2 py-1 text-[12px] text-ink-600 truncate" title={email}>
        {email}
      </span>
      <button
        onClick={async () => { await signOut(); onClose(); }}
        className="text-left rounded px-2 py-1.5 text-[12px] text-ink-800 hover:bg-ink-100 cursor-pointer border-0 bg-transparent"
      >
        Sign out
      </button>
    </div>
  );
};

/**
 * TopBar account cluster: a Projects button (when signed in) plus a Sign in /
 * account control. Renders nothing at all when Firebase isn't configured, so
 * logged-out/unconfigured users see no new UI beyond — at most — "Sign in".
 */
export const AuthControls: React.FC = () => {
  const { user, loading } = useAuthContext();
  const setPanelOpen = useProjectsStore(s => s.setPanelOpen);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!isFirebaseConfigured) return null;
  if (loading) return null;

  const initial = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex items-center gap-2">
      {user && (
        <button
          onClick={() => setPanelOpen(true)}
          className="font-mono text-[12px] text-ink-700 hover:text-ink-900 bg-ink-100/60 hover:bg-ink-200/60 px-2 py-0.5 rounded-full cursor-pointer border-0"
          title="Open Projects"
        >
          Projects
        </button>
      )}

      <div ref={wrapRef} className="relative">
        {user ? (
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-[12px] font-semibold cursor-pointer border-0"
            title={user.email ?? 'Account'}
          >
            {initial}
          </button>
        ) : (
          <button
            onClick={() => setOpen(o => !o)}
            className="font-mono text-[12px] text-ink-700 hover:text-ink-900 bg-ink-100/60 hover:bg-ink-200/60 px-2 py-0.5 rounded-full cursor-pointer border-0"
          >
            Sign in
          </button>
        )}

        {open && (
          <div
            className="absolute right-0 top-full mt-1.5 rounded-lg border border-ink-200 shadow-xl z-[60]"
            style={{ background: 'hsl(var(--card))', boxShadow: '0 12px 40px hsl(45 9% 13% / 0.14)' }}
          >
            {user
              ? <AccountMenu email={user.email ?? ''} onClose={() => setOpen(false)} />
              : <SignInForm onClose={() => setOpen(false)} />}
          </div>
        )}
      </div>
    </div>
  );
};
