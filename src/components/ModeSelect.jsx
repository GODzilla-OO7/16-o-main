import { useState, useEffect } from 'react'
import { fetchTotalPlays, subscribeToPlays } from '../hooks/useAuth.js'

const PLAY_COUNT_OFFSET = 103

function formatCount(n) {
  if (n == null) return null
  const total = n + PLAY_COUNT_OFFSET
  if (total >= 1000) return (total / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(total)
}

export default function ModeSelect({
  onSelect, onSeason, onH2H, onDailyChallenge, onWeeklyCup, onFriendsCup, onLiveCup,
  user, onSignIn, onGoogleSignIn, onAccount, onMedals,
  newAwards = [], streak = 0, streakBonus = 0,
}) {
  const [totalPlays, setTotalPlays] = useState(null)
  const [showHowToPlay, setShowHowToPlay] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    fetchTotalPlays().then(n => { if (n != null) setTotalPlays(n) })
    const unsub = subscribeToPlays(n => { if (n != null) setTotalPlays(n) })
    const poll = setInterval(() => {
      fetchTotalPlays().then(n => { if (n != null) setTotalPlays(n) })
    }, 8000)
    return () => { unsub(); clearInterval(poll) }
  }, [])

  const RED = '#C8102E'
  const RED_HOV = '#a50d24'
  // Per-mode colour identities
  const IPL_CLR  = { bg: 'rgba(180,110,0,0.18)',    border: 'rgba(245,158,11,0.45)',  borderHov: 'rgba(245,158,11,0.75)',  glowHov: 'rgba(245,158,11,0.15)',  btn: '#d97706', btnHov: '#b45309', title: '#fbbf24', sub: 'rgba(251,191,36,0.6)' }
  const ODI_CLR  = { bg: 'rgba(14,60,160,0.20)',    border: 'rgba(59,130,246,0.40)',  borderHov: 'rgba(59,130,246,0.75)',  glowHov: 'rgba(59,130,246,0.15)',  btn: '#1d4ed8', btnHov: '#1e40af', title: '#93c5fd', sub: 'rgba(147,197,253,0.6)' }
  const T20_CLR  = { bg: 'rgba(80,20,160,0.20)',    border: 'rgba(139,92,246,0.40)',  borderHov: 'rgba(139,92,246,0.75)', glowHov: 'rgba(139,92,246,0.15)',  btn: '#7c3aed', btnHov: '#6d28d9', title: '#c4b5fd', sub: 'rgba(196,181,253,0.6)' }

  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'inherit',
    }}>

      {/* ── Stadium background ───────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'url(/stadium.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        pointerEvents: 'none',
      }} />
      {/* Dark overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        background: 'linear-gradient(160deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.80) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 0.75rem' : '0 2rem',
        height: 58,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Left: logo + name + how to play */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/logo.png" alt="16-0" style={{ height: 32, width: 32, objectFit: 'contain' }} />
          <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>16-0</span>
          <button
            onClick={() => setShowHowToPlay(true)}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '999px', color: 'rgba(255,255,255,0.75)',
              fontSize: isMobile ? '0.8rem' : '0.72rem', fontWeight: 700,
              letterSpacing: isMobile ? 0 : '0.08em',
              textTransform: 'uppercase',
              padding: isMobile ? '0.25rem 0.6rem' : '0.25rem 0.7rem',
              cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
          >
            {isMobile ? '?' : 'How to Play'}
          </button>
        </div>

        {/* Right: nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <span style={{
            fontSize: '0.82rem', fontWeight: 800, color: '#fff',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            borderBottom: '2px solid #fff', paddingBottom: '2px',
          }}>Home</span>
          <button
            onClick={user ? onAccount : onMedals}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: '0.82rem', fontWeight: 700,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >
            My Stats
            {newAwards.length > 0 && (
              <span style={{
                background: '#f59e0b', color: '#000', borderRadius: '999px',
                fontSize: '0.55rem', fontWeight: 900, padding: '0.1rem 0.35rem',
              }}>
                {newAwards.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ── Sign-in banner (logged-out only) ────────────────────────────── */}
      {!user && (
        <div style={{
          position: 'relative', zIndex: 10,
          background: 'rgba(8,8,14,0.75)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          padding: '0.625rem 1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        }}>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
            Log in to save medals & stats — progress is lost when you close the tab.
          </div>
          <button
            onClick={onGoogleSignIn}
            style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 0.875rem',
              background: '#fff', color: '#1a1a1a',
              border: 'none', borderRadius: '0.5rem',
              fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
            Sign in with Google
          </button>
        </div>
      )}

      {/* ── Main hero ───────────────────────────────────────────────────── */}
      <main style={{
        position: 'relative', zIndex: 5,
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '2.5rem 1.5rem 2rem',
      }}>

        {/* Logo */}
        <img
          src="/logo.png"
          alt="16-0"
          style={{ height: 76, width: 76, objectFit: 'contain', marginBottom: '1.25rem' }}
        />

        {/* Headline */}
        <h1 style={{
          fontStyle: 'italic',
          fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)',
          fontWeight: 900,
          color: '#fff',
          lineHeight: 1.1,
          textAlign: 'center',
          margin: '0 0 0.5rem',
        }}>
          Can you go <span style={{ color: RED }}>16-0?</span>
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(0.85rem, 1.5vw, 1rem)',
          color: 'rgba(255,255,255,0.65)',
          textAlign: 'center',
          margin: '0 0 1.1rem',
        }}>
          How do you want to build your all-time XI?
        </p>

        {/* Live counter */}
        {totalPlays != null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '1.1rem',
            fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#22c55e', display: 'inline-block',
              boxShadow: '0 0 6px #22c55e', flexShrink: 0,
            }} />
            <span>
              <span style={{ color: '#fff', fontWeight: 800 }}>{formatCount(totalPlays)}</span>
              {' '}seasons played globally
            </span>
          </div>
        )}

        {/* CHOOSE YOUR MODE label */}
        <div style={{ marginBottom: '1.75rem', textAlign: 'center' }}>
          <span style={{
            fontSize: '0.72rem', fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: RED,
            borderBottom: `2px solid ${RED}`,
            paddingBottom: '3px',
          }}>
            Choose Your Mode
          </span>
        </div>

        {/* ── 3 Mode cards ──────────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? '0.75rem' : '1.25rem',
          width: '100%', maxWidth: 960,
          marginBottom: '1.25rem',
        }}>

          {/* IPL — amber/gold identity */}
          <div
            style={{
              background: 'rgba(18,10,0,0.82)',
              border: '1.5px solid rgba(245,158,11,0.38)',
              borderRadius: '1rem',
              padding: isMobile ? '0.75rem 1.25rem' : '1.6rem 1.25rem 1.2rem',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              display: 'flex',
              flexDirection: isMobile ? 'row' : 'column',
              alignItems: 'center',
              gap: isMobile ? '0.75rem' : '0.5rem',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              cursor: 'default',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(245,158,11,0.70)'
              e.currentTarget.style.boxShadow = '0 0 32px rgba(245,158,11,0.10)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(245,158,11,0.38)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{ fontSize: isMobile ? '1.75rem' : '2.6rem', lineHeight: 1, marginBottom: isMobile ? 0 : '0.2rem', flexShrink: 0 }}>🏆</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'center', gap: '0.3rem' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f59e0b', textAlign: isMobile ? 'left' : 'center' }}>IPL</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.58)', textAlign: isMobile ? 'left' : 'center', lineHeight: 1.55 }}>
                Draft with full player stats across all IPL eras.
              </div>
            </div>
            <button
              onClick={() => onSelect('ipl')}
              style={{
                marginTop: isMobile ? 0 : '0.5rem',
                width: isMobile ? 'auto' : '100%',
                flexShrink: 0,
                padding: isMobile ? '0.5rem 0.9rem' : '0.55rem 0',
                background: '#d97706', border: 'none',
                borderRadius: '999px',
                color: '#1a0a00', fontSize: '0.78rem', fontWeight: 800,
                cursor: 'pointer', letterSpacing: '0.05em',
                transition: 'background 0.15s, transform 0.1s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#b45309'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#d97706'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              PLAY IPL
            </button>
          </div>

          {/* ODI WC — blue identity */}
          <div
            style={{
              background: 'rgba(5,10,28,0.82)',
              border: '1.5px solid rgba(59,130,246,0.38)',
              borderRadius: '1rem',
              padding: isMobile ? '0.75rem 1.25rem' : '1.6rem 1.25rem 1.2rem',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              display: 'flex',
              flexDirection: isMobile ? 'row' : 'column',
              alignItems: 'center',
              gap: isMobile ? '0.75rem' : '0.5rem',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              cursor: 'default',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.70)'
              e.currentTarget.style.boxShadow = '0 0 32px rgba(59,130,246,0.10)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.38)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{ fontSize: isMobile ? '1.75rem' : '2.6rem', lineHeight: 1, marginBottom: isMobile ? 0 : '0.2rem', flexShrink: 0 }}>🌍</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'center', gap: '0.3rem' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#93c5fd', textAlign: isMobile ? 'left' : 'center' }}>ODI WC</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.58)', textAlign: isMobile ? 'left' : 'center', lineHeight: 1.55 }}>
                Build the greatest ODI World Cup XI of all time.
              </div>
            </div>
            <button
              onClick={() => onSelect('odi-wc')}
              style={{
                marginTop: isMobile ? 0 : '0.5rem',
                width: isMobile ? 'auto' : '100%',
                flexShrink: 0,
                padding: isMobile ? '0.5rem 0.9rem' : '0.55rem 0',
                background: '#1d4ed8', border: 'none',
                borderRadius: '999px',
                color: '#fff', fontSize: '0.78rem', fontWeight: 800,
                cursor: 'pointer', letterSpacing: '0.05em',
                transition: 'background 0.15s, transform 0.1s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1e40af'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1d4ed8'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              PLAY ODI WC
            </button>
          </div>

          {/* T20 WC — purple identity */}
          <div
            style={{
              background: 'rgba(10,5,22,0.82)',
              border: '1.5px solid rgba(139,92,246,0.38)',
              borderRadius: '1rem',
              padding: isMobile ? '0.75rem 1.25rem' : '1.6rem 1.25rem 1.2rem',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              display: 'flex',
              flexDirection: isMobile ? 'row' : 'column',
              alignItems: 'center',
              gap: isMobile ? '0.75rem' : '0.5rem',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              cursor: 'default',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(139,92,246,0.70)'
              e.currentTarget.style.boxShadow = '0 0 32px rgba(139,92,246,0.10)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(139,92,246,0.38)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{ fontSize: isMobile ? '1.75rem' : '2.6rem', lineHeight: 1, marginBottom: isMobile ? 0 : '0.2rem', flexShrink: 0 }}>⚡</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'center', gap: '0.3rem' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#c4b5fd', textAlign: isMobile ? 'left' : 'center' }}>T20 WC</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.58)', textAlign: isMobile ? 'left' : 'center', lineHeight: 1.55 }}>
                Pick your nation's finest T20 internationals across every edition.
              </div>
            </div>
            <button
              onClick={() => onSelect('t20-wc')}
              style={{
                marginTop: isMobile ? 0 : '0.5rem',
                width: isMobile ? 'auto' : '100%',
                flexShrink: 0,
                padding: isMobile ? '0.5rem 0.9rem' : '0.55rem 0',
                background: '#7c3aed', border: 'none',
                borderRadius: '999px',
                color: '#fff', fontSize: '0.78rem', fontWeight: 800,
                cursor: 'pointer', letterSpacing: '0.05em',
                transition: 'background 0.15s, transform 0.1s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#6d28d9'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#7c3aed'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              PLAY T20 WC
            </button>
          </div>
        </div>

        {/* ── 4 secondary mode buttons ──────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isMobile ? '0.625rem' : '1.25rem',
          width: '100%', maxWidth: 960,
          marginBottom: '1.25rem',
        }}>
          {[
            { icon: '📅', label: 'Daily Challenge', onClick: onDailyChallenge },
            { icon: '🏅', label: 'Weekly Cup',       onClick: onWeeklyCup },
            { icon: '👥', label: 'Friends Cup',      onClick: onFriendsCup },
            { icon: '⚡', label: 'Live Friends Cup', onClick: onLiveCup },
          ].map(({ icon, label, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              style={{
                background: 'rgba(8,8,14,0.72)',
                border: '1.5px solid rgba(255,255,255,0.13)',
                borderRadius: '0.875rem',
                padding: isMobile ? '1.2rem 0.5rem' : '1.4rem 1rem',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '0.55rem',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                width: '100%',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(200,16,46,0.45)'
                e.currentTarget.style.boxShadow = '0 0 24px rgba(200,16,46,0.1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <span style={{ fontSize: isMobile ? '2.1rem' : '2.25rem', lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: isMobile ? '0.68rem' : '0.72rem', fontWeight: 500, letterSpacing: '0.03em', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* ── Season (career) mode ─────────────────────────────────────── */}
        {onSeason && (
          <button
            onClick={onSeason}
            data-testid="season-mode"
            style={{
              width: '100%', maxWidth: 960, padding: '1rem 1.5rem',
              background: 'linear-gradient(90deg, rgba(217,119,6,0.22), rgba(8,8,14,0.72))',
              border: '1.5px solid rgba(245,158,11,0.45)', borderRadius: '0.875rem',
              color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.85rem',
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '1.9rem', lineHeight: 1 }}>📅</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 900, color: '#f59e0b', fontSize: '1rem' }}>SEASON MODE <span style={{ fontSize: '0.65rem', background: '#d97706', color: '#1a0a00', borderRadius: 999, padding: '0.1rem 0.4rem', marginLeft: 4 }}>NEW</span></span>
              <span style={{ display: 'block', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>IPL career: play 14 matches one at a time, win the deciding overs yourself.</span>
            </span>
            <span style={{ fontWeight: 800, fontSize: '0.8rem', color: '#f59e0b' }}>PLAY ›</span>
          </button>
        )}

        {/* ── Multiplayer banner ─────────────────────────────────────────── */}
        <button
          onClick={onH2H}
          style={{
            width: '100%', maxWidth: 960,
            padding: '1rem 1.5rem',
            background: 'rgba(8,8,14,0.72)',
            border: '1.5px solid rgba(255,255,255,0.13)',
            borderRadius: '0.875rem',
            color: '#fff', fontSize: '0.95rem', fontWeight: 800,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '0.625rem',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            letterSpacing: '0.05em',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(200,16,46,0.45)'
            e.currentTarget.style.boxShadow = '0 0 24px rgba(200,16,46,0.1)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>⚔️</span>
          MULTIPLAYER
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0' }}>
            — Draft vs a friend
          </span>
        </button>

        {/* Footer */}
        <p style={{
          marginTop: '1.75rem',
          fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)',
          textAlign: 'center',
        }}>
          Unofficial fan game · Not affiliated with any cricket board or league
        </p>
      </main>

      {/* ── How to Play Modal ────────────────────────────────────────────── */}
      {showHowToPlay && (
        <div
          onClick={() => setShowHowToPlay(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.25rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0e1118', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '1rem', padding: '2rem',
              maxWidth: 480, width: '100%',
              maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.4rem' }}>🏏</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.01em' }}>How to Play</span>
              </div>
              <button
                onClick={() => setShowHowToPlay(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.25rem', cursor: 'pointer', lineHeight: 1 }}
              >✕</button>
            </div>

            {/* Steps */}
            {[
              {
                n: '1', icon: '🎯', title: 'Pick your tournament',
                body: 'IPL, ODI World Cup, or T20 World Cup. Each has a different number of matches to win.',
              },
              {
                n: '2', icon: '⚙️', title: 'Set your XI\'s shape',
                body: 'Choose how many batters, bowlers, and all-rounders you want. Pick a preset or drag the sliders yourself.',
              },
              {
                n: '3', icon: '🎰', title: 'Spin the wheel',
                body: 'Draft your 11 players one by one. Each spin is random — use re-rolls carefully.',
              },
              {
                n: '4', icon: '🤝', title: 'Pick a manager',
                body: 'Your coach shapes the team\'s identity and gives a predicted finish.',
              },
              {
                n: '5', icon: '▶️', title: 'Play the matches',
                body: 'Matches simulate automatically, but Quick Time Events let you make key decisions mid-game.',
              },
              {
                n: '6', icon: '🏆', title: 'Go unbeaten',
                body: 'Win every match, collect medals, and share your season card.',
              },
            ].map(step => (
              <div key={step.n} style={{
                display: 'flex', gap: '1rem', marginBottom: '1.25rem',
                paddingBottom: '1.25rem',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{
                  flexShrink: 0, width: 32, height: 32,
                  borderRadius: '50%', background: 'rgba(200,16,46,0.18)',
                  border: '1px solid rgba(200,16,46,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 900, color: '#C8102E',
                }}>
                  {step.n}
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff', marginBottom: '0.3rem' }}>
                    {step.icon} {step.title}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
                    {step.body}
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => setShowHowToPlay(false)}
              style={{
                width: '100%', marginTop: '0.25rem',
                padding: '0.75rem', background: '#C8102E', color: '#fff',
                border: 'none', borderRadius: '0.625rem',
                fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              Got it — let's play!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
