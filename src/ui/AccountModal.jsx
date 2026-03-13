import React, { useState, useEffect } from 'react';
import { FaEye, FaEyeSlash, FaTimes } from 'react-icons/fa';
import { supabase } from '../services/supabaseClient';

// ── AccountModal ────────────────────────────────────────────────────────────
export function AccountModal({ onClose, onLogin, onLogout, currentUser = null }) {
  // If user is already logged in, go straight to profile view
  const [view, setView]                       = useState(currentUser ? 'profile' : 'login');
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleRegisterSuccess = (email) => {
    setRegisteredEmail(email);
    setView('success');
  };

  return (
    <div className="am-overlay" onClick={onClose}>
      <div className="am-modal" onClick={(e) => e.stopPropagation()}>
        {view === 'profile' && currentUser && (
          <ProfileView
            user={currentUser}
            onLogout={onLogout}
            onClose={onClose}
          />
        )}
        {view === 'login' && (
          <LoginView
            onClose={onClose}
            onLogin={onLogin}
            prefillEmail={registeredEmail}
            onSwitch={() => setView('register')}
          />
        )}
        {view === 'register' && (
          <RegisterView
            onRegisterSuccess={handleRegisterSuccess}
            onSwitch={() => setView('login')}
          />
        )}
        {view === 'success' && (
          <SuccessView
            email={registeredEmail}
            onDone={() => setView('login')}
          />
        )}
      </div>
    </div>
  );
}

// ── Profile View ───────────────────────────────────────────────────────────
// Shown when the user is already logged in.
function ProfileView({ user, onLogout, onClose }) {
  const initial = user.username.charAt(0).toUpperCase();

  return (
    <>
      {/* Avatar + name */}
      <div className="am-header">
        <div className="am-profile-avatar">{initial}</div>
        <h2 className="am-title">{user.username}</h2>
        <p className="am-subtitle">{user.email}</p>
      </div>

      {/* Stats row */}
      <div className="am-profile-stats">
        <div className="am-profile-stat">
          <span className="am-profile-stat__value">{user.highScore ?? 0}</span>
          <span className="am-profile-stat__label">High Score</span>
        </div>
        <div className="am-profile-stat__divider" />
        <div className="am-profile-stat">
          <span className="am-profile-stat__value">{user.audioRecords?.length ?? 0}</span>
          <span className="am-profile-stat__label">Recordings</span>
        </div>
      </div>

      {/* Actions */}
      <button
        type="button"
        className="am-cta am-cta--logout"
        onClick={onLogout}
      >
        Log Out
      </button>

      <button type="button" className="am-close-btn" onClick={onClose} aria-label="Close">
        <FaTimes />
      </button>
    </>
  );
}

// ── Success View ────────────────────────────────────────────────────────────
// Shown for 2.2 s after a successful registration, then auto-switches to login.
const SUCCESS_MS = 2200;

function SuccessView({ email, onDone }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Drive the progress bar
    const interval = 16;
    const step = (interval / SUCCESS_MS) * 100;
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p + step >= 100) { clearInterval(timer); return 100; }
        return p + step;
      });
    }, interval);

    // Switch to login when done
    const timeout = setTimeout(onDone, SUCCESS_MS);
    return () => { clearInterval(timer); clearTimeout(timeout); };
  }, [onDone]);

  return (
    <div className="am-success">
      <div className="am-success__circle">
        <svg viewBox="0 0 52 52" className="am-success__svg" aria-hidden="true">
          <circle cx="26" cy="26" r="24" fill="none" className="am-success__ring" />
          <path d="M14 26l8 8 16-16" fill="none" className="am-success__check" />
        </svg>
      </div>
      <h2 className="am-title" style={{ marginTop: 8 }}>Account Created!</h2>
      <p className="am-subtitle">
        Welcome to Rebeat,&nbsp;
        <strong style={{ color: '#c084fc' }}>{email.split('@')[0]}</strong>!
      </p>
      <p className="am-success__hint">Signing you in…</p>
      {/* Progress bar */}
      <div className="am-success__bar-track">
        <div className="am-success__bar-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

// ── Login View ──────────────────────────────────────────────────────────────
function LoginView({ onClose, onLogin, onSwitch, prefillEmail = '' }) {
  const [email, setEmail]       = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) { setError('Email is required.'); return; }
    if (!password)     { setError('Password is required.'); return; }

    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (authError) { setError(authError.message); return; }

    const sbUser = data.user;
    onLogin({
      authId:      sbUser.id, // Supabase auth ID
      email:       sbUser.email,
      username:    sbUser.user_metadata?.username ?? sbUser.email.split('@')[0],
      highScore:   0,
      audioRecords: [],
    });
    onClose();
  };

  return (
    <>
      {/* Header */}
      <div className="am-header">
        <h2 className="am-title">Welcome To Rebeat</h2>
        <p className="am-subtitle">Sign in to save your scores and recordings</p>
      </div>

      {/* Form */}
      <form className="am-form" onSubmit={handleSubmit} noValidate>
        <div className="am-field">
          <label className="am-label" htmlFor="am-email">Email</label>
          <input
            id="am-email"
            className="am-input"
            type="email"
            placeholder="you@email.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="am-field">
          <label className="am-label" htmlFor="am-password">Password</label>
          <div className="am-input-wrap">
            <input
              id="am-password"
              className="am-input"
              type={showPw ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="am-show-pw"
              onClick={() => setShowPw((p) => !p)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        </div>

        {error && <p className="am-error">{error}</p>}

        <button type="submit" className="am-cta" disabled={loading}>
          {loading ? 'Signing in…' : 'Login'}
        </button>
      </form>

      {/* Footer toggle */}
      <p className="am-footer">
        Don&apos;t have an account?{' '}
        <button type="button" className="am-link" onClick={onSwitch}>Register</button>
      </p>
    </>
  );
}

// ── Register View ───────────────────────────────────────────────────────────
function RegisterView({ onRegisterSuccess, onSwitch }) {
  const [email, setEmail]        = useState('');
  const [username, setUsername]  = useState('');
  const [password, setPassword]  = useState('');
  const [confirm, setConfirm]    = useState('');
  const [showPw, setShowPw]      = useState(false);
  const [error, setError]        = useState('');
  const [loading, setLoading]    = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email.trim())        { setError('Email is required.'); return; }
    if (!emailRegex.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (!username.trim())      { setError('Username is required.'); return; }
    if (username.length < 3)   { setError('Username must be at least 3 characters.'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)  { setError('Passwords do not match.'); return; }

    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username: username.trim()
        }
      }
    });
    setLoading(false);

    if (authError) { setError(authError.message); return; }

    onRegisterSuccess(email.trim());
  };

  return (
    <>
      {/* Header */}
      <div className="am-header">
        <h2 className="am-title">Create Account</h2>
        <p className="am-subtitle">Join Rebeat and track your progress</p>
      </div>

      {/* Form */}
      <form className="am-form" onSubmit={handleSubmit} noValidate>
        <div className="am-field">
          <label className="am-label" htmlFor="am-reg-username">Username</label>
          <input
            id="am-reg-username"
            className="am-input"
            type="text"
            placeholder="Choose a username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="am-field">
          <label className="am-label" htmlFor="am-reg-email">Email</label>
          <input
            id="am-reg-email"
            className="am-input"
            type="email"
            placeholder="you@email.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="am-field">
          <label className="am-label" htmlFor="am-reg-password">Password</label>
          <div className="am-input-wrap">
            <input
              id="am-reg-password"
              className="am-input"
              type={showPw ? 'text' : 'password'}
              placeholder="Min. 6 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="am-show-pw"
              onClick={() => setShowPw((p) => !p)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        </div>

        <div className="am-field">
          <label className="am-label" htmlFor="am-reg-confirm">Confirm Password</label>
          <input
            id="am-reg-confirm"
            className="am-input"
            type={showPw ? 'text' : 'password'}
            placeholder="Re-enter password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="am-error">{error}</p>}

        <button type="submit" className="am-cta" disabled={loading}>
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      {/* Footer toggle */}
      <p className="am-footer">
        Already have an account?{' '}
        <button type="button" className="am-link" onClick={onSwitch}>Login</button>
      </p>
    </>
  );
}
