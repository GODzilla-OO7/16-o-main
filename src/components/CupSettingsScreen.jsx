import { useState } from 'react'
import { MODE_CONFIG } from '../data/players.js'
import { STARTING_BUDGET } from './WheelSpin.jsx'

// ─── Shared constants (mirrors DraftSettings) ─────────────────────────────────

export const DEFAULT_COMP = {
  opener: 2, 'top-order': 2, 'middle-order': 1,
  'wicket-keeper': 1, 'all-rounder': 2,
  'pace-bowler': 2, 'spin-bowler': 1,
}

const DIFFICULTY = [
  { key: 'easy',   label: 'Easy',   rerolls: 5, desc: '5 rerolls' },
  { key: 'normal', label: 'Normal', rerolls: 3, desc: '3 rerolls' },
  { key: 'hard',   label: 'Hard',   rerolls: 1, desc: '1 reroll'  },
]

const MODES = [
  { key: 'ipl',    label: '🏏 IPL',    sub: 'T20 · 14 matches · Auction', color: '#C8102E' },
  { key: 't20-wc', label: '⚡ T20 WC', sub: 'T20 · 9 matches · Free draft', color: '#f59e0b' },
  { key: 'odi-wc', label: '🌍 ODI WC', sub: 'ODI · 11 matches · Free draft', color: '#3b82f6' },
]

// ─── Small toggle row ─────────────────────────────────────────────────────────

function ToggleRow({ icon, label, desc, value, onChange, disabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.7rem 0',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      opacity: disabled ? 0.35 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
    }}>
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{icon} {label}</div>
        {desc && <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.1rem' }}>{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: value ? '#C8102E' : 'rgba(255,255,255,0.12)',
          position: 'relative', flexShrink: 0, transition: 'background 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * CupSettingsScreen — host picks mode + full settings before/during room creation.
 * Props:
 *   initialMode   – 'ipl' | 't20-wc' | 'odi-wc'
 *   onConfirm(mode, settings) – called when host confirms
 *   onBack        – called when host cancels / goes back
 *   compact       – if true, renders without outer padding (for embedding in lobby)
 *   saveLabel     – override CTA button text
 */
export default function CupSettingsScreen({
  initialMode = 'ipl',
  onConfirm,
  onBack,
  compact = false,
  saveLabel = 'Confirm Settings →',
}) {
  const [mode,         setMode]         = useState(initialMode)
  const [allTeams,     setAllTeams]     = useState(false)
  const [ratingType,   setRatingType]   = useState('overall')
  const [difficulty,   setDifficulty]   = useState('normal')
  const [enableQTEs,   setEnableQTEs]   = useState(true)
  const [biddingWars,  setBiddingWars]  = useState(true)
  const [overseasLimit,setOverseasLimit]= useState(true)
  const [freePositions,setFreePositions]= useState(false)
  const [hiddenRatings,setHiddenRatings]= useState(false)
  const [budget,       setBudget]       = useState(STARTING_BUDGET)

  const isIPL = mode === 'ipl'
  const rerolls = DIFFICULTY.find(d => d.key === difficulty)?.rerolls ?? 3

  function handleConfirm() {
    // Build filteredEntries based on mode + allTeams
    let filteredEntries
    if (allTeams) {
      filteredEntries = [
        ...MODE_CONFIG['ipl'].entries,
        ...MODE_CONFIG['odi-wc'].entries,
        ...MODE_CONFIG['t20-wc'].entries,
      ]
    } else {
      filteredEntries = MODE_CONFIG[mode]?.entries ?? []
    }

    const settings = {
      // Stored in DB (plain values)
      allTeams,
      ratingType,
      difficulty,
      rerolls,
      freePositions,
      overseasLimit: isIPL ? overseasLimit : false,
      biddingWars:   isIPL ? biddingWars   : false,
      hiddenRatings,
      budget:        isIPL ? budget        : null,
      enableQTEs,
      // Computed (not stored, needed by WheelSpin)
      filteredEntries,
      composition: freePositions ? null : { ...DEFAULT_COMP },
      hardMode: hiddenRatings,
    }
    onConfirm(mode, settings)
  }

  const inner = (
    <div>
      {/* ── Mode selector ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
          Mode
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {MODES.map(m => {
            const active = mode === m.key
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.6rem 0.875rem',
                  background: active ? `${m.color}18` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? m.color : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '0.625rem', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: active ? m.color : 'var(--text)' }}>{m.label}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>{m.sub}</div>
                </div>
                {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 0 1.1rem' }} />

      {/* ── Settings toggles ─────────────────────────────────────────────── */}
      <ToggleRow
        icon="🌐" label="All Teams"
        desc="Spin from IPL, ODI WC & T20 WC teams combined. Same player can't appear twice in your XI."
        value={allTeams} onChange={setAllTeams}
      />
      <ToggleRow
        icon="⚡" label="QTE Events"
        desc="Quick-time events during the Final — century chances, DRS calls, death-over drama."
        value={enableQTEs} onChange={setEnableQTEs}
      />
      {isIPL && (
        <ToggleRow
          icon="⚔️" label="Bidding Wars"
          desc="Marquee players may trigger a bidding war — pay more or lose them to a rival."
          value={biddingWars} onChange={setBiddingWars}
        />
      )}
      {isIPL && (
        <ToggleRow
          icon="✈️" label="Overseas Limit"
          desc="IPL rule: max 4 overseas players per XI."
          value={overseasLimit} onChange={setOverseasLimit}
        />
      )}
      <ToggleRow
        icon="🔀" label="Free Positions"
        desc="No role quotas — spin any player into any slot."
        value={freePositions} onChange={setFreePositions}
      />
      <ToggleRow
        icon="🕶️" label="Hidden Ratings"
        desc="Player ratings are hidden during the draft. Build on instinct alone."
        value={hiddenRatings} onChange={setHiddenRatings}
      />

      {/* ── Rating type ──────────────────────────────────────────────────── */}
      <div style={{ marginTop: '1rem', marginBottom: '0.875rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
          Ratings
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {[
            { key: 'overall', label: '📅 Season', desc: 'Ratings from that season' },
            { key: 'prime',   label: '⚡ Prime',  desc: 'Career peak ratings' },
          ].map(r => (
            <button
              key={r.key}
              onClick={() => setRatingType(r.key)}
              style={{
                flex: 1, padding: '0.5rem', border: `1px solid ${ratingType === r.key ? '#C8102E' : 'rgba(255,255,255,0.1)'}`,
                background: ratingType === r.key ? 'rgba(200,16,46,0.12)' : 'rgba(255,255,255,0.03)',
                borderRadius: '0.5rem', cursor: 'pointer',
                color: ratingType === r.key ? '#C8102E' : '#94a3b8',
                fontSize: '0.75rem', fontWeight: 800,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Difficulty ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '0.875rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
          Difficulty
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {DIFFICULTY.map(d => (
            <button
              key={d.key}
              onClick={() => setDifficulty(d.key)}
              style={{
                flex: 1, padding: '0.5rem',
                border: `1px solid ${difficulty === d.key ? '#C8102E' : 'rgba(255,255,255,0.1)'}`,
                background: difficulty === d.key ? 'rgba(200,16,46,0.12)' : 'rgba(255,255,255,0.03)',
                borderRadius: '0.5rem', cursor: 'pointer',
                color: difficulty === d.key ? '#C8102E' : '#94a3b8',
                fontSize: '0.75rem', fontWeight: 800,
              }}
            >
              <div>{d.label}</div>
              <div style={{ fontSize: '0.6rem', fontWeight: 600, marginTop: '0.15rem', opacity: 0.8 }}>{d.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Budget slider (IPL only) ─────────────────────────────────────── */}
      {isIPL && (
        <div style={{ marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Auction Budget
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f59e0b' }}>₹{budget}cr</div>
          </div>
          <input
            type="range" min={60} max={200} step={5} value={budget}
            onChange={e => setBudget(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#64748b', marginTop: '0.2rem' }}>
            <span>₹60cr</span><span>₹200cr</span>
          </div>
        </div>
      )}

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.625rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
          >
            ← Back
          </button>
        )}
        <button
          onClick={handleConfirm}
          style={{
            flex: 1, padding: '0.875rem',
            background: 'linear-gradient(135deg, #C8102E, #9b0e24)',
            color: '#fff', border: 'none', borderRadius: '0.625rem',
            fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.02em',
          }}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )

  if (compact) return inner

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1.25rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
            Room Settings
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Set the rules
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.25rem' }}>
            Choose a mode and configure the draft. These settings apply to everyone in the room.
          </div>
        </div>
        {inner}
      </div>
    </div>
  )
}
