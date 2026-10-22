import { useState, useEffect } from 'react'
import { getSupabase } from '../lib/supabase'

// ─── Local fallback pool (used when no DB entry for today) ─────────────────────
const CHALLENGE_POOL = [
  { challenge_type: 'only_imports',   constraint_label: '🌍 Overseas XI',      constraint_desc: 'Your entire squad must be non-Indian (overseas) players.' },
  { challenge_type: 'no_allrounders', constraint_label: '🎯 Specialists Only', constraint_desc: 'No all-rounders allowed — pick pure batsmen and bowlers.' },
  { challenge_type: 'all_pace',       constraint_label: '💨 Pace Attack',      constraint_desc: 'At least 4 pace bowlers, zero spinners.' },
  { challenge_type: 'uncapped',       constraint_label: '🌱 Uncapped Heroes',  constraint_desc: 'Only players with an overall rating of 72 or below.' },
  { challenge_type: 'big_hitters',    constraint_label: '💥 Batting Lineup',   constraint_desc: 'At least 5 openers or middle-order batsmen in your XI.' },
  { challenge_type: 'all_spin',       constraint_label: '🌀 Spin Web',         constraint_desc: 'At least 3 spinners, zero pace bowlers.' },
  { challenge_type: 'only_indians',   constraint_label: '🇮🇳 Desi XI',        constraint_desc: 'All 11 players must be Indian.' },
]

function getDailyFallback(dateStr) {
  let hash = 0
  for (const ch of dateStr) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff
  const c = CHALLENGE_POOL[hash % CHALLENGE_POOL.length]
  return { id: `local-${dateStr}`, date: dateStr, ...c }
}

// ─── Constraint checker ────────────────────────────────────────────────────

// Pass challenge.challenge_type as the first argument
export function checkConstraint(constraintType, team) {
  if (!team || team.length === 0) return { ok: true, reason: '' }
  switch (constraintType) {
    case 'only_imports':
      return team.every(p => p.nationality !== 'India')
        ? { ok: true }
        : { ok: false, reason: 'All players must be non-Indian (overseas)' }
    case 'no_allrounders':
      return !team.some(p => p.role === 'all-rounder')
        ? { ok: true }
        : { ok: false, reason: 'No all-rounders allowed' }
    case 'all_pace':
      return team.filter(p => p.role === 'spin-bowler').length === 0 &&
             team.filter(p => p.role === 'pace-bowler').length >= 4
        ? { ok: true }
        : { ok: false, reason: 'At least 4 pace bowlers, zero spinners' }
    case 'uncapped':
      return team.every(p => (p.overall || 75) <= 72)
        ? { ok: true }
        : { ok: false, reason: 'Only players with overall ≤ 72' }
    case 'big_hitters':
      return team.filter(p => ['opener','middle-order'].includes(p.role)).length >= 5
        ? { ok: true }
        : { ok: false, reason: 'At least 5 openers or middle-order batsmen' }
    case 'all_spin':
      return team.filter(p => p.role === 'pace-bowler').length === 0 &&
             team.filter(p => p.role === 'spin-bowler').length >= 3
        ? { ok: true }
        : { ok: false, reason: 'At least 3 spinners, zero pace bowlers' }
    case 'only_indians':
      return team.every(p => p.nationality === 'India')
        ? { ok: true }
        : { ok: false, reason: 'All players must be Indian' }
    default:
      return { ok: true }
  }
}

// ─── Score calculation ─────────────────────────────────────────────────────

export function calcChallengeScore(wins, losses, perfect) {
  return wins * 100 + (perfect ? 500 : 0) - losses * 10
}

// ─── Leaderboard row ───────────────────────────────────────────────────────

function LeaderRow({ rank, entry }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.6rem 0.875rem',
      background: rank <= 3 ? 'rgba(200,16,46,0.06)' : '#080d1f',
      border: `1px solid ${rank <= 3 ? '#C8102E33' : '#1a2550'}`,
      borderRadius: '0.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ width: 20, textAlign: 'center', fontSize: '0.9rem' }}>
          {medal ?? <span style={{ fontSize: '0.7rem', color: '#334155' }}>#{rank}</span>}
        </span>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f1f5f9' }}>
            {entry.display_name || entry.email?.split('@')[0] || 'Anonymous'}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#475569' }}>
            {entry.wins}W · {entry.losses}L{entry.perfect ? ' · ✨ Perfect' : ''}
          </div>
        </div>
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#C8102E' }}>
        {entry.score.toLocaleString()}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function DailyChallenge({ user, onClose, onPlay }) {
  const [challenge, setChallenge] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [myResult, setMyResult]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  useEffect(() => {
    async function load() {
      const sb = await getSupabase()
      if (!sb) { setError('Not connected'); setLoading(false); return }

      // Get today's challenge
      const today = new Date().toISOString().slice(0, 10)
      const { data: ch } = await sb
        .from('daily_challenges')
        .select('*')
        .eq('date', today)
        .maybeSingle()

      if (!ch) {
        // Fall back to deterministic local challenge so there's always something to play
        setChallenge(getDailyFallback(today))
        setLoading(false)
        return
      }
      setChallenge(ch)

      // Get leaderboard (top 20, joined with profiles for display names)
      const { data: results } = await sb
        .from('daily_results')
        .select('*, profiles(display_name, email:id)')
        .eq('challenge_id', ch.id)
        .order('score', { ascending: false })
        .limit(20)
      setLeaderboard(results || [])

      // Check if user already played
      if (user) {
        const mine = results?.find(r => r.user_id === user.id)
        setMyResult(mine || null)
      }

      setLoading(false)
    }
    load()
  }, [user])

  const alreadyPlayed = !!myResult

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1500,
      background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)',
      overflowY: 'auto', animation: 'fade-in 0.2s ease both',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

        <button
          onClick={onClose}
          style={{ background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E', fontSize: '0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em', marginBottom: '1rem' }}
        >← Back</button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗓️</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f1f5f9' }}>Daily Challenge</div>
          <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: '#475569', paddingTop: '3rem' }}>Loading today's challenge…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', color: '#64748b', paddingTop: '3rem', fontSize: '0.9rem' }}>{error}</div>
        ) : (
          <>
            {/* Challenge card */}
            <div style={{
              background: '#1a0508', border: '1px solid #C8102E44',
              borderRadius: '1rem', padding: '1.25rem',
              marginBottom: '1.25rem',
              boxShadow: '0 0 30px rgba(200,16,46,0.1)',
            }}>
              <div style={{ fontSize: '0.6rem', color: '#C8102E', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
                Today's Restriction
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f1f5f9', marginBottom: '0.3rem' }}>
                {challenge.constraint_label}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                {challenge.constraint_desc}
              </div>

              {/* Scoring */}
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#060818', borderRadius: '0.5rem', fontSize: '0.72rem', color: '#475569' }}>
                <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: '0.25rem' }}>Scoring</div>
                +100 pts per win  ·  −10 pts per loss  ·  +500 pts for perfect season
              </div>
            </div>

            {/* My result if already played */}
            {alreadyPlayed && (
              <div style={{
                background: '#1a0508', border: '1px solid #22c55e33',
                borderRadius: '0.75rem', padding: '1rem 1.25rem',
                marginBottom: '1.25rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Your score today</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#C8102E' }}>{myResult.score.toLocaleString()}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.2rem' }}>
                  {myResult.wins}W · {myResult.losses}L{myResult.perfect ? ' · ✨ Perfect' : ''}
                </div>
              </div>
            )}

            {/* Play button */}
            {!alreadyPlayed && (
              <button
                onClick={() => onPlay(challenge)}
                style={{
                  width: '100%', padding: '1rem',
                  background: '#C8102E',
                  border: 'none', borderRadius: '0.75rem',
                  color: '#fff', fontSize: '1rem', fontWeight: 800,
                  cursor: 'pointer', marginBottom: '1.25rem',
                  boxShadow: '0 4px 20px rgba(200,16,46,0.35)',
                }}
              >
                Play Today's Challenge →
              </button>
            )}

            {/* Leaderboard */}
            <div>
              <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
                Leaderboard
              </div>
              {leaderboard.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#334155', fontSize: '0.85rem' }}>
                  No entries yet — be the first to play!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {leaderboard.map((entry, i) => (
                    <LeaderRow key={entry.id} rank={i + 1} entry={{
                      ...entry,
                      display_name: entry.profiles?.display_name,
                      email: user?.email,
                    }} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
