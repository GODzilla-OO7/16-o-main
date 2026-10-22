import { useState, useRef, useEffect, useCallback } from 'react'
import { MODE_CONFIG } from '../data/players.js'

function getYear(entry) {
  if (typeof entry.season === 'number') return entry.season
  return parseInt(entry.season?.match(/\d{4}/)?.[0] ?? '2000')
}

const DIFFICULTY = [
  { key: 'easy',   label: 'Easy',   rerolls: 5, desc: '5 rerolls' },
  { key: 'normal', label: 'Medium', rerolls: 3, desc: '3 rerolls' },
  { key: 'hard',   label: 'Hard',   rerolls: 1, desc: '1 reroll'  },
]

// ─── Dual range slider ────────────────────────────────────────────────────────

function DualRangeSlider({ min, max, low, high, onChange, formatLabel }) {
  const trackRef = useRef(null)
  const lowRef   = useRef(low)
  const highRef  = useRef(high)
  lowRef.current  = low
  highRef.current = high

  const pct = v => `${((v - min) / (max - min) * 100).toFixed(2)}%`
  const fmt = v => formatLabel ? formatLabel(v) : String(v)

  function getVal(clientX) {
    if (!trackRef.current) return null
    const rect = trackRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(min + fraction * (max - min))
  }

  function startDrag(thumb, e) {
    e.preventDefault(); e.stopPropagation()
    const onMove = ev => {
      const cx  = ev.touches ? ev.touches[0].clientX : ev.clientX
      const val = getVal(cx)
      if (val === null) return
      if (thumb === 'low') onChange(Math.min(val, highRef.current), highRef.current)
      else                 onChange(lowRef.current, Math.max(val, lowRef.current))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend',  onUp)
  }

  function onTrackClick(e) {
    const val = getVal(e.clientX)
    if (val === null) return
    const lowDist  = Math.abs(val - low)
    const highDist = Math.abs(val - high)
    if (lowDist <= highDist) onChange(Math.min(val, high), high)
    else                     onChange(low, Math.max(val, low))
  }

  const overlap = (high - low) / (max - min) < 0.12

  const thumbStyle = {
    position: 'absolute', top: '50%',
    width: 22, height: 22, borderRadius: '50%',
    background: '#C8102E', border: '3px solid var(--bg)',
    cursor: 'grab', zIndex: 3, boxSizing: 'border-box',
    transform: 'translate(-50%, -50%)',
  }

  return (
    <div style={{ userSelect: 'none', padding: '2rem 0 0.5rem' }}>
      <div
        ref={trackRef}
        style={{ position: 'relative', height: 6, background: 'var(--border2)', borderRadius: 3, cursor: 'pointer', overflow: 'visible' }}
        onMouseDown={onTrackClick}
      >
        <div style={{ position: 'absolute', left: pct(low), width: `${((high - low) / (max - min) * 100).toFixed(2)}%`, top: 0, bottom: 0, background: '#C8102E', borderRadius: 3, pointerEvents: 'none' }} />

        <div style={{ ...thumbStyle, left: pct(low) }} onMouseDown={e => startDrag('low', e)} onTouchStart={e => startDrag('low', e)}>
          <div style={{ position: 'absolute', bottom: '130%', left: '50%', transform: overlap ? 'translateX(-140%)' : 'translateX(-50%)', background: '#C8102E', color: 'var(--bg)', fontSize: '0.75rem', fontWeight: 900, padding: '2px 7px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 2px 6px #00000044' }}>
            {fmt(low)}
          </div>
        </div>

        <div style={{ ...thumbStyle, left: pct(high) }} onMouseDown={e => startDrag('high', e)} onTouchStart={e => startDrag('high', e)}>
          <div style={{ position: 'absolute', bottom: '130%', left: '50%', transform: overlap ? 'translateX(40%)' : 'translateX(-50%)', background: '#C8102E', color: 'var(--bg)', fontSize: '0.75rem', fontWeight: 900, padding: '2px 7px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 2px 6px #00000044' }}>
            {fmt(high)}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 0, top: '150%', fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600, transform: 'translateX(-25%)' }}>{fmt(min)}</div>
        <div style={{ position: 'absolute', right: 0, top: '150%', fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600, transform: 'translateX(25%)' }}>{fmt(max)}</div>
      </div>
    </div>
  )
}

// ─── Single range slider (budget) ─────────────────────────────────────────────

function SingleSlider({ min, max, step = 5, value, onChange, formatLabel }) {
  const trackRef = useRef(null)
  const pct = `${((value - min) / (max - min) * 100).toFixed(1)}%`
  const fmt = v => formatLabel ? formatLabel(v) : String(v)

  function getVal(clientX) {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = min + fraction * (max - min)
    return Math.max(min, Math.min(max, Math.round(raw / step) * step))
  }

  function startDrag(e) {
    e.preventDefault()
    const onMove = ev => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      onChange(getVal(cx))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    onMove(e)
  }

  return (
    <div style={{ userSelect: 'none', padding: '1.75rem 0 0.5rem' }}>
      <div
        ref={trackRef}
        style={{ position: 'relative', height: 6, background: 'var(--border2)', borderRadius: 3, cursor: 'pointer', overflow: 'visible' }}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      >
        <div style={{ position: 'absolute', left: 0, width: pct, top: 0, bottom: 0, background: '#C8102E', borderRadius: 3, pointerEvents: 'none' }} />
        <div style={{
          position: 'absolute', top: '50%', left: pct,
          width: 22, height: 22, borderRadius: '50%',
          background: '#C8102E', border: '3px solid var(--bg)',
          cursor: 'grab', zIndex: 3,
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 2px 6px #00000044',
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', bottom: '130%', left: '50%',
            transform: 'translateX(-50%)',
            background: '#C8102E', color: 'var(--bg)',
            fontSize: '0.75rem', fontWeight: 900,
            padding: '2px 7px', borderRadius: '4px',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px #00000044',
          }}>
            {fmt(value)}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, top: '150%', fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600, transform: 'translateX(-25%)' }}>{fmt(min)}</div>
        <div style={{ position: 'absolute', right: 0, top: '150%', fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600, transform: 'translateX(25%)' }}>{fmt(max)}</div>
      </div>
    </div>
  )
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({ icon, label, desc, value, onChange, isLast }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '1rem', padding: '1rem 1.75rem',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.2rem' }}>
          {icon} {label}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: '999px',
          background: value ? '#C8102E' : 'var(--border)',
          position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
          flexShrink: 0, border: 'none',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

// ─── Composition data ─────────────────────────────────────────────────────────

const ROLE_DEFS = [
  { key: 'opener',        label: 'Openers',      short: 'OPR', icon: '🏏', color: '#f59e0b', min: 1, max: 4 },
  { key: 'top-order',     label: 'Top Order',    short: 'TOP', icon: '🏏', color: '#fbbf24', min: 0, max: 4 },
  { key: 'middle-order',  label: 'Middle Order', short: 'MID', icon: '🏏', color: '#fb923c', min: 0, max: 4 },
  { key: 'wicket-keeper', label: 'Keeper',       short: 'WK',  icon: '🧤', color: '#a78bfa', min: 1, max: 4 },
  { key: 'all-rounder',   label: 'All-rounders', short: 'AR',  icon: '⚡', color: '#34d399', min: 0, max: 4 },
  { key: 'pace-bowler',   label: 'Pace Bowlers', short: 'PAC', icon: '💨', color: '#ef4444', min: 0, max: 5 },
  { key: 'spin-bowler',   label: 'Spin Bowlers', short: 'SPN', icon: '🌀', color: '#a855f7', min: 0, max: 5 },
]

const DEFAULT_COMP = {
  opener: 2, 'top-order': 2, 'middle-order': 1,
  'wicket-keeper': 1, 'all-rounder': 2,
  'pace-bowler': 2, 'spin-bowler': 1,
}

const COMP_PRESETS = [
  { label: 'Balanced', icon: '⚖️', color: '#C8102E', comp: { opener: 2, 'top-order': 2, 'middle-order': 1, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 2, 'spin-bowler': 1 } },
  { label: 'Batting',  icon: '💥', color: '#f59e0b', comp: { opener: 2, 'top-order': 2, 'middle-order': 2, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 1, 'spin-bowler': 1 } },
  { label: 'Pace Atk', icon: '💨', color: '#ef4444', comp: { opener: 2, 'top-order': 1, 'middle-order': 1, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 3, 'spin-bowler': 1 } },
  { label: 'Spin Web', icon: '🌀', color: '#a855f7', comp: { opener: 2, 'top-order': 1, 'middle-order': 1, 'wicket-keeper': 1, 'all-rounder': 2, 'pace-bowler': 1, 'spin-bowler': 3 } },
]

const FLEX_ORDER = ['middle-order', 'top-order', 'pace-bowler', 'spin-bowler', 'all-rounder', 'opener', 'wicket-keeper']

function autoBalance(prev, changedKey, newValue) {
  const def = ROLE_DEFS.find(r => r.key === changedKey)
  const clamped = Math.max(def.min, Math.min(def.max, newValue))
  const delta = clamped - (prev[changedKey] || 0)
  if (delta === 0) return prev
  const next = { ...prev, [changedKey]: clamped }
  let remaining = delta
  for (const key of FLEX_ORDER) {
    if (key === changedKey || remaining === 0) continue
    const d = ROLE_DEFS.find(r => r.key === key)
    const cur = next[key] || 0
    if (remaining > 0) {
      const canSteal = Math.min(remaining, cur - d.min)
      if (canSteal > 0) { next[key] = cur - canSteal; remaining -= canSteal }
    } else {
      const canGive = Math.min(-remaining, d.max - cur)
      if (canGive > 0) { next[key] = cur + canGive; remaining += canGive }
    }
    if (remaining === 0) break
  }
  return remaining === 0 ? next : prev
}

// ─── Role slider (compact, embedded) ─────────────────────────────────────────

function RoleSlider({ def, value, onDrag }) {
  const trackRef = useRef(null)

  const getValFromX = useCallback((clientX) => {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.max(def.min, Math.min(def.max, Math.round(frac * def.max)))
  }, [def, value])

  const startDrag = useCallback((e) => {
    e.preventDefault()
    const move = ev => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      onDrag(def.key, getValFromX(cx))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', up)
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    onDrag(def.key, getValFromX(cx))
  }, [def.key, getValFromX, onDrag])

  const pct = def.max > 0 ? (value / def.max) * 100 : 0
  const dots = Array.from({ length: def.max }, (_, i) => i + 1)

  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>{def.icon}</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: value > 0 ? 'var(--text)' : '#64748b' }}>{def.label}</span>
          {def.min > 0 && (
            <span style={{ fontSize: '0.5rem', fontWeight: 800, color: def.color, background: def.color + '22', border: `1px solid ${def.color}44`, borderRadius: '999px', padding: '0.1rem 0.3rem' }}>
              min {def.min}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {dots.map(i => (
            <div key={i} onClick={() => onDrag(def.key, i)} style={{
              width: 9, height: 9, borderRadius: '50%', cursor: 'pointer',
              background: i <= value ? def.color : 'var(--border2)',
              border: `1.5px solid ${i <= value ? def.color : 'var(--border)'}`,
              transition: 'all 0.12s',
              boxShadow: i <= value ? `0 0 4px ${def.color}66` : 'none',
            }} />
          ))}
          <span style={{ marginLeft: 5, fontSize: '0.9rem', fontWeight: 900, minWidth: 14, textAlign: 'center', color: value > 0 ? def.color : '#475569' }}>{value}</span>
        </div>
      </div>
      <div
        ref={trackRef}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--border2)', cursor: 'pointer', userSelect: 'none', touchAction: 'none' }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: value > 0 ? `linear-gradient(90deg, ${def.color}bb, ${def.color})` : 'transparent', borderRadius: 4, transition: 'width 0.12s', boxShadow: value > 0 ? `0 0 8px ${def.color}44` : 'none' }} />
        {value > 0 && (
          <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)', width: 18, height: 18, borderRadius: '50%', background: def.color, border: '2.5px solid var(--bg)', boxShadow: `0 0 8px ${def.color}88`, zIndex: 2, transition: 'left 0.12s', pointerEvents: 'none' }} />
        )}
      </div>
    </div>
  )
}

// ─── Composition bar ──────────────────────────────────────────────────────────

function CompositionBar({ comp }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>Composition</div>
      <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {ROLE_DEFS.map(def => {
          const count = comp[def.key] || 0
          if (count === 0) return null
          return (
            <div key={def.key} title={`${def.label}: ${count}`} style={{ width: `${(count / 11) * 100}%`, background: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.52rem', fontWeight: 900, color: '#0a0f1a', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'width 0.2s' }}>
              {count >= 2 ? def.short : ''}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.35rem' }}>
        {ROLE_DEFS.map(def => {
          const count = comp[def.key] || 0
          if (count === 0) return null
          return (
            <div key={def.key} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: def.color }} />
              <span style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 600 }}>{count} {def.short}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Formation preview ────────────────────────────────────────────────────────

function FormationPreview({ comp, circleSize = 36 }) {
  const ROWS = [
    { roles: ['opener'] },
    { roles: ['top-order'] },
    { roles: ['middle-order', 'wicket-keeper'] },
    { roles: ['all-rounder'] },
    { roles: ['pace-bowler', 'spin-bowler'] },
  ]

  const players = []
  ROLE_DEFS.forEach(def => {
    const count = comp[def.key] || 0
    for (let i = 0; i < count; i++) {
      players.push({ role: def.key, color: def.color, short: def.short, label: def.label })
    }
  })

  const rows = ROWS.map(row => ({ ...row, players: players.filter(p => row.roles.includes(p.role)) }))

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(180deg, #083d08 0%, #145214 35%, #145214 65%, #083d08 100%)',
      borderRadius: '50% / 12%',
      border: '2px solid #1e7a1e',
      position: 'relative',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-evenly', alignItems: 'center',
      padding: '8% 6%',
      boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4)',
    }}>
      <div style={{ position: 'absolute', left: '50%', top: '20%', bottom: '20%', width: circleSize * 0.6, transform: 'translateX(-50%)', background: 'linear-gradient(180deg, #c8a56a, #d4b87a)', borderRadius: 4, opacity: 0.75 }} />
      <div style={{ position: 'absolute', left: '50%', top: '22%', width: circleSize * 0.9, height: 2, transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.5)' }} />
      <div style={{ position: 'absolute', left: '50%', bottom: '22%', width: circleSize * 0.9, height: 2, transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.5)' }} />

      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: `${Math.max(4, circleSize * 0.15)}px`, justifyContent: 'center', zIndex: 1, width: '100%' }}>
          {row.players.map((p, pi) => (
            <div key={pi} title={p.label} style={{
              width: circleSize, height: circleSize, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${p.color}ee, ${p.color}99)`,
              border: '2px solid rgba(255,255,255,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: `${Math.max(8, circleSize * 0.22)}px`, fontWeight: 900, color: '#0a0f1a',
              boxShadow: `0 2px 8px ${p.color}77`,
              letterSpacing: '0.02em', flexShrink: 0, transition: 'all 0.2s',
            }}>
              {p.short}
            </div>
          ))}
        </div>
      ))}

      {players.length < 11 && (
        <div style={{ position: 'absolute', bottom: '8%', right: '8%', background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '0.1rem 0.35rem' }}>
          <span style={{ fontSize: '0.55rem', color: '#ffffff99', fontWeight: 700 }}>{11 - players.length} left</span>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DraftSettings({ mode, onStart, onBack, defaultFreePositions = false }) {
  const cfg        = MODE_CONFIG[mode]
  const allEntries = cfg.entries
  const allYears   = [...new Set(allEntries.map(getYear))].sort()

  const minYear = allYears[0]
  const maxYear = allYears[allYears.length - 1]

  // ── Settings state ──────────────────────────────────────────────────────────
  const [difficulty,    setDifficulty]    = useState('normal')
  const [ratingType,    setRatingType]    = useState('season')
  const [iplRange,      setIplRange]      = useState([minYear, maxYear])
  const [draftBudget,   setDraftBudget]   = useState(110)

  // WC: checkboxes
  const [checkedYears, setCheckedYears] = useState(new Set())
  const [wcRange, setWcRange]           = useState([0, allYears.length - 1])  // eslint-disable-line no-unused-vars

  // Toggles
  const [enableQTEs,    setEnableQTEs]    = useState(true)
  const [biddingWars,   setBiddingWars]   = useState(true)
  const [overseasLimit, setOverseasLimit] = useState(true)
  const [freePositions, setFreePositions] = useState(defaultFreePositions)
  const [hiddenRatings, setHiddenRatings] = useState(false)

  // ── Composition state ───────────────────────────────────────────────────────
  const [comp,         setComp]         = useState({ ...DEFAULT_COMP })
  const [activePreset, setActivePreset] = useState(0)
  const [isMobile,     setIsMobile]     = useState(typeof window !== 'undefined' && window.innerWidth < 700)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 700)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const handleDrag = useCallback((key, val) => {
    setComp(prev => autoBalance(prev, key, val))
    setActivePreset(-1)
  }, [])

  function applyPreset(preset, idx) {
    setComp({ ...preset.comp })
    setActivePreset(idx)
  }

  // ── Year filter helpers ─────────────────────────────────────────────────────
  function toggleYear(y) {
    setCheckedYears(prev => {
      const next = new Set(prev)
      if (next.has(y)) next.delete(y)
      else next.add(y)
      return next
    })
  }

  function getFilteredEntries() {
    if (mode === 'ipl') {
      const [lo, hi] = iplRange
      const iplEntries = allEntries.filter(e => { const y = getYear(e); return y >= lo && y <= hi })
      return iplEntries.map(e => ({
        ...e,
        players: (e.players ?? []).filter(p => p.nationality !== 'Pakistan'),
      })).filter(e => e.players.length > 0)
    }
    return allEntries.filter(e => checkedYears.has(getYear(e)))
  }

  // ── Composition validity ────────────────────────────────────────────────────
  const compTotal   = Object.values(comp).reduce((s, v) => s + v, 0)
  const compBowlers = (comp['pace-bowler'] || 0) + (comp['spin-bowler'] || 0)
  const isCompValid = freePositions || (compTotal === 11 && compBowlers >= 2)

  function handleStart() {
    const filtered = getFilteredEntries()
    const rerolls  = DIFFICULTY.find(d => d.key === difficulty)?.rerolls ?? 3
    onStart({
      hardMode:        hiddenRatings,
      filteredEntries: filtered.length > 0 ? filtered : allEntries,
      difficulty,
      ratingType,
      rerolls,
      freePositions,
      overseasLimit: mode === 'ipl' ? overseasLimit : false,
      biddingWars,
      enableQTEs,
      budget:      draftBudget,
      composition: freePositions ? null : { ...comp },
    })
  }

  const filteredCount = getFilteredEntries().length
  const noEditions    = mode !== 'ipl' && filteredCount === 0
  const canStart      = !noEditions && isCompValid

  function getBtnLabel() {
    if (noEditions) return 'Select editions first'
    if (!freePositions && compTotal !== 11) return `Set your XI  (${compTotal}/11)`
    if (!freePositions && compBowlers < 2)  return 'Need 2+ bowlers'
    return 'START DRAFT →'
  }

  const S = {
    page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem 3rem', position: 'relative', zIndex: 1 },
    card: { width: '100%', maxWidth: 720, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '1.25rem', overflow: 'hidden', backdropFilter: 'blur(8px)' },
    cardHeader: { padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--border)' },
    modeTag: { fontSize: '0.8rem', color: '#C8102E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' },
    title: { fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)' },
    section: { padding: '1rem 1.75rem', borderBottom: '1px solid var(--border)' },
    label: { fontSize: '0.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem' },
    row: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
    pill: (active) => ({
      padding: '0.45rem 1.1rem',
      background: active ? '#C8102E22' : 'var(--border2)',
      color: active ? '#C8102E' : '#64748b',
      border: `1px solid ${active ? '#C8102E66' : 'var(--border)'}`,
      borderRadius: '0.5rem', fontSize: '0.82rem', fontWeight: 700,
      cursor: 'pointer', transition: 'all 0.15s',
    }),
    yearChip: (on) => ({
      padding: '0.4rem 0.875rem', background: on ? '#C8102E22' : 'var(--border2)',
      color: on ? '#C8102E' : '#94a3b8', border: `1px solid ${on ? '#C8102E66' : '#3a3a4a'}`,
      borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
      cursor: 'pointer', transition: 'all 0.15s',
    }),
  }

  return (
    <div style={S.page}>

      {/* Back button */}
      <div style={{ width: '100%', maxWidth: 720, marginBottom: '0.4rem' }}>
        <button onClick={onBack} style={{
          background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)',
          color: '#C8102E', borderRadius: '0.4rem', fontSize: '0.8rem',
          cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em',
        }}>← Back</button>
      </div>

      {/* ── Card 1: Mode Settings ────────────────────────────────────── */}
      <div style={{ ...S.card, marginBottom: '0.875rem' }}>

        <div style={S.cardHeader}>
          <div style={S.modeTag}>{cfg.icon} {cfg.label}</div>
          <div style={S.title}>Draft Rules</div>
        </div>

        {/* Difficulty */}
        <div style={S.section}>
          <div style={S.label}>Difficulty</div>
          <div style={S.row}>
            {DIFFICULTY.map(d => (
              <button key={d.key} style={S.pill(difficulty === d.key)} onClick={() => setDifficulty(d.key)}>
                {d.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
            {DIFFICULTY.find(d => d.key === difficulty)?.desc} available · coach always gets 1 spin
          </div>
        </div>

        {/* Rating type */}
        <div style={S.section}>
          <div style={S.label}>Player Ratings</div>
          <div style={S.row}>
            <button style={S.pill(ratingType === 'season')} onClick={() => setRatingType('season')}>📅 Season</button>
            <button style={S.pill(ratingType === 'prime')}  onClick={() => setRatingType('prime')}>⚡ Prime</button>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
            {ratingType === 'prime' ? 'Career-best potential — slightly higher than season form' : 'Reflects actual form during that specific season'}
          </div>
        </div>

        {/* Year filter */}
        <div style={S.section}>
          <div style={S.label}>{mode === 'ipl' ? 'Season Range' : 'Editions'}</div>

          {mode === 'ipl' ? (
            <>
              <DualRangeSlider
                min={minYear} max={maxYear}
                low={iplRange[0]} high={iplRange[1]}
                onChange={(lo, hi) => setIplRange([lo, hi])}
                formatLabel={v => String(v)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'All Seasons',       range: [minYear, maxYear] },
                  { label: 'Classic (2008–14)', range: [2008, 2014] },
                  { label: 'Modern (2015+)',    range: [2015, maxYear] },
                ].map(({ label, range }) => {
                  const isActive = iplRange[0] === range[0] && iplRange[1] === range[1]
                  return (
                    <button
                      key={label}
                      onClick={() => setIplRange(range)}
                      style={{
                        fontSize: '0.8rem',
                        color: isActive ? '#C8102E' : '#64748b',
                        background: isActive ? 'rgba(200,16,46,0.15)' : 'var(--border2)',
                        border: `1px solid ${isActive ? 'rgba(200,16,46,0.45)' : 'var(--border)'}`,
                        borderRadius: '0.4rem',
                        padding: '0.3rem 0.6rem',
                        cursor: 'pointer',
                        fontWeight: isActive ? 700 : 600,
                        transition: 'all 0.15s',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {allYears.map(y => (
                  <button key={y} style={S.yearChip(checkedYears.has(y))} onClick={() => toggleYear(y)}>{y}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.6rem' }}>
                <button onClick={() => setCheckedYears(new Set(allYears))} style={{ fontSize: '0.72rem', color: '#C8102E', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Select All</button>
                <button onClick={() => setCheckedYears(new Set())} style={{ fontSize: '0.72rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear All</button>
              </div>
            </>
          )}
        </div>

        {/* Draft Budget — IPL only (WC modes have no auction) */}
        {mode === 'ipl' && (
          <div style={{ ...S.section, borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={S.label}>Draft Budget</div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: '#C8102E' }}>₹{draftBudget}cr</div>
            </div>
            <SingleSlider
              min={60} max={125} step={5}
              value={draftBudget}
              onChange={setDraftBudget}
              formatLabel={v => `₹${v}cr`}
            />
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
              Starting auction purse · default ₹110cr
            </div>
          </div>
        )}

        <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', padding: '0.625rem 1.75rem', borderTop: '1px solid var(--border)' }}>
          {filteredCount} team{filteredCount !== 1 ? 's' : ''} on the wheel
        </div>
      </div>

      {/* ── Free Positions toggle (standalone card) ───────────────────── */}
      <div style={{ ...S.card, marginBottom: '0.875rem' }}>
        <ToggleRow
          icon="🔓" label="Free Positions"
          desc="Pick any player from any role with no slot restrictions. Turn off to set your team composition below."
          value={freePositions}
          onChange={setFreePositions}
          isLast
        />
      </div>

      {/* ── Composition card (shown when Free Positions is OFF) ───────── */}
      {!freePositions && (
        <div style={{ ...S.card, marginBottom: '0.875rem' }}>

          {/* Header */}
          <div style={{ padding: '1rem 1.75rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              🏟️ Choose Your Composition
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              Set your XI slots · must total exactly 11 · min 1 opener, 1 keeper
            </div>
          </div>

          {/* Presets row */}
          <div style={{ padding: '0.75rem 1.75rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {COMP_PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(p, i)} style={{
                padding: '0.35rem 0.75rem',
                background: activePreset === i ? p.color + '22' : 'var(--border2)',
                border: `1.5px solid ${activePreset === i ? p.color : 'var(--border)'}`,
                borderRadius: '999px',
                color: activePreset === i ? p.color : '#64748b',
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                transition: 'all 0.15s',
              }}>
                <span>{p.icon}</span> {p.label}
              </button>
            ))}
          </div>

          {/* Sliders + Formation */}
          <div style={{
            padding: '1.25rem 1.75rem',
            display: isMobile ? 'flex' : 'grid',
            flexDirection: isMobile ? 'column' : undefined,
            gridTemplateColumns: isMobile ? undefined : '1fr 0.72fr',
            gap: '1.5rem',
          }}>

            {/* Left: sliders + total */}
            <div>
              {ROLE_DEFS.map(def => (
                <RoleSlider key={def.key} def={def} value={comp[def.key] || 0} onDrag={handleDrag} />
              ))}

              {/* Total */}
              <div style={{ paddingTop: '0.625rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {compTotal !== 11 && (
                    <span style={{ fontSize: '0.7rem', color: compTotal < 11 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                      {compTotal < 11 ? `${11 - compTotal} more` : `${compTotal - 11} too many`}
                    </span>
                  )}
                  <span style={{ fontSize: '1.5rem', fontWeight: 900, color: compTotal === 11 ? '#22c55e' : compTotal > 11 ? '#ef4444' : '#f59e0b' }}>
                    {compTotal}/11
                  </span>
                </div>
              </div>
              {compTotal === 11 && compBowlers < 2 && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#ef4444', fontWeight: 700 }}>
                  ⚠️ Need at least 2 bowlers (pace or spin)
                </div>
              )}
            </div>

            {/* Right: pitch formation + bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ height: isMobile ? 210 : 270, flexShrink: 0 }}>
                <FormationPreview comp={comp} circleSize={isMobile ? 32 : 40} />
              </div>
              <CompositionBar comp={comp} />
            </div>
          </div>
        </div>
      )}

      {/* ── Card 2: Mode Options ──────────────────────────────────────── */}
      <div style={{ ...S.card, marginBottom: '1rem' }}>
        <div style={{ padding: '0.875rem 1.75rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mode Options</div>
        </div>

        <ToggleRow
          icon="🎯" label="Quick-Time Events"
          desc="Pause mid-match for QTE moments — century balls, hat-trick chances, key fielding decisions."
          value={enableQTEs}
          onChange={setEnableQTEs}
        />
        {mode === 'ipl' && (
          <ToggleRow
            icon="⚡" label="Bidding Wars"
            desc="Marquee players may trigger a bidding war — pay more or lose them to a rival."
            value={biddingWars}
            onChange={setBiddingWars}
          />
        )}
        {mode === 'ipl' && (
          <ToggleRow
            icon="✈️" label="Overseas Limit"
            desc="IPL rule: max 4 overseas players per XI. Turn off to draft freely across nationalities."
            value={overseasLimit}
            onChange={setOverseasLimit}
          />
        )}
        <ToggleRow
          icon="🕶️" label="Hidden Ratings"
          desc="Player ratings are hidden during the draft. Build on instinct alone."
          value={hiddenRatings}
          onChange={setHiddenRatings}
          isLast
        />
      </div>

      {/* ── START DRAFT button ────────────────────────────────────────── */}
      <div style={{ width: '100%', maxWidth: 720 }}>
        <button
          onClick={handleStart}
          disabled={!canStart}
          style={{
            width: '100%', padding: '1rem',
            background: !canStart ? 'var(--border2)' : '#C8102E',
            color: !canStart ? '#64748b' : '#fff',
            border: 'none', borderRadius: '0.75rem',
            fontSize: '1rem', fontWeight: 800,
            cursor: !canStart ? 'default' : 'pointer',
            letterSpacing: '0.04em', transition: 'background 0.15s, transform 0.1s',
          }}
          onMouseEnter={e => { if (canStart) { e.currentTarget.style.background = '#a50d24'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { e.currentTarget.style.background = !canStart ? 'var(--border2)' : '#C8102E'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          {getBtnLabel()}
        </button>
      </div>
    </div>
  )
}
