import { useState } from 'react'

const SEASON_BASE = 110
const MAX_RETAIN  = 3

function retentionCost(overall) {
  if (overall >= 85) return 20
  if (overall >= 80) return 15
  if (overall >= 75) return 12
  return 10
}

const ROLE_COLOR = {
  'opener': '#f59e0b', 'top-order': '#fbbf24', 'middle-order': '#fb923c',
  'wicket-keeper': '#a78bfa', 'all-rounder': '#34d399',
  'pace-bowler': '#ef4444', 'spin-bowler': '#a855f7',
}
const ROLE_SHORT = {
  'opener': 'OPR', 'top-order': 'TOP', 'middle-order': 'MID',
  'wicket-keeper': 'WK', 'all-rounder': 'AR',
  'pace-bowler': 'PAC', 'spin-bowler': 'SPN',
}

function PlayerCard({ player, selected, canSelect, onToggle }) {
  const cost  = retentionCost(player.overall)
  const color = ROLE_COLOR[player.role] || '#64748b'
  const short = ROLE_SHORT[player.role] || '?'
  const dim   = !selected && !canSelect

  return (
    <div
      onClick={() => (selected || canSelect) && onToggle(player.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.55rem 0.875rem',
        background: selected ? color + '18' : 'var(--card)',
        border: `1.5px solid ${selected ? color : dim ? 'var(--border2)' : 'var(--border)'}`,
        borderRadius: '0.625rem',
        cursor: (selected || canSelect) ? 'pointer' : 'not-allowed',
        opacity: dim ? 0.4 : 1,
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: color + '22', border: `1.5px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.48rem', fontWeight: 900, color,
      }}>{short}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name}
        </div>
        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>
          {player.nationality}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0, marginRight: '0.4rem' }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 900, color: selected ? color : 'var(--text)', lineHeight: 1 }}>
          {player.overall}
        </div>
        <div style={{ fontSize: '0.58rem', color: selected ? color : '#64748b', fontWeight: 700 }}>
          ₹{cost}cr
        </div>
      </div>

      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: selected ? color : 'transparent',
        border: `2px solid ${selected ? color : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        {selected && <span style={{ fontSize: '0.62rem', color: '#fff', fontWeight: 900 }}>✓</span>}
      </div>
    </div>
  )
}

export default function RetentionScreen({ team, prevBudgetLeftover, seasonNumber, onConfirm }) {
  const [selected, setSelected] = useState(new Set())

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) }
      else if (next.size < MAX_RETAIN) { next.add(id) }
      return next
    })
  }

  const sorted      = [...team].sort((a, b) => b.overall - a.overall)
  const retained    = team.filter(p => selected.has(p.id))
  const leftover    = prevBudgetLeftover || 0
  const totalCost   = retained.reduce((s, p) => s + retentionCost(p.overall), 0)
  const newBudget   = Math.max(0, SEASON_BASE + leftover - totalCost)
  // Block by name (not ID) — same player from a different era has the same name and should stay blocked
  const releasedIds = new Set(team.filter(p => !selected.has(p.id)).map(p => p.name))
  const slotsLeft   = 11 - retained.length

  return (
    <div style={{
      height: '100vh', overflow: 'hidden', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      padding: '1.5rem 2rem 1.25rem',
      boxSizing: 'border-box', gap: '1rem',
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <div style={{
          display: 'inline-block', padding: '0.2rem 0.85rem',
          background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.3)',
          borderRadius: '999px', color: '#C8102E',
          fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', marginBottom: '0.35rem',
        }}>Season {seasonNumber} Retention Window</div>
        <h2 style={{ fontSize: '1.7rem', fontWeight: 400, color: 'var(--text)', margin: '0 0 0.2rem', letterSpacing: '-0.03em' }}>
          Who Do You Keep?
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.78rem', margin: 0 }}>
          Retain up to <strong style={{ color: 'var(--text)' }}>3 players</strong> · costs come off your Season {seasonNumber} auction budget
        </p>
      </div>

      {/* Two-column body */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid', gridTemplateColumns: '1fr 0.72fr',
        gap: '1.25rem',
      }}>

        {/* LEFT — player list */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--card-border)',
          borderRadius: '1.25rem', padding: '0.875rem 1rem',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '0.75rem', flexShrink: 0,
          }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Your XI — tap to retain
            </span>
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              {Array.from({ length: MAX_RETAIN }).map((_, i) => (
                <div key={i} style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: i < selected.size ? '#C8102E' : 'var(--border2)',
                  border: `1.5px solid ${i < selected.size ? '#C8102E' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }} />
              ))}
              <span style={{ fontSize: '0.68rem', color: '#64748b', marginLeft: '0.2rem', fontWeight: 700 }}>
                {selected.size}/{MAX_RETAIN}
              </span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {sorted.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                selected={selected.has(p.id)}
                canSelect={selected.size < MAX_RETAIN}
                onToggle={toggle}
              />
            ))}
          </div>
        </div>

        {/* RIGHT — budget + guide + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', overflow: 'hidden' }}>

          {/* Budget panel */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--card-border)',
            borderRadius: '1.25rem', padding: '1rem 1.2rem',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
              Season {seasonNumber} Auction Budget
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ color: '#64748b' }}>Base pot</span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>₹{SEASON_BASE}cr</span>
              </div>
              {leftover > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ color: '#22c55e' }}>+ Leftover (S{seasonNumber - 1})</span>
                  <span style={{ fontWeight: 700, color: '#22c55e' }}>+₹{leftover}cr</span>
                </div>
              )}
              {retained.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ color: '#ef4444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    − {p.name.split(' ')[0]}
                  </span>
                  <span style={{ fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>−₹{retentionCost(p.overall)}cr</span>
                </div>
              ))}
              <div style={{ height: 1, background: 'var(--border)', margin: '0.15rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>Available</span>
                <span style={{
                  fontSize: '1.5rem', fontWeight: 900,
                  color: newBudget >= 60 ? '#22c55e' : newBudget >= 30 ? '#f59e0b' : '#ef4444',
                }}>₹{newBudget}cr</span>
              </div>
            </div>
          </div>

          {/* Cost guide */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--card-border)',
            borderRadius: '1.25rem', padding: '0.875rem 1rem',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
              Retention Costs
            </div>
            {[
              { label: 'Rating 85+', cost: 20 },
              { label: 'Rating 80–84', cost: 15 },
              { label: 'Rating 75–79', cost: 12 },
              { label: 'Below 75', cost: 10 },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.25rem' }}>
                <span style={{ color: '#64748b' }}>{row.label}</span>
                <span style={{ fontWeight: 800, color: 'var(--text)' }}>₹{row.cost}cr</span>
              </div>
            ))}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* CTA */}
          <button
            onClick={() => onConfirm({ retained, releasedIds, newBudget })}
            style={{
              width: '100%', padding: '0.9rem',
              background: '#C8102E',
              color: '#fff', border: 'none', borderRadius: '0.875rem',
              fontSize: '0.95rem', fontWeight: 900, cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(200,16,46,0.4)',
              flexShrink: 0,
            }}
          >
            {selected.size === 0
              ? `Release All · Enter Auction →`
              : `Keep ${selected.size} · Fill ${slotsLeft} Slots →`}
          </button>
          {selected.size > 0 && (
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.68rem', margin: '0.25rem 0 0' }}>
              Released players cannot be re-drafted in Season {seasonNumber}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
