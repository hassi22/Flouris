import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

/**
 * Password gate shown when the selected database has passwordProtected=true
 * and the session has not yet verified the password.
 *
 * Props:
 *   dbPath       – path to the protected database
 *   dbName       – display name
 *   onUnlocked   – callback() called after successful verification
 *   onCancel     – callback() to go back to database selection
 */
export default function Login({ dbPath, dbName, onUnlocked, onCancel }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [password,  setPassword]  = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [checking,  setChecking]  = useState(false);
  const [error,     setError]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) { setError(isUrdu ? 'پاس ورڈ درج کریں' : 'Enter password'); return; }
    setChecking(true);
    setError('');
    try {
      const res = await api.verifyPassword({ dbPath, password });
      if (res.success) {
        onUnlocked?.();
      } else {
        setError(res.error || (isUrdu ? 'پاس ورڈ غلط ہے' : 'Incorrect password'));
        setPassword('');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div dir={dir} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--card-bg, #fff)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '36px 40px',
        width: 360,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--accent-muted, #e8f4fd)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <Lock size={26} style={{ color: 'var(--accent, #1a7fd4)' }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {isUrdu ? 'ڈیٹا بیس لاک ہے' : 'Database Locked'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
            <strong>{dbName}</strong>
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
            {isUrdu ? 'جاری رکھنے کے لیے پاس ورڈ درج کریں' : 'Enter the password to continue'}
          </p>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="field-group" style={{ marginBottom: 18 }}>
          <label>{isUrdu ? 'پاس ورڈ' : 'Password'}</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              className="input-field"
              style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box' }}
              value={password}
              autoFocus
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder={isUrdu ? 'پاس ورڈ…' : 'Password…'}
            />
            <button
              type="button"
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
              onClick={() => setShowPw(v => !v)}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={onCancel}
            disabled={checking}
          >
            {isUrdu ? 'واپس' : 'Back'}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flex: 2 }}
            disabled={checking || !password}
          >
            <Lock size={13} />
            {checking ? '…' : (isUrdu ? 'کھولیں' : 'Unlock')}
          </button>
        </div>
      </form>
    </div>
  );
}
