import { useState, useEffect } from 'react'
import { fetchProfile } from '../hooks/useAuth'
import { getSupabase } from '../lib/supabase'
import { getStreakData } from '../hooks/useStreak'
import { loadProfile, AWARDS } from '../hooks/useProfile'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODE_EMOJI  = { ipl: '🏏', 'odi-wc': '🌍', 't20-wc': '⚡' }
const MODE_LABEL  = { ipl: 'IPL', 'odi-wc': 'ODI WC', 't20-wc': 'T20 WC' }

function outcomeLabel(r) {
  if (r.ipl_outcome === 'champion')      return { text: 'IPL Champion',   color: '#f59e0b', icon: '🏆' }
  if (r.ipl_outcome === 'runner-up')     return { text: 'Runner-up',       color: '#94a3b8', icon: '🥈' }
  if (r.ipl_outcome === 'eliminated')    return { text: 'Playoff Exit',    color: '#C8102E', icon: '⚡' }
  if (r.ipl_outcome === 'not_qualified') return { text: 'No Playoffs',     color: 'var(--muted)', icon: '📊' }
  if (r.stage_reached === 'Champion')    return { text: 'WC Champion',     color: '#f59e0b', icon: '🏆' }
  if (r.stage_reached === 'Runner-up')   return { text: 'WC Runner-up',    color: '#94a3b8', icon: '🥈' }
  if (r.stage_reached === 'Semi-Final')  return { text: 'Semi-Final',      color: '#a78bfa', icon: '🎯' }
  if (r.stage_reached === 'Quarter-Final') return { text: 'Quarter-Final', color: 'var(--text-dim)', icon: '🎯' }
  return null
}

function rankOutcome(r) {
  if (r.ipl_outcome === 'champion' || r.stage_reached === 'Champion')   return 0
  if (r.ipl_outcome === 'runner-up' || r.stage_reached === 'Runner-up') return 1
  if (r.stage_reached === 'Semi-Final')  return 2
  if (r.stage_reached === 'Quarter-Final') return 3
  if (r.ipl_outcome === 'eliminated')    return 4
  return 5
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', marginTop: '0.25rem' }}>
      {icon && <span style={{ fontSize: '0.9rem' }}>{icon}</span>}
      <div style={{ fontSize: '0.62rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {title}
      </div>
      <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: '0.25rem' }} />
    </div>
  )
}

function StatCard({ label, value, color = 'var(--text)', sub }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--card-border)',
      borderRadius: '0.75rem', padding: '0.875rem 0.75rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '0.3rem' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  )
}

function HighlightCard({ icon, value, label, desc, color = 'var(--text)' }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--card-border)',
      borderRadius: '0.75rem', padding: '0.875rem',
      display: 'flex', flexDirection: 'column', gap: '0.2rem',
    }}>
      <div style={{ fontSize: '1.1rem' }}>{icon}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 900, color, lineHeight: 1 }}>
        {value} <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-dim)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 600, lineHeight: 1.3 }}>{desc}</div>
    </div>
  )
}

function MilestoneBadge({ icon, label, count, unlocked }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
      opacity: unlocked ? 1 : 0.35,
      filter: unlocked ? 'none' : 'grayscale(1)',
      minWidth: 60,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'var(--card)',
        border: unlocked ? '2px solid #f59e0b55' : '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.2rem',
        boxShadow: unlocked ? '0 0 12px #f59e0b22' : 'none',
      }}>
        {unlocked ? icon : '🔒'}
      </div>
      <div style={{
        fontSize: '0.62rem', fontWeight: 800,
        color: unlocked ? '#f59e0b' : 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        textAlign: 'center', maxWidth: 56, lineHeight: 1.2,
      }}>{label}</div>
      {unlocked && <div style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{count}+</div>}
    </div>
  )
}

function BestWorstCard({ result, type }) {
  if (!result) return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.75rem',
      padding: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 70,
    }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>No data yet</div>
    </div>
  )

  const isBest = type === 'best'
  const oc = outcomeLabel(result)
  const date = new Date(result.played_at).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${isBest ? '#f59e0b44' : 'var(--card-border)'}`,
      borderRadius: '0.75rem', padding: '0.875rem',
    }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 900, color: isBest ? '#f59e0b' : 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
        {isBest ? '⬆ Best' : '⬇ Worst'} · {MODE_EMOJI[result.mode]} {MODE_LABEL[result.mode]}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>
        {result.wins}W – {result.losses}L
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
        {oc && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: oc.color }}>{oc.icon} {oc.text}</span>}
        <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{date}</span>
        {result.perfect && <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>✨ Perfect</span>}
      </div>
    </div>
  )
}

function ResultRow({ result }) {
  const oc = outcomeLabel(result)
  const date = new Date(result.played_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.625rem 0.875rem',
      background: 'var(--card)', borderRadius: '0.625rem',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '0.9rem', flexShrink: 0 }}>{MODE_EMOJI[result.mode] ?? '🏏'}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ color: '#C8102E' }}>{result.wins}W</span>
          <span style={{ color: 'var(--text-dim)' }}>–</span>
          <span style={{ color: '#ef4444' }}>{result.losses}L</span>
          {result.perfect && <span style={{ fontSize: '0.62rem', color: '#f59e0b' }}>✨</span>}
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
          {MODE_LABEL[result.mode] ?? result.mode} · {date}
        </div>
      </div>
      {oc && (
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, color: oc.color,
          background: `${oc.color}18`, borderRadius: '0.4rem',
          padding: '0.25rem 0.55rem', flexShrink: 0,
        }}>
          {oc.icon} {oc.text}
        </div>
      )}
    </div>
  )
}

// ─── Cabinet card generator (Canvas) ─────────────────────────────────────────

function canvasRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function generateCabinetCard({ displayName, iplTitles, earnedAwards = [], totalSeasons, totalWins, bestSeasonWins, titlesTotal }) {
  const W = 630, PAD = 28
  const DPR = Math.max(window.devicePixelRatio || 1, 2)
  const INNER_W = W - PAD * 2
  const TILE_GAP = 8
  const COL_W = (INNER_W - TILE_GAP) / 2
  const TILE_H = 52
  const CAREER_TILE_H = 60
  const SECTION_LABEL_H = 28

  const shown = earnedAwards.slice(0, 10)
  const earnedRows = Math.max(Math.ceil(shown.length / 2), 1)
  const MEDALS_H = earnedRows * (TILE_H + TILE_GAP)

  const HEADER_Y   = 0,   HEADER_H = 56
  const NAME_Y     = HEADER_H + 10
  const DIV1_Y     = NAME_Y + 56
  const MLABEL_Y   = DIV1_Y + 14
  const MEDALS_Y   = MLABEL_Y + SECTION_LABEL_H
  const DIV2_Y     = MEDALS_Y + MEDALS_H + 10
  const CLABEL_Y   = DIV2_Y + 14
  const CTILES_Y   = CLABEL_Y + SECTION_LABEL_H
  const FOOT_Y     = CTILES_Y + CAREER_TILE_H + 16
  const H          = FOOT_Y + 44

  const canvas = document.createElement('canvas')
  canvas.width = W * DPR; canvas.height = H * DPR
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)

  // Background
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, Math.max(H * 0.6, 320))
  glow.addColorStop(0, 'rgba(200,16,46,0.08)'); glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)

  // Header
  ctx.fillStyle = '#C8102E'
  ctx.beginPath(); ctx.arc(PAD + 5, HEADER_H / 2, 5, 0, Math.PI * 2); ctx.fill()
  ctx.font = '700 12px system-ui,sans-serif'; ctx.fillStyle = '#64748b'; ctx.textAlign = 'left'
  ctx.fillText('16ZERO.IN', PAD + 18, HEADER_H / 2 + 5)
  ctx.textAlign = 'right'; ctx.font = '500 11px system-ui,sans-serif'; ctx.fillStyle = '#334155'
  ctx.fillText('Cricket Manager', W - PAD, HEADER_H / 2 + 5); ctx.textAlign = 'left'

  // Name + IPL titles box
  ctx.font = '600 11px system-ui,sans-serif'; ctx.fillStyle = '#64748b'
  ctx.fillText('HEAD COACH', PAD, NAME_Y + 8)
  ctx.font = '800 22px system-ui,sans-serif'; ctx.fillStyle = '#f1f5f9'
  const BX_LIMIT = W - PAD - 82 - 12
  let nameText = displayName || 'Coach'
  while (ctx.measureText(nameText).width > BX_LIMIT && nameText.length > 2) nameText = nameText.slice(0, -1)
  if (nameText !== (displayName || 'Coach')) nameText = nameText.slice(0, -1) + '…'
  ctx.fillText(nameText, PAD, NAME_Y + 34)

  const BW = 82, BH = 46, BX = W - PAD - BW, BY = NAME_Y
  ctx.fillStyle = '#1e293b'; canvasRoundRect(ctx, BX, BY, BW, BH, 8); ctx.fill()
  ctx.font = '800 20px system-ui,sans-serif'; ctx.fillStyle = '#f59e0b'; ctx.textAlign = 'center'
  ctx.fillText(String(titlesTotal), BX + BW / 2, BY + 26)
  ctx.font = '500 11px system-ui,sans-serif'; ctx.fillStyle = '#64748b'
  ctx.fillText('Titles', BX + BW / 2, BY + 40); ctx.textAlign = 'left'

  // Divider 1
  ctx.fillStyle = '#1e293b'; ctx.fillRect(PAD, DIV1_Y, INNER_W, 1)

  // Medals Won label
  ctx.font = '700 11px system-ui,sans-serif'; ctx.fillStyle = '#475569'; ctx.letterSpacing = '1px'
  ctx.fillText('MEDALS WON', PAD, MLABEL_Y + 14); ctx.letterSpacing = '0px'
  ctx.textAlign = 'right'; ctx.fillStyle = '#64748b'
  ctx.fillText(`${shown.length} earned`, W - PAD, MLABEL_Y + 14); ctx.textAlign = 'left'

  // Medal tiles
  shown.forEach((award, i) => {
    const col = i % 2, row = Math.floor(i / 2)
    const tx = PAD + col * (COL_W + TILE_GAP)
    const ty = MEDALS_Y + row * (TILE_H + TILE_GAP)
    ctx.fillStyle = '#1e293b'; canvasRoundRect(ctx, tx, ty, COL_W, TILE_H, 8); ctx.fill()
    ctx.font = '18px system-ui,sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(award.icon, tx + 12, ty + TILE_H / 2 + 7)
    ctx.font = '700 12px system-ui,sans-serif'; ctx.fillStyle = '#f1f5f9'
    const maxW = COL_W - 52
    let name = award.name
    while (ctx.measureText(name).width > maxW && name.length > 3) name = name.slice(0, -1)
    if (name !== award.name) name = name.slice(0, -1) + '…'
    ctx.fillText(name, tx + 42, ty + TILE_H / 2 + 1)
    if (award.desc) {
      ctx.font = '500 11px system-ui,sans-serif'; ctx.fillStyle = '#64748b'
      let desc = award.desc
      while (ctx.measureText(desc).width > maxW && desc.length > 3) desc = desc.slice(0, -1)
      if (desc !== award.desc) desc = desc.slice(0, -1) + '…'
      ctx.fillText(desc, tx + 42, ty + TILE_H / 2 + 16)
    }
  })

  // Divider 2
  ctx.fillStyle = '#1e293b'; ctx.fillRect(PAD, DIV2_Y, INNER_W, 1)

  // Career Overview
  ctx.font = '700 11px system-ui,sans-serif'; ctx.fillStyle = '#475569'; ctx.letterSpacing = '1px'
  ctx.fillText('CAREER OVERVIEW', PAD, CLABEL_Y + 14); ctx.letterSpacing = '0px'

  const stats = [
    { value: String(totalSeasons), label: 'seasons', color: '#f1f5f9' },
    { value: String(totalWins),    label: 'wins',    color: '#f1f5f9' },
    { value: `${bestSeasonWins}W`, label: 'best run', color: '#C8102E' },
    { value: String(titlesTotal),  label: 'titles',  color: '#f59e0b' },
  ]
  const SW = (INNER_W - 3 * TILE_GAP) / 4
  stats.forEach((s, i) => {
    const sx = PAD + i * (SW + TILE_GAP)
    ctx.fillStyle = '#1e293b'; canvasRoundRect(ctx, sx, CTILES_Y, SW, CAREER_TILE_H, 8); ctx.fill()
    ctx.font = '800 18px system-ui,sans-serif'; ctx.fillStyle = s.color; ctx.textAlign = 'center'
    let val = s.value
    while (ctx.measureText(val).width > SW - 12 && val.length > 1) val = val.slice(0, -1)
    ctx.fillText(val, sx + SW / 2, CTILES_Y + 34)
    ctx.font = '500 11px system-ui,sans-serif'; ctx.fillStyle = '#64748b'
    ctx.fillText(s.label, sx + SW / 2, CTILES_Y + 50)
    ctx.textAlign = 'left'
  })

  // Footer
  ctx.fillStyle = 'rgba(200,16,46,0.08)'; ctx.fillRect(0, FOOT_Y, W, H - FOOT_Y)
  ctx.strokeStyle = 'rgba(200,16,46,0.2)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, FOOT_Y); ctx.lineTo(W, FOOT_Y); ctx.stroke()
  ctx.font = '600 12px system-ui,sans-serif'; ctx.fillStyle = 'rgba(148,163,184,0.7)'; ctx.textAlign = 'left'
  ctx.fillText('Can you beat my tally?', PAD, FOOT_Y + 28)
  ctx.font = '700 12px system-ui,sans-serif'; ctx.fillStyle = '#C8102E'; ctx.textAlign = 'right'
  ctx.fillText('16zero.in', W - PAD, FOOT_Y + 28); ctx.textAlign = 'left'

  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'))
}

function TrophyCard({ award, earned }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.625rem',
      padding: '0.625rem 0.75rem',
      background: earned ? 'var(--card)' : 'var(--bg)',
      border: `1px solid ${earned ? '#f59e0b33' : 'var(--border)'}`,
      borderRadius: '0.625rem',
      opacity: earned ? 1 : 0.4,
      filter: earned ? 'none' : 'grayscale(1)',
    }}>
      <div style={{ fontSize: '1.3rem', flexShrink: 0, width: 28, textAlign: 'center' }}>
        {earned ? award.icon : '🔒'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: earned ? 'var(--text)' : 'var(--muted)', lineHeight: 1.2 }}>{award.name}</div>
        <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.15rem', lineHeight: 1.3 }}>{award.desc}</div>
      </div>
      {earned && (
        <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#f59e0b', flexShrink: 0 }}>✓</div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserProfile({ user, onClose, onSignOut }) {
  const [profile,     setProfile]     = useState(null)
  const [results,     setResults]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput,   setNameInput]   = useState('')
  const [rivals,      setRivals]      = useState([])
  const [sharingWa,   setSharingWa]   = useState(false)
  const [savingImg,   setSavingImg]   = useState(false)
  const [modeFilter,  setModeFilter]  = useState(null)  // null | 'ipl' | 'odi-wc' | 't20-wc'

  useEffect(() => {
    if (!user) return
    // Initial fetch
    fetchProfile(user.id).then(({ profile, results }) => {
      setProfile(profile)
      setResults(results)
      setNameInput(profile?.display_name ?? '')
      setLoading(false)
    })
    // Refetch after 3 s to pick up any deferred save that raced with this fetch
    const t = setTimeout(() => {
      fetchProfile(user.id).then(({ profile, results }) => {
        setProfile(profile)
        setResults(results)
      })
    }, 3000)
    return () => clearTimeout(t)
  }, [user])

  useEffect(() => {
    if (!user) return
    async function loadRivals() {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb
        .from('h2h_results')
        .select('*')
        .or(`winner_id.eq.${user.id},loser_id.eq.${user.id}`)
        .order('played_at', { ascending: false })
      if (!data) return
      const rivalMap = {}
      for (const r of data) {
        const iWon   = r.winner_id === user.id
        const oppId  = iWon ? r.loser_id   : r.winner_id
        const oppName = iWon ? r.loser_name : r.winner_name
        if (!rivalMap[oppId]) rivalMap[oppId] = { name: oppName, wins: 0, losses: 0 }
        if (iWon) rivalMap[oppId].wins++
        else      rivalMap[oppId].losses++
      }
      setRivals(Object.values(rivalMap).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)))
    }
    loadRivals()
  }, [user])

  async function saveName() {
    const sb = await getSupabase()
    await sb?.from('profiles').update({ display_name: nameInput }).eq('id', user.id)
    setProfile(p => ({ ...p, display_name: nameInput }))
    setEditingName(false)
  }

  function cabinetCardParams() {
    return {
      displayName: profile?.display_name || user?.email?.split('@')[0] || 'Coach',
      iplTitles,
      earnedAwards,
      totalSeasons,
      totalWins,
      bestSeasonWins,
      titlesTotal,
    }
  }

  async function shareOnWhatsApp() {
    setSharingWa(true)
    try {
      const waText = 'Can you beat my medals? 👉 16zero.in'
      const isMobile = /Mobi|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1
      if (isMobile) {
        // Open blank window synchronously to hold user gesture token
        const win = window.open('', '_blank')
        try {
          const blob = await generateCabinetCard(cabinetCardParams())
          const file = new File([blob], 'my-medals-16zero.png', { type: 'image/png' })
          if (navigator.canShare?.({ files: [file] })) {
            win?.close()
            await navigator.share({ files: [file], text: waText })
          } else {
            win.location.href = `https://wa.me/?text=${encodeURIComponent(waText)}`
          }
        } catch { win?.close() }
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, '_blank')
      }
    } finally {
      setSharingWa(false)
    }
  }

  async function saveImage() {
    setSavingImg(true)
    try {
      const blob = await generateCabinetCard(cabinetCardParams())
      if (!blob) return
      const isMobile = /Mobi|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1
      if (isMobile && navigator.share) {
        try {
          const file = new File([blob], 'my-medals-16zero.png', { type: 'image/png' })
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file] })
            return
          }
        } catch { /* fall through to download */ }
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'my-medals-16zero.png'; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setSavingImg(false)
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const activeResults  = modeFilter ? results.filter(r => r.mode === modeFilter) : results

  // When a mode pill is active, compute from filtered results; otherwise use profile aggregates (authoritative)
  const totalSeasons   = modeFilter ? activeResults.length : (profile?.total_games  ?? 0)
  const totalWins      = modeFilter ? activeResults.reduce((s, r) => s + (r.wins ?? 0), 0)   : (profile?.total_wins   ?? 0)
  const totalLosses    = modeFilter ? activeResults.reduce((s, r) => s + (r.losses ?? 0), 0) : (profile?.total_losses ?? 0)
  const bestSeasonWins = modeFilter
    ? (activeResults.length > 0 ? Math.max(...activeResults.map(r => r.wins ?? 0)) : 0)
    : (profile?.best_streak ?? 0)
  const totalMatches   = totalWins + totalLosses
  const overallWinPct  = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0

  const iplResults     = activeResults.filter(r => r.mode === 'ipl')
  const wcResults      = activeResults.filter(r => r.mode !== 'ipl')
  const iplTitles      = iplResults.filter(r => r.ipl_outcome === 'champion').length
  const wcTitles       = wcResults.filter(r => r.stage_reached === 'Champion').length
  const perfectSeasons = activeResults.filter(r => r.perfect).length
  const playoffApps    = iplResults.filter(r => r.ipl_outcome && r.ipl_outcome !== 'not_qualified').length
  const wcChampions    = wcResults.filter(r => r.stage_reached === 'Champion').length
  const wcSemis        = wcResults.filter(r => ['Champion','Runner-up','Semi-Final'].includes(r.stage_reached)).length

  const sortedByBest = [...activeResults].sort((a, b) => rankOutcome(a) - rankOutcome(b) || b.wins - a.wins)
  const bestSeason   = sortedByBest[0] ?? null
  const worstSeason  = sortedByBest[sortedByBest.length - 1] ?? null

  const { streak: loginStreak } = getStreakData()

  // Local awards (stored in localStorage, not Supabase)
  const localProfile  = loadProfile()
  const earnedIds     = new Set(localProfile.awards ?? [])
  const earnedAwards  = AWARDS.filter(a => earnedIds.has(a.id))
  const lockedAwards  = AWARDS.filter(a => !earnedIds.has(a.id))

  const MILESTONES = [
    { count: 1,   icon: '🏏', label: 'First Season' },
    { count: 5,   icon: '📅', label: '5 Seasons' },
    { count: 10,  icon: '🎯', label: '10 Seasons' },
    { count: 25,  icon: '⭐', label: '25 Seasons' },
    { count: 50,  icon: '🏆', label: '50 Seasons' },
    { count: 100, icon: '💯', label: '100 Seasons' },
  ]

  const initial = (profile?.display_name || user?.email || '?')[0].toUpperCase()
  const titlesTotal = iplTitles + wcTitles
  const isMobileDevice = /Mobi|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1500,
      background: 'var(--bg)',
      overflowY: 'auto',
      animation: 'fade-in 0.2s ease both',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.25rem 1rem 5rem' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <button
            onClick={onClose}
            style={{ background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E', fontSize: '0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em' }}
          >
            ← Back
          </button>
          <button
            onClick={onSignOut}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: '0.4rem', color: 'var(--muted)',
              fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              padding: '0.3rem 0.65rem', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
          >
            Sign out
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', paddingTop: '4rem' }}>Loading...</div>
        ) : (
          <>
            {/* ── Avatar + Name ────────────────────────────────────────────── */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: '#C8102E',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.75rem', fontWeight: 900, color: '#fff',
                margin: '0 auto 0.875rem',
                boxShadow: '0 0 24px #C8102E44',
              }}>
                {initial}
              </div>

              {editingName ? (
                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                  <input
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    autoFocus
                    style={{ padding: '0.4rem 0.75rem', background: 'var(--bg)', border: '1px solid #C8102E', borderRadius: '0.4rem', color: 'var(--text)', fontSize: '1rem', fontWeight: 700, textAlign: 'center' }}
                  />
                  <button onClick={saveName} style={{ background: '#C8102E', border: 'none', borderRadius: '0.4rem', color: '#fff', fontWeight: 800, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>✓</button>
                  <button onClick={() => setEditingName(false)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.4rem', color: 'var(--muted)', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)' }}>
                    {profile?.display_name || user?.email?.split('@')[0]}
                  </div>
                  <button
                    onClick={() => setEditingName(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                    title="Edit name"
                  >✏️</button>
                </div>
              )}
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{user?.email}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                Manager since {new Date(user?.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </div>
            </div>

            {/* ── Mode filter pills ────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {[
                { key: 'ipl',    label: '🏏 IPL',    color: '#C8102E' },
                { key: 'odi-wc', label: '🌍 ODI WC', color: '#3b82f6' },
                { key: 't20-wc', label: '⚡ T20 WC', color: '#f59e0b' },
              ].map(({ key, label, color }) => {
                const active = modeFilter === key
                return (
                  <button
                    key={key}
                    onClick={() => setModeFilter(active ? null : key)}
                    style={{
                      padding: '0.4rem 1rem',
                      background: active ? `${color}22` : 'var(--card)',
                      border: `1px solid ${active ? color : 'var(--border)'}`,
                      borderRadius: '2rem',
                      color: active ? color : 'var(--muted)',
                      fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* ── Career Overview ──────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <SectionHeader title="Career Overview" icon="📊" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                <StatCard label="Seasons" value={totalSeasons} />
                <StatCard label="All-Time Wins" value={totalWins} color="#C8102E" />
                <StatCard label="Win Rate" value={`${overallWinPct}%`} color={overallWinPct >= 60 ? '#f59e0b' : 'var(--text)'} />
                <StatCard
                  label="Best Season"
                  value={`${bestSeasonWins}W`}
                  color="#f59e0b"
                  sub="wins in one run"
                />
                <StatCard
                  label="Titles"
                  value={titlesTotal || '—'}
                  color={titlesTotal > 0 ? '#f59e0b' : 'var(--muted)'}
                  sub={
                    iplTitles > 0 && wcTitles > 0 ? `${iplTitles} IPL · ${wcTitles} WC`
                    : iplTitles > 0 ? `${iplTitles} IPL 🏏`
                    : wcTitles > 0 ? `${wcTitles} WC 🌍`
                    : 'yet to win one'
                  }
                />
                <StatCard
                  label="Perfect"
                  value={perfectSeasons || '—'}
                  color={perfectSeasons > 0 ? '#f59e0b' : 'var(--muted)'}
                  sub="zero-loss seasons"
                />
              </div>
            </div>

            {/* ── Highlights ───────────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <SectionHeader title="Highlights" icon="⚡" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <HighlightCard
                  icon="🔥"
                  value={loginStreak}
                  label="day streak"
                  desc="Consecutive days opening the app"
                  color={loginStreak >= 7 ? '#f59e0b' : loginStreak >= 3 ? '#fb923c' : 'var(--text)'}
                />
                {modeFilter && modeFilter !== 'ipl' ? (
                  <HighlightCard
                    icon="🏆"
                    value={wcChampions}
                    label="champion"
                    desc={`${modeFilter === 'odi-wc' ? 'ODI' : 'T20'} WC titles won`}
                    color={wcChampions > 0 ? '#f59e0b' : 'var(--muted)'}
                  />
                ) : (
                  <HighlightCard
                    icon="🏏"
                    value={playoffApps}
                    label="playoff runs"
                    desc="IPL playoff appearances (last 20)"
                    color={playoffApps >= 5 ? '#f59e0b' : '#C8102E'}
                  />
                )}
                <HighlightCard
                  icon="🎯"
                  value={bestSeasonWins}
                  label="best season"
                  desc="Most wins in a single season"
                  color={bestSeasonWins >= 12 ? '#f59e0b' : 'var(--text)'}
                />
                <HighlightCard
                  icon="✨"
                  value={perfectSeasons}
                  label="perfect seasons"
                  desc="Completed without a single loss"
                  color={perfectSeasons > 0 ? '#f59e0b' : 'var(--muted)'}
                />
              </div>
            </div>

            {/* ── Season Milestones ────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <SectionHeader title="Season Milestones" icon="🎖️" />
              <div style={{
                display: 'flex', gap: '0.625rem', overflowX: 'auto',
                paddingBottom: '0.5rem', scrollbarWidth: 'none',
              }}>
                {MILESTONES.map(m => (
                  <MilestoneBadge
                    key={m.count}
                    icon={m.icon}
                    label={m.label}
                    count={m.count}
                    unlocked={totalSeasons >= m.count}
                  />
                ))}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.5rem', textAlign: 'center' }}>
                {totalSeasons} season{totalSeasons !== 1 ? 's' : ''} played
                {MILESTONES.find(m => m.count > totalSeasons) &&
                  ` · ${MILESTONES.find(m => m.count > totalSeasons).count - totalSeasons} more for next badge`}
              </div>
            </div>

            {/* ── Best & Worst Season ──────────────────────────────────────── */}
            {activeResults.length > 0 && (
              <div style={{ marginBottom: '1.75rem' }}>
                <SectionHeader title="Best & Worst Season" icon="📈" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <BestWorstCard result={bestSeason}  type="best" />
                  <BestWorstCard result={worstSeason} type="worst" />
                </div>
              </div>
            )}

            {/* ── Medals Won ───────────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.9rem' }}>🏅</span>
                <div style={{ fontSize: '0.62rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Medals Won · {earnedAwards.length} / {AWARDS.length}
                </div>
                <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: '0.25rem' }} />
                {earnedAwards.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    {isMobileDevice && (
                      <button
                        onClick={shareOnWhatsApp}
                        disabled={sharingWa}
                        style={{
                          background: 'none', border: '1px solid var(--border)',
                          borderRadius: '0.4rem', color: 'var(--muted)',
                          fontSize: '0.7rem', fontWeight: 700, cursor: sharingWa ? 'default' : 'pointer',
                          padding: '0.3rem 0.65rem', opacity: sharingWa ? 0.6 : 1,
                          transition: 'color 0.15s, border-color 0.15s',
                        }}
                      >
                        {sharingWa ? '⏳' : '↗'} WhatsApp
                      </button>
                    )}
                    <button
                      onClick={saveImage}
                      disabled={savingImg}
                      style={{
                        background: 'none', border: '1px solid var(--border)',
                        borderRadius: '0.4rem', color: 'var(--muted)',
                        fontSize: '0.7rem', fontWeight: 700, cursor: savingImg ? 'default' : 'pointer',
                        padding: '0.3rem 0.65rem', opacity: savingImg ? 0.6 : 1,
                        transition: 'color 0.15s, border-color 0.15s',
                      }}
                    >
                      {savingImg ? '⏳' : '⬇'} Save image
                    </button>
                  </div>
                )}
              </div>
              {earnedAwards.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '1.5rem',
                  background: 'var(--card)', borderRadius: '0.75rem',
                  border: '1px solid var(--card-border)',
                  color: 'var(--muted)', fontSize: '0.82rem',
                }}>
                  No medals yet — play seasons to start earning them.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                  {earnedAwards.map(a => <TrophyCard key={a.id} award={a} earned />)}
                </div>
              )}
              {lockedAwards.length > 0 && earnedAwards.length > 0 && (
                <details style={{ marginTop: '0.625rem' }}>
                  <summary style={{ fontSize: '0.65rem', color: 'var(--muted)', cursor: 'pointer', fontWeight: 600, padding: '0.25rem 0', userSelect: 'none' }}>
                    +{lockedAwards.length} locked {lockedAwards.length === 1 ? 'medal' : 'medals'} to discover
                  </summary>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.4rem' }}>
                    {lockedAwards.map(a => <TrophyCard key={a.id} award={a} earned={false} />)}
                  </div>
                </details>
              )}
              {earnedAwards.length === 0 && lockedAwards.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.75rem' }}>
                  {lockedAwards.slice(0, 4).map(a => <TrophyCard key={a.id} award={a} earned={false} />)}
                </div>
              )}
            </div>

            {/* ── Rivals ──────────────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.75rem' }}>
              <SectionHeader title="Multiplayer Rivals" icon="⚔️" />
              {rivals.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '1.5rem',
                  background: 'var(--card)', borderRadius: '0.75rem',
                  border: '1px solid var(--card-border)',
                  color: 'var(--muted)', fontSize: '0.82rem',
                }}>
                  No multiplayer matches yet — play an H2H draft to see your rivals here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {rivals.map((r, i) => {
                    const total = r.wins + r.losses
                    const winPct = total > 0 ? Math.round((r.wins / total) * 100) : 0
                    const leading = r.wins > r.losses
                    const behind  = r.losses > r.wins
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.625rem 0.875rem',
                        background: 'var(--card)', borderRadius: '0.625rem',
                        border: `1px solid ${leading ? '#C8102E44' : behind ? '#ef444433' : 'var(--border)'}`,
                      }}>
                        <div style={{ fontSize: '0.9rem', flexShrink: 0 }}>⚔️</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text)' }}>{r.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
                            {total} match{total !== 1 ? 'es' : ''} · {winPct}% win rate
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 900, lineHeight: 1 }}>
                            <span style={{ color: '#C8102E' }}>{r.wins}W</span>
                            <span style={{ color: 'var(--text-dim)', margin: '0 0.2rem' }}>–</span>
                            <span style={{ color: '#ef4444' }}>{r.losses}L</span>
                          </div>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, marginTop: '0.2rem', color: leading ? '#22c55e' : behind ? '#ef4444' : 'var(--muted)' }}>
                            {leading ? 'You lead' : behind ? 'They lead' : 'Even'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Recent Seasons ───────────────────────────────────────────── */}
            <div>
              <SectionHeader
                title={`Recent Seasons${activeResults.length > 0 ? ` (${activeResults.length})` : ''}`}
                icon="📋"
              />
              {activeResults.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '2.5rem',
                  background: 'var(--card)', borderRadius: '0.75rem',
                  border: '1px solid var(--card-border)',
                  color: 'var(--muted)', fontSize: '0.85rem',
                }}>
                  No seasons yet — play a run to see your history here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {activeResults.map(r => <ResultRow key={r.id} result={r} />)}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
