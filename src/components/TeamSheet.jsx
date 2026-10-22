import { useState, useEffect } from 'react'
import { getPrimeRatings } from '../data/players.js'

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }
function scalePrime(v)   { return Math.max(1, Math.min(99, v)) }

const roleLabel = {
  'opener': 'OPN', 'top-order': 'BAT', 'middle-order': 'BAT',
  'wicket-keeper': 'WK', 'all-rounder': 'ALL',
  'pace-bowler': 'PACE', 'spin-bowler': 'SPIN',
}
const roleColor = {
  'opener': '#C8102E', 'top-order': '#C8102E', 'middle-order': '#a50d24',
  'wicket-keeper': '#f59e0b', 'all-rounder': '#C8102E',
  'pace-bowler': '#ef4444', 'spin-bowler': '#a855f7',
}
const COMP_FULL_LABEL = {
  'opener': 'Opener', 'top-order': 'Top Order', 'wicket-keeper': 'Wicket-keeper',
  'middle-order': 'Middle Order', 'all-rounder': 'All-rounder',
  'pace-bowler': 'Pace Bowler', 'spin-bowler': 'Spin Bowler',
}
const COMP_ORDER = ['opener', 'top-order', 'wicket-keeper', 'middle-order', 'all-rounder', 'pace-bowler', 'spin-bowler']

// Free-positions display order — cosmetic sort only, doesn't affect simulation
const FREE_POS_ROLE_ORDER = {
  'opener': 0, 'top-order': 1, 'middle-order': 2,
  'wicket-keeper': 3, 'all-rounder': 4,
  'spin-bowler': 5, 'pace-bowler': 6,
}

// Zone determines valid reorder range: players can only swap within their zone
const ROLE_ZONE = {
  'opener': 'top', 'top-order': 'top',
  'wicket-keeper': 'middle', 'middle-order': 'middle', 'all-rounder': 'middle',
  'pace-bowler': 'tail', 'spin-bowler': 'tail',
}

function buildCompSlots(composition) {
  if (!composition) return Array(11).fill(null)
  const slots = []
  for (const role of COMP_ORDER) {
    for (let i = 0; i < (composition[role] || 0); i++) slots.push(role)
  }
  return slots
}

// Build 11 fixed slots and assign players to matching role slots
function buildSlottedTeam(players, composition) {
  const compRoles = buildCompSlots(composition)
  const slots = compRoles.map(role => ({ role, player: null }))
  for (const p of players) {
    const i = slots.findIndex(s => s.role === p.role && !s.player)
    if (i >= 0) {
      slots[i].player = p
    } else {
      // Fallback: first empty slot
      const j = slots.findIndex(s => !s.player)
      if (j >= 0) slots[j].player = p
    }
  }
  return slots
}

function canSwap(slots, i, j) {
  const pI = slots[i]?.player
  const pJ = slots[j]?.player
  if (!pI || !pJ) return false
  return (ROLE_ZONE[pI.role] ?? 'middle') === (ROLE_ZONE[pJ.role] ?? 'middle')
}

export default function TeamSheet({
  team, onSimulate, onReorder,
  compact = false, ratingType = 'season', mode = 'ipl', composition = null,
}) {
  const [slots, setSlots] = useState(() => buildSlottedTeam(team, composition))
  const [highlight, setHighlight] = useState(null)

  // Re-initialize when composition resets (new game)
  useEffect(() => {
    setSlots(buildSlottedTeam(team, composition))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composition])

  // Sync when new players are added (during draft)
  useEffect(() => {
    setSlots(prev => {
      const teamIds    = new Set(team.map(p => p.id))
      const prevIds    = new Set(prev.flatMap(s => s.player ? [s.player.id] : []))
      const newPlayers = team.filter(p => !prevIds.has(p.id))
      const removedIds = new Set([...prevIds].filter(id => !teamIds.has(id)))

      if (newPlayers.length === 0 && removedIds.size === 0) return prev

      // Remove dropped players, keep positions of surviving players
      const next = prev.map(s => ({
        ...s,
        player: s.player && removedIds.has(s.player.id) ? null : s.player,
      }))

      // Place new players in their matching role slot
      for (const player of newPlayers) {
        const i = next.findIndex(s => s.role === player.role && !s.player)
        if (i >= 0) {
          next[i] = { ...next[i], player }
        } else {
          const j = next.findIndex(s => !s.player)
          if (j >= 0) next[j] = { ...next[j], player }
        }
      }

      // Free-positions mode (no composition): sort filled slots by role priority
      if (!composition) {
        const filled = next.filter(s => s.player)
          .sort((a, b) => (FREE_POS_ROLE_ORDER[a.player.role] ?? 5) - (FREE_POS_ROLE_ORDER[b.player.role] ?? 5))
        const empty  = next.filter(s => !s.player)
        return [...filled, ...empty]
      }

      return next
    })
  }, [team])

  function move(fromIdx, dir) {
    const toIdx = fromIdx + dir
    setSlots(prev => {
      if (!canSwap(prev, fromIdx, toIdx)) return prev
      const next = prev.map(s => ({ ...s }))
      const temp = next[fromIdx].player
      next[fromIdx] = { ...next[fromIdx], player: next[toIdx].player }
      next[toIdx]   = { ...next[toIdx],   player: temp }
      // Notify parent with new player order (slot order = batting order)
      const ordered = next.map(s => s.player).filter(Boolean)
      onReorder?.(ordered)
      return next
    })
    setHighlight(toIdx)
    setTimeout(() => setHighlight(null), 600)
  }

  const filled        = slots.filter(s => s.player).length
  const total         = slots.length
  const isDone        = filled === total
  const activeSlotIdx = slots.findIndex(s => !s.player)

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--card-border)',
      borderRadius: '1rem', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: compact ? '0.625rem 0.875rem' : '0.875rem 1.1rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontWeight: 800, fontSize: compact ? '0.78rem' : '0.9rem', color: 'var(--text)' }}>
          Your XI
        </span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isDone ? '#C8102E' : '#64748b' }}>
          {filled}/{total}
        </span>
      </div>

      {/* Slots */}
      <div style={{ padding: compact ? '0.35rem' : '0.45rem' }}>
        {slots.map((slot, i) => {
          const { role, player } = slot
          const isActive  = !player && i === activeSlotIdx
          const isHighlit = highlight === i
          const slotColor = roleColor[role] ?? '#64748b'

          const canUp    = isDone && canSwap(slots, i, i - 1)
          const canDown  = isDone && canSwap(slots, i, i + 1)
          const showArrows = isDone && player && (canUp || canDown)

          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center',
                gap: compact ? '0.3rem' : '0.4rem',
                padding: compact ? '0.28rem 0.35rem' : '0.5rem 0.55rem',
                borderRadius: '0.375rem', marginBottom: '2px',
                background: isHighlit
                  ? (roleColor[player?.role] ?? slotColor) + '18'
                  : isActive ? '#ddeaff'
                  : player ? 'var(--border2)' : 'transparent',
                border: `1px solid ${
                  isActive ? '#C8102E44'
                  : isHighlit ? (roleColor[player?.role] ?? slotColor) + '44'
                  : 'transparent'
                }`,
                transition: 'all 0.25s',
              }}
            >
              {/* Role badge */}
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: player
                  ? (roleColor[player.role] ?? '#64748b') + '22'
                  : slotColor + '18',
                border: `1px solid ${player
                  ? (roleColor[player.role] ?? '#64748b') + '44'
                  : slotColor + '33'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.5rem', fontWeight: 900,
                color: player ? (roleColor[player.role] ?? '#64748b') : slotColor,
              }}>
                {player ? (roleLabel[player.role] ?? i + 1) : (roleLabel[role] ?? i + 1)}
              </div>

              {/* Name / placeholder */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {player ? (
                  <>
                    <div style={{
                      fontSize: compact ? '0.7rem' : '0.875rem',
                      fontWeight: 700, color: 'var(--text)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      display: 'flex', alignItems: 'center', gap: '0.2rem',
                    }}>
                      {player.name}
                      {mode === 'ipl' && player.nationality !== 'India' && (
                        <span style={{ fontSize: '0.62rem' }} title="Overseas">✈️</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {player.iplTeam
                        ? `${player.iplTeam}${player.iplYear ? ` · ${player.iplYear}` : ''}`
                        : player.nationality}
                    </div>
                  </>
                ) : (
                  <div style={{
                    fontSize: compact ? '0.68rem' : '0.82rem',
                    color: isActive ? '#C8102E' : slotColor,
                    fontWeight: isActive ? 700 : 500,
                  }}>
                    {role ? COMP_FULL_LABEL[role] : 'Player'}
                  </div>
                )}
              </div>

              {/* Overall rating */}
              {player && (
                <span style={{ fontSize: '0.78rem', fontWeight: 900, color: '#f59e0b', flexShrink: 0 }}>
                  {ratingType === 'prime' ? scalePrime(getPrimeRatings(mode)[player.name] ?? player.overall) : scaleDisplay(player.overall)}
                </span>
              )}

              {/* Reorder arrows — only when XI complete and adjacent slot in same zone */}
              {showArrows ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                  {[
                    { dir: -1, enabled: canUp,   symbol: '▲' },
                    { dir:  1, enabled: canDown,  symbol: '▼' },
                  ].map(({ dir, enabled, symbol }) => {
                    const c = roleColor[player.role] ?? '#64748b'
                    return (
                      <button
                        key={dir}
                        onClick={() => enabled && move(i, dir)}
                        disabled={!enabled}
                        style={{
                          width: 15, height: 15,
                          background: enabled ? c + '22' : 'transparent',
                          border: `1px solid ${enabled ? c + '55' : 'transparent'}`,
                          borderRadius: '2px',
                          fontSize: '0.42rem', fontWeight: 900,
                          color: enabled ? c : 'transparent',
                          cursor: enabled ? 'pointer' : 'default',
                          lineHeight: 1, padding: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {symbol}
                      </button>
                    )
                  })}
                </div>
              ) : isDone && player ? (
                <div style={{ width: 15, flexShrink: 0 }} />
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Simulate button (only when XI done and caller provides the handler) */}
      {isDone && onSimulate && (
        <div style={{ padding: '0.625rem', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onSimulate}
            style={{
              width: '100%', padding: '0.75rem',
              background: '#C8102E',
              color: 'var(--bg)', border: 'none', borderRadius: '0.5rem',
              fontSize: '0.875rem', fontWeight: 800,
              cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase',
              animation: 'pulse-glow 2s ease infinite',
            }}
          >
            Simulate Season →
          </button>
        </div>
      )}
    </div>
  )
}
