import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './pages/Login';
import FieldDashboard from './pages/FieldDashboard';
import Confirmation from './pages/Confirmation';
import AdminDashboard from './pages/AdminDashboard';
import { Camera, ShieldAlert, LogOut, ShieldCheck, Loader } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  
  // Navigation: 'field', 'admin', 'confirmation', 'login'
  const [currentPage, setCurrentPage] = useState('field');
  const [navState, setNavState] = useState(null);

  // Monitor Supabase Auth Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setProfileLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId) => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.warn('Profile fetch failed, retrying in 1.2s...', error);
        setTimeout(async () => {
          const { data: retryData, error: retryError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
          if (!retryError) setProfile(retryData);
        }, 1200);
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAuthSuccess = (newSession) => {
    setSession(newSession);
    if (newSession) {
      fetchUserProfile(newSession.user.id);
      // Automatically switch to admin panel on login success
      setCurrentPage('admin');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setCurrentPage('field');
  };

  const handleNavigate = (page, stateData = null) => {
    setCurrentPage(page);
    setNavState(stateData);
  };

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const isAuthorized = isAdmin || isManager;

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', paddingBottom: isAuthorized ? '64px' : '0' }}>
      
      {/* Top Header Navigation Panel */}
      <header className="no-print" style={{
        background: 'hsl(var(--bg-card) / 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid hsl(var(--border-color))',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Brand logo in top left */}
        <div 
          onClick={() => handleNavigate('field')} 
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <img 
            src="/logo.png" 
            alt="Matt Smith Real Estate Group Logo" 
            style={{ height: '36px', width: 'auto', display: 'block' }}
          />
          <span style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'hsl(var(--primary))',
            fontWeight: 700,
            borderLeft: '1px solid hsl(var(--border-color))',
            paddingLeft: '10px',
            marginTop: '2px'
          }}>
            Signs
          </span>
        </div>

        {/* Dynamic header items: Login / Profile / Signout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {session ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'hsl(var(--text-secondary))' }}>
                <ShieldCheck size={14} style={{ color: 'hsl(var(--primary))' }} />
                <span style={{ fontWeight: 600 }}>{profile?.full_name || 'Admin'}</span>
              </div>
              
              <button 
                onClick={handleSignOut} 
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'hsl(var(--danger))',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            currentPage !== 'login' && (
              <button 
                onClick={() => handleNavigate('login')}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ShieldAlert size={14} style={{ color: 'hsl(var(--primary))' }} />
                <span>Admin Login</span>
              </button>
            )
          )}
        </div>
      </header>

      {/* Main Content Router */}
      <main style={{ flexGrow: 1 }}>
        {currentPage === 'field' && (
          <FieldDashboard session={session} onNavigate={handleNavigate} />
        )}
        
        {currentPage === 'admin' && isAuthorized && (
          <AdminDashboard session={session} />
        )}

        {currentPage === 'confirmation' && (
          <Confirmation state={navState} onNavigate={handleNavigate} />
        )}

        {currentPage === 'login' && (
          <Login onAuthSuccess={handleAuthSuccess} />
        )}
      </main>

      {/* Persistent Navigation Tab-Bar for Admins and Managers */}
      {isAuthorized && currentPage !== 'confirmation' && currentPage !== 'login' && (
        <nav className="nav-tab-bar no-print">
          <button 
            onClick={() => handleNavigate('field')}
            className={`nav-tab-item ${currentPage === 'field' ? 'nav-tab-item-active' : ''}`}
          >
            <Camera size={20} />
            <span>Scan Camera</span>
          </button>
          
          <button 
            onClick={() => handleNavigate('admin')}
            className={`nav-tab-item ${currentPage === 'admin' ? 'nav-tab-item-active' : ''}`}
          >
            <ShieldCheck size={20} />
            <span>Admin Panel</span>
          </button>
        </nav>
      )}
    </div>
  );
}
