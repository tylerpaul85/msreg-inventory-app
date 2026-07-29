import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { LogIn, UserPlus, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function Login({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('manager'); // 'manager' or 'admin'
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isSignUp) {
        if (accessCode.trim() !== '3636') {
          throw new Error('Invalid registration access code. Please obtain the correct code from your administrator.');
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: role,
            },
          },
        });
        
        if (signUpError) throw signUpError;
        
        if (data?.session) {
          onAuthSuccess(data.session);
        } else {
          // Attempt automatic login immediately so the user does not have to check their email
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          
          if (!signInError && signInData?.session) {
            onAuthSuccess(signInData.session);
          } else {
            // Check if email confirmation setting prevents immediate login
            if (signInError && signInError.message.toLowerCase().includes('confirm')) {
              throw new Error('Account created successfully, but Supabase email confirmation is required. Please disable "Confirm email" in your Supabase dashboard Auth provider settings to bypass verification.');
            }
            setMessage('Account created! Attempting to log you in...');
            setIsSignUp(false);
          }
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (signInError) throw signInError;
        if (data?.session) {
          onAuthSuccess(data.session);
        }
      }
    } catch (err) {
      console.error('Authentication error detail:', err);
      let errMsg = 'An authentication error occurred.';
      if (err) {
        if (typeof err === 'string') {
          errMsg = err;
        } else if (err.message) {
          errMsg = typeof err.message === 'string' ? err.message : JSON.stringify(err.message);
        } else {
          errMsg = JSON.stringify(err);
        }
      }

      // Capture common Supabase error cases cleanly
      if (errMsg.includes('fetch failed') || errMsg.includes('ENOTFOUND')) {
        errMsg = 'Network error: Unable to connect to Supabase server. Please verify your network connection and .env settings.';
      } else if (errMsg.includes('Invalid login credentials')) {
        errMsg = 'Invalid email address or password. Please check your credentials and try again.';
      } else if (errMsg.includes('Email not confirmed')) {
        errMsg = 'Account registered, but email confirmation is enabled in your Supabase Auth project. Disable "Confirm email" in Supabase Auth settings to log in immediately without email verification.';
      } else if (errMsg.includes('profiles_role_check') || errMsg.includes('violates check constraint') || errMsg.includes('profiles')) {
        errMsg = 'Database constraint error: The selected role is not recognized by your database schema. Please execute supabase_schema.sql in your Supabase SQL Editor.';
      }
      
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'radial-gradient(circle at top right, hsl(240 4% 100% / 0.03), transparent 45%), radial-gradient(circle at bottom left, hsl(240 4% 20% / 0.2), transparent 45%)'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '32px',
        boxSizing: 'border-box'
      }}>
        {/* Logo block */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img 
            src="/logo.png" 
            alt="Matt Smith Real Estate Group Logo" 
            style={{ width: '220px', height: 'auto', margin: '0 auto 16px auto', display: 'block' }}
          />
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'hsl(var(--text-primary))', letterSpacing: '0.05em' }}>
            ADMINISTRATOR ACCESS
          </h2>
          <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '13px', marginTop: '4px' }}>
            Sign in to manage inventory and view trails
          </p>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'hsl(var(--danger) / 0.12)',
            border: '1px solid hsl(var(--danger) / 0.25)',
            borderRadius: '8px',
            color: 'hsl(var(--danger))',
            fontSize: '14px',
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{
            padding: '12px 16px',
            background: 'hsl(var(--success) / 0.12)',
            border: '1px solid hsl(var(--success) / 0.25)',
            borderRadius: '8px',
            color: 'hsl(var(--success))',
            fontSize: '14px',
            marginBottom: '16px'
          }}>
            {message}
          </div>
        )}

        <form onSubmit={handleAuth}>
          {isSignUp && (
            <div style={{ marginBottom: '16px' }}>
              <label className="form-label" htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                className="form-input"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          {isSignUp && (
            <div style={{ marginBottom: '16px' }}>
              <label className="form-label" htmlFor="accessCode">Registration Code *</label>
              <input
                id="accessCode"
                type="text"
                className="form-input"
                placeholder="Enter registration code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                required
              />
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label className="form-label" htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="admin@msreg.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '20px', position: 'relative' }}>
            <label className="form-label" htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'hsl(var(--text-muted))',
                  cursor: 'pointer'
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {isSignUp && (
            <div style={{ marginBottom: '24px' }}>
              <label className="form-label" htmlFor="role">User Role</label>
              <select
                id="role"
                className="form-input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ appearance: 'none', cursor: 'pointer' }}
              >
                <option value="admin">Administrator</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '14px', fontSize: '15px' }}
          >
            {loading ? (
              'Processing...'
            ) : isSignUp ? (
              <>
                <UserPlus size={18} />
                Create Admin Account
              </>
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          fontSize: '13px',
          color: 'hsl(var(--text-secondary))'
        }}>
          {isSignUp ? (
            <>
              Already have an account?{' '}
              <button
                onClick={() => {
                  setIsSignUp(false);
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'hsl(var(--primary))',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => {
                  setIsSignUp(true);
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'hsl(var(--primary))',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Sign Up
              </button>
            </>
          ) }
        </div>
      </div>
    </div>
  );
}
