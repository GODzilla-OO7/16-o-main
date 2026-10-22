import { useState, useRef, useEffect } from 'react'
import { WHEEL_ENTRIES, getPrimeRatings } from '../data/players.js'
import { playTickClick } from '../utils/audioEngine.js'

// ─── Legendary icon players — appear with 0.05% chance in player spin ────────
// These are all-time greats NOT present in the regular WHEEL_ENTRIES pool.

const ICON_PLAYERS = [
  // Pre-modern era — England
  { id: 'icon-hobbs',     name: 'Sir Jack Hobbs',      role: 'opener',       nationality: 'England',   batting: 99, bowling: 10, fielding: 82, overall: 98, _isIcon: true },
  { id: 'icon-hutton',    name: 'Sir Len Hutton',       role: 'opener',       nationality: 'England',   batting: 96, bowling: 12, fielding: 80, overall: 95, _isIcon: true },
  { id: 'icon-hammond',   name: 'Wally Hammond',        role: 'top-order',    nationality: 'England',   batting: 97, bowling: 70, fielding: 92, overall: 97, _isIcon: true },
  // Pre-modern era — Australia
  { id: 'icon-bradman',   name: 'Sir Donald Bradman',   role: 'top-order',    nationality: 'Australia', batting: 99, bowling: 20, fielding: 85, overall: 99, _isIcon: true },
  { id: 'icon-miller',    name: 'Keith Miller',         role: 'all-rounder',  nationality: 'Australia', batting: 92, bowling: 92, fielding: 88, overall: 97, _isIcon: true },
  { id: 'icon-lindwall',  name: 'Ray Lindwall',         role: 'pace-bowler',  nationality: 'Australia', batting: 60, bowling: 94, fielding: 78, overall: 93, _isIcon: true },
  { id: 'icon-benaud',    name: 'Richie Benaud',        role: 'spin-bowler',  nationality: 'Australia', batting: 72, bowling: 92, fielding: 82, overall: 91, _isIcon: true },
  // West Indies greats
  { id: 'icon-sobers',    name: 'Sir Garfield Sobers',  role: 'all-rounder',  nationality: 'W. Indies', batting: 97, bowling: 95, fielding: 90, overall: 99, _isIcon: true },
  { id: 'icon-viv',       name: 'Sir Viv Richards',     role: 'top-order',    nationality: 'W. Indies', batting: 98, bowling: 38, fielding: 88, overall: 98, _isIcon: true },
  { id: 'icon-worrell',   name: 'Sir Frank Worrell',    role: 'all-rounder',  nationality: 'W. Indies', batting: 93, bowling: 72, fielding: 82, overall: 95, _isIcon: true },
  { id: 'icon-weekes',    name: 'Sir Everton Weekes',   role: 'middle-order', nationality: 'W. Indies', batting: 96, bowling: 20, fielding: 82, overall: 95, _isIcon: true },
  { id: 'icon-walcott',   name: 'Sir Clyde Walcott',    role: 'middle-order', nationality: 'W. Indies', batting: 95, bowling: 22, fielding: 80, overall: 94, _isIcon: true },
  { id: 'icon-kanhai',    name: 'Rohan Kanhai',         role: 'top-order',    nationality: 'W. Indies', batting: 95, bowling: 15, fielding: 80, overall: 93, _isIcon: true },
  // South African legends (limited Test careers due to apartheid)
  { id: 'icon-gpollock',  name: 'Graeme Pollock',       role: 'top-order',    nationality: 'S. Africa', batting: 98, bowling: 28, fielding: 80, overall: 97, _isIcon: true },
  { id: 'icon-brichards', name: 'Barry Richards',       role: 'opener',       nationality: 'S. Africa', batting: 97, bowling: 35, fielding: 82, overall: 96, _isIcon: true },
]

// ─── Event types that can land on the wheel ──────────────────────────────────
// 9 events, equal probability. minRating/maxRating filter by scaleDisplay(overall).
// replaceTarget: 'weakest' = lowest-rated of same role leaves; 'best' = highest-rated leaves.
// legendsPool: true = incoming player is drawn from ICON_PLAYERS only (pre-2008 greats).

const EVENTS = [
  // ─── Upgrades ─────────────────────────────────────────────────────────────
  {
    id: 'team-raid',
    icon: '🎯',
    label: 'Team Raid',
    color: '#C8102E',
    desc: 'You raid a rival squad. A quality player (85+) spins in — your weakest of that role exits.',
    replaceTarget: 'weakest',
    minRating: 85,
  },
  {
    id: 'headhunt',
    icon: '🦅',
    label: 'Headhunt',
    color: '#f97316',
    desc: 'Your scouts secure elite talent (82+). An exceptional player arrives — weakest of that role leaves.',
    replaceTarget: 'weakest',
    minRating: 82,
  },
  {
    id: 'franchise-buy',
    icon: '🏟️',
    label: 'Franchise Buy',
    color: '#0ea5e9',
    desc: 'The franchise opens the purse strings. A reliable star (88+) joins — weakest of that role goes.',
    replaceTarget: 'weakest',
    minRating: 88,
  },
  {
    id: 'legends',
    icon: '🏛️',
    label: 'Legends',
    color: '#f59e0b',
    desc: 'A pre-2008 legend steps out of retirement. An all-time great joins — your player in that role departs.',
    replaceTarget: 'weakest',
    legendsPool: true,
  },
  // ─── Gamble ────────────────────────────────────────────────────────────────
  {
    id: 'wildcard',
    icon: '🎲',
    label: 'Wildcard',
    color: '#22c55e',
    desc: 'Complete chaos — anyone can spin in, any rating. Your weakest of that same role exits.',
    replaceTarget: 'weakest',
  },
  // ─── Downgrades / youth signings ───────────────────────────────────────────
  {
    id: 'rising-star',
    icon: '⭐',
    label: 'Rising Star',
    color: '#f59e0b',
    desc: 'A young, hungry player (max 85) arrives — replaces your weakest of that role. Slight gamble on potential.',
    replaceTarget: 'weakest',
    maxRating: 85,
  },
  {
    id: 'rival-sends',
    icon: '🔄',
    label: 'Rival Sends',
    color: '#a855f7',
    desc: 'A rival offloads their fringe player (max 75). Your BEST in that role leaves. Likely a downgrade.',
    replaceTarget: 'best',
    maxRating: 75,
  },
  {
    id: 'youth-academy',
    icon: '🌱',
    label: 'Youth Academy',
    color: '#10b981',
    desc: 'A raw academy prospect (max 78) earns a debut. Your strongest in that role departs. Biggest gamble.',
    replaceTarget: 'best',
    maxRating: 78,
  },
  // ─── Painful ───────────────────────────────────────────────────────────────
  {
    id: 'best-is-lost',
    icon: '💔',
    label: 'Best is Lost',
    color: '#ef4444',
    desc: 'Your highest-rated player walks out. A replacement (max 80) of the same role spins in.',
    replaceTarget: 'best',
    maxRating: 80,
  },
]

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }
function scalePrime(v)   { return Math.max(1, Math.min(99, v)) }
const isOverseas = p => p.nationality !== 'India'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Who leaves for a given role + replaceTarget. Falls back to overall weakest if role not in team. */
function pickOutgoing(team, replaceTarget, role) {
  const sameRole = team.filter(p => p.role === role)
  const pool     = sameRole.length ? sameRole : team
  return replaceTarget === 'best'
    ? pool.reduce((a, b) => (a.overall > b.overall ? a : b))
    : pool.reduce((a, b) => (a.overall < b.overall ? a : b))
}

/** Would adding incomingPlayer (who is overseas) violate the 4-overseas cap?
 *  outgoingPlayer is the one leaving — if they are also overseas, the slot is freed. */
function overseasOk(team, incoming, outgoing) {
  if (!isOverseas(incoming)) return true          // domestic in → always fine
  if (isOverseas(outgoing))  return true          // overseas out + overseas in → net 0
  const currentOverseas = team.filter(p => isOverseas(p)).length
  return currentOverseas < 4                      // domestic out + overseas in → check cap
}

// Cubic ease-out animation helper (same as WheelSpin)
function getInterval(tick, total) {
  const t = tick / total
  return Math.round(30 + 270 * (t * t * t))
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImpactSub({ team, mode, ratingType = 'season', onComplete, onSkip }) {
  const showRating = (player) => {
    if (!player) return '—'
    if (ratingType === 'prime') {
      const primeMap = getPrimeRatings(mode)
      return scalePrime(primeMap[player.name] ?? player.overall)
    }
    return scaleDisplay(player.overall)
  }
  const [phase, setPhase] = useState('offer')  // offer → event-spin → event-landed → player-spin → player-landed → confirm
  const [eventEntry, setEventEntry]   = useState(null)   // landed event
  const [cycleEvent, setCycleEvent]   = useState(null)   // currently cycling event (spin anim)
  const [playerEntry, setPlayerEntry] = useState(null)   // landed player
  const [cyclePlayer, setCyclePlayer] = useState(null)   // currently cycling player
  const [outgoing, setOutgoing]       = useState(null)   // player being replaced
  const [pool, setPool]               = useState([])     // candidates for replacement

  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // ── Phase 1: spin for event type ─────────────────────────────────────────
  function spinEvent() {
    setPhase('event-spin')

    // Shuffle EVENTS freshly each spin — animation sequence AND final pick
    // both come from this shuffle, so it feels like a real spinning wheel
    const shuffledEvents = [...EVENTS].sort(() => Math.random() - 0.5)
    const landIndex = Math.floor(Math.random() * shuffledEvents.length)
    const chosen = shuffledEvents[landIndex]
    const TICKS = 28
    let i = 0

    function tick() {
      i++
      const last = i >= TICKS
      playTickClick()
      setCycleEvent(last ? chosen : shuffledEvents[i % shuffledEvents.length])
      if (last) {
        timerRef.current = setTimeout(() => {
          setEventEntry(chosen)
          setPhase('event-landed')
        }, 500)
      } else {
        timerRef.current = setTimeout(tick, getInterval(i, TICKS))
      }
    }
    timerRef.current = setTimeout(tick, getInterval(0, TICKS))
  }

  // ── Phase 2: spin for replacement player ─────────────────────────────────
  function spinPlayer() {
    setPhase('player-spin')

    const teamIds   = new Set(team.map(p => p.id))
    const teamNames = new Set(team.map(p => p.name))

    // ── For best-is-lost: outgoing is globally highest-rated player ──────────
    // Determine outgoing first so we know required role and overseas slot.
    let preOut = null
    let requiredRole = null
    if (eventEntry.id === 'best-is-lost') {
      preOut = [...team].sort((a, b) => b.overall - a.overall)[0] ?? null
      requiredRole = preOut?.role ?? null
      if (preOut) setOutgoing(preOut)
    }

    const minR = eventEntry.minRating ?? null
    const maxR = eventEntry.maxRating ?? null

    // ── Build candidate pool ─────────────────────────────────────────────────
    // Rules enforced per-candidate:
    //   1. Same role as a role that exists in the team (composition check)
    //   2. If event pre-determines the role (best-is-lost), only that role
    //   3. Overseas rule: incoming overseas player can only join if outgoing is
    //      also overseas, OR the team currently has < 4 overseas players
    const seen = new Set()
    const fullPool = []

    if (eventEntry.legendsPool) {
      // Legends event: pool is ICON_PLAYERS only (pre-2008 greats)
      for (const ic of ICON_PLAYERS) {
        if (teamIds.has(ic.id) || teamNames.has(ic.name)) continue
        const roleExists = team.some(p => p.role === ic.role)
        if (!roleExists) continue
        const out = preOut ?? pickOutgoing(team, eventEntry.replaceTarget, ic.role)
        if (!overseasOk(team, ic, out)) continue
        fullPool.push(ic)
      }
    } else {
      for (const entry of WHEEL_ENTRIES) {
        if (!entry.competition?.includes(mode)) continue
        for (const p of entry.players) {
          if (teamIds.has(p.id) || teamNames.has(p.name)) continue
          if (seen.has(p.name)) continue
          // Role: must match pre-determined role (best-is-lost) or exist in team
          if (requiredRole ? p.role !== requiredRole : !team.some(t => t.role === p.role)) continue
          // Rating filter
          const scaled = scaleDisplay(p.overall)
          if (minR !== null && scaled < minR) continue
          if (maxR !== null && scaled > maxR) continue
          // Overseas + composition check
          const out = preOut ?? pickOutgoing(team, eventEntry.replaceTarget, p.role)
          if (!overseasOk(team, p, out)) continue
          seen.add(p.name)
          fullPool.push(p)
        }
      }
    }

    // Fallback: only for events with NO rating constraint — keeps event description accurate
    if (!fullPool.length && !eventEntry.legendsPool && minR === null && maxR === null) {
      const seen2 = new Set()
      for (const entry of WHEEL_ENTRIES) {
        if (!entry.competition?.includes(mode)) continue
        for (const p of entry.players) {
          if (teamIds.has(p.id) || teamNames.has(p.name)) continue
          if (seen2.has(p.name)) continue
          if (requiredRole ? p.role !== requiredRole : !team.some(t => t.role === p.role)) continue
          const out = preOut ?? pickOutgoing(team, eventEntry.replaceTarget, p.role)
          if (!overseasOk(team, p, out)) continue
          seen2.add(p.name)
          fullPool.push(p)
        }
      }
    }

    if (!fullPool.length) { onSkip(); return }

    // Double-shuffle to remove ordering bias
    const shuffled = [...fullPool]
      .sort(() => Math.random() - 0.5)
      .sort(() => Math.random() - 0.5)
    const chosen = shuffled[Math.floor(Math.random() * shuffled.length)]

    setPool(shuffled)

    const TICKS = 30
    let i = 0
    function tick() {
      i++
      const last = i >= TICKS
      playTickClick()
      setCyclePlayer(last ? chosen : shuffled[i % shuffled.length])
      if (last) {
        timerRef.current = setTimeout(() => {
          // Determine who leaves (pre-set for best-is-lost, derived for all others)
          const out = preOut ?? pickOutgoing(team, eventEntry.replaceTarget, chosen.role)
          setOutgoing(out)
          setPlayerEntry(chosen)
          setPool(shuffled)
          setPhase('player-landed')
        }, 500)
      } else {
        timerRef.current = setTimeout(tick, getInterval(i, TICKS))
      }
    }
    timerRef.current = setTimeout(tick, getInterval(0, TICKS))
  }

  function confirmSub() {
    if (!playerEntry || !outgoing) return
    const newTeam = team.map(p => p.id === outgoing.id ? { ...playerEntry, _impactSub: true } : p)
    onComplete(newTeam, outgoing, playerEntry, eventEntry)
  }

  // ── Renders ───────────────────────────────────────────────────────────────

  const displayed = phase === 'event-spin' ? cycleEvent : eventEntry
  const displayedPlayer = phase === 'player-spin' ? cyclePlayer : playerEntry
  const isEventSpinning  = phase === 'event-spin'
  const isPlayerSpinning = phase === 'player-spin'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1500,
      background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', animation: 'fade-in 0.3s ease both',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'var(--card)', border: '1px solid var(--card-border)',
        borderRadius: '1.25rem', padding: '1.75rem',
        animation: 'fade-in-up 0.3s ease both',
      }}>

        {/* ── Offer screen ──────────────────────────────────────────────── */}
        {phase === 'offer' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔁</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.4rem' }}>
                Impact Sub Window
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>
                The transfer window is open before the playoffs. Spin the wheel — fate decides who comes in and who goes out.
              </div>
            </div>
            <button
              onClick={spinEvent}
              style={{
                width: '100%', padding: '0.9rem',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff', border: 'none', borderRadius: '0.625rem',
                fontSize: '1rem', fontWeight: 800, cursor: 'pointer',
                marginBottom: '0.625rem',
              }}
            >
              🎰 Spin the Impact Sub Wheel
            </button>
            <button
              onClick={onSkip}
              style={{
                width: '100%', padding: '0.65rem',
                background: 'transparent', color: '#64748b',
                border: '1px solid var(--border)', borderRadius: '0.625rem',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Skip — go straight to playoffs
            </button>
          </>
        )}

        {/* ── Event spin + landed ──────────────────────────────────────── */}
        {(phase === 'event-spin' || phase === 'event-landed') && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
                Impact Sub Event
              </div>
            </div>

            {/* Event reel */}
            <div style={{
              background: displayed ? displayed.color + '18' : 'var(--card)',
              border: `2px solid ${displayed ? displayed.color + '66' : 'var(--border)'}`,
              borderRadius: '0.875rem', padding: '1.25rem',
              textAlign: 'center', marginBottom: '1.25rem',
              minHeight: 110, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.15s, background 0.15s',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.4rem', filter: isEventSpinning ? 'blur(1.5px)' : 'none', transition: 'filter 0.08s' }}>
                {displayed?.icon ?? '🎰'}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', filter: isEventSpinning ? 'blur(1px)' : 'none', transition: 'filter 0.08s' }}>
                {displayed?.label ?? '—'}
              </div>
              {phase === 'event-landed' && displayed?.desc && (
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.5rem', lineHeight: 1.5, animation: 'fade-in 0.3s ease both' }}>
                  {displayed.desc}
                </div>
              )}
            </div>

            {phase === 'event-landed' && (
              <button
                onClick={spinPlayer}
                style={{
                  width: '100%', padding: '0.875rem',
                  background: `linear-gradient(135deg, ${eventEntry.color}, ${eventEntry.color}cc)`,
                  color: 'var(--bg)', border: 'none', borderRadius: '0.625rem',
                  fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                🎰 Spin for Your Player
              </button>
            )}

            {isEventSpinning && (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.8rem', fontWeight: 700 }}>Spinning…</div>
            )}
          </>
        )}

        {/* ── Player spin + landed ─────────────────────────────────────── */}
        {(phase === 'player-spin' || phase === 'player-landed') && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '0.875rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.75rem', background: (eventEntry?.color ?? '#C8102E') + '22', border: `1px solid ${(eventEntry?.color ?? '#C8102E')}44`, borderRadius: '999px', marginBottom: '0.5rem' }}>
                <span>{eventEntry?.icon}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: eventEntry?.color ?? '#C8102E' }}>{eventEntry?.label}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Spinning for your replacement player…</div>
            </div>

            {/* Player reel */}
            <div style={{
              background: 'var(--card)', border: '1px solid var(--card-border)',
              borderRadius: '0.875rem', padding: '1rem 1.25rem',
              marginBottom: '1rem', minHeight: 80,
              display: 'flex', alignItems: 'center', gap: '0.875rem',
              transition: 'border-color 0.15s',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text)', filter: isPlayerSpinning ? 'blur(1.5px)' : 'none', transition: 'filter 0.08s' }}>
                  {displayedPlayer?.name ?? '—'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem', filter: isPlayerSpinning ? 'blur(1px)' : 'none', transition: 'filter 0.08s' }}>
                  {displayedPlayer ? `${displayedPlayer.nationality} · ${displayedPlayer.role}` : '—'}
                </div>
              </div>
              {displayedPlayer && !isPlayerSpinning && (
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f59e0b', flexShrink: 0 }}>
                  {showRating(displayedPlayer)}
                </div>
              )}
            </div>

            {/* Who goes out */}
            {phase === 'player-landed' && outgoing && (
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'var(--loss-bg)', border: '1px solid var(--loss-border)', borderRadius: '0.625rem', animation: 'fade-in 0.3s ease both' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Out</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f87171' }}>{outgoing.name}</div>
                    <div style={{ fontSize: '0.67rem', color: '#64748b' }}>{outgoing.nationality} · {outgoing.role}</div>
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#ef4444' }}>{showRating(outgoing)}</div>
                </div>
                <div style={{ borderTop: '1px solid #ef444422', margin: '0.5rem 0' }} />
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>In</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#86efac' }}>{playerEntry?.name}</div>
                    <div style={{ fontSize: '0.67rem', color: '#64748b' }}>{playerEntry?.nationality} · {playerEntry?.role}</div>
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#22c55e' }}>{showRating(playerEntry)}</div>
                </div>
              </div>
            )}

            {/* Icon player special badge */}
            {phase === 'player-landed' && playerEntry?._isIcon && (
              <div style={{
                marginBottom: '1rem', padding: '0.75rem 1rem',
                background: 'linear-gradient(135deg, #78350f22, #92400e22)',
                border: '2px solid #f59e0b66',
                borderRadius: '0.75rem',
                textAlign: 'center',
                animation: 'fade-in 0.4s ease both',
              }}>
                <div style={{ fontSize: '1.25rem', marginBottom: '0.2rem' }}>⭐</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  LEGEND APPEARED
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  A once-in-a-lifetime signing. This player will be remembered.
                </div>
              </div>
            )}

            {phase === 'player-landed' && (
              <button
                onClick={confirmSub}
                style={{
                  width: '100%', padding: '0.875rem',
                  background: playerEntry?._isIcon
                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                    : 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: 'var(--bg)', border: 'none', borderRadius: '0.625rem',
                  fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                {playerEntry?._isIcon ? '⭐ Confirm Legend Sub' : '✓ Confirm Impact Sub'}
              </button>
            )}

            {isPlayerSpinning && (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.8rem', fontWeight: 700 }}>Spinning…</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
