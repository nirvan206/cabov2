import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';

interface AccountPageProps {
  onBack: () => void;
}

export const AccountPage: React.FC<AccountPageProps> = ({ onBack }) => {
  const { profile, user, signOut, loadProfile } = useAuthStore();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }
    if (trimmed.length > 24) {
      setError('Username must be 24 characters or less');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setError('Only letters, numbers, and underscores allowed');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const { error: dbErr } = await supabase
      .from('profiles')
      .update({ username: trimmed })
      .eq('id', user!.id);

    if (dbErr) {
      setError(dbErr.message.includes('unique') ? 'That username is already taken' : dbErr.message);
    } else {
      await loadProfile();
      setSuccess('✅ Username updated!');
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const googleEmail = user?.email ?? '';
  const googleName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '';

  return (
    <div className="account-screen">
      <div className="account-card animate-fade-in">

        {/* Header */}
        <div className="account-header">
          <button className="account-back" onClick={onBack}>← Back</button>
          <div className="account-title">My Account</div>
        </div>

        {/* Avatar + identity */}
        <div className="account-avatar-row">
          {profile?.avatar_url
            ? <img src={profile.avatar_url} className="account-avatar" alt="avatar" />
            : <div className="account-avatar-placeholder">👤</div>
          }
          <span className="account-google-badge">🔵 Signed in with Google</span>
          {googleName && <span className="account-email">{googleName}</span>}
          <span className="account-email">{googleEmail}</span>
        </div>

        {/* Username */}
        <div className="account-section">
          <div className="account-label">Display Name</div>
          <input
            className="account-input"
            value={username}
            onChange={e => { setUsername(e.target.value); setError(''); setSuccess(''); }}
            placeholder="Choose a username..."
            maxLength={24}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <div className="account-input-hint">
            This is what other players see during the game. Letters, numbers, underscores only.
          </div>
          {error && <div className="account-error">{error}</div>}
          {success && <div className="account-success">{success}</div>}
          <button
            className="btn btn-green w-full"
            onClick={handleSave}
            disabled={saving || username.trim() === profile?.username}
          >
            {saving ? 'Saving…' : 'Save Username'}
          </button>
        </div>

        <div className="account-divider" />

        {/* Sign out */}
        <button className="account-signout" onClick={handleSignOut}>
          Sign Out
        </button>

      </div>
    </div>
  );
};
