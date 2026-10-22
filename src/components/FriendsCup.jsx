import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase } from '../lib/supabase.js'
import CupSettingsScreen from './CupSettingsScreen.jsx'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let c = ''
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)]
  return c
}

function getAnonId() {
  let id = localStorage.getItem('live_cup_anon_id')
  if (!id) { id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; localStorage.setItem('live_cup_anon_id', id) }
  return id
}

function saveSession(roomId, code, mode) {
  try { sessionStorage.setItem('fcup_session', JSON.stringify({ roomId, code, mode })) } catch {}
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem('fcup_session') ?? 'null') } catch { return null }
}
function clearSession() {
  try { sessionStorage.removeItem('fcup_session') } catch {}
}

function stageRank(s) {
  if (!s) return 0
  const m = { 'Champion': 6, 'Finalist': 5, 'Semi-Finalist': 4, 'Quarter-Finalist': 3, 'Group Stage': 2, 'League Stage': 1 }
  for (const [k, v] of Object.entries(m)) if (s.includes(k)) return v
  return 0
}

function weekKey() {
  // Not needed here but handy
}

// ─── Shared UI bits ───────────────────────────────────────────────────────────

const Card = ({ children, style }) => (
  <div style={{ background: 'rgba(8,8,14,0.72)', border: '1.5px solid rgba(255,255,255,0.11)', borderRadius: '1rem', padding: '1.25rem', ...style }}>
    {children}
  </div>
)

const PrimaryBtn = ({ onClick, disabled, children, style }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '0.75rem 1.5rem', background: disabled ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg,#C8102E,#9b0e24)',
    color: disabled ? 'rgba(255,255,255,0.3)' : '#fff', border: 'none', borderRadius: '0.625rem',
    fontSize: '0.9rem', fontWeight: 800, cursor: disabled ? 'default' : 'pointer', ...style,
  }}>{children}</button>
)

const GhostBtn = ({ onClick, children, style }) => (
  <button onClick={onClick} style={{
    padding: '0.5rem 1rem', background: 'none', color: 'rgba(255,255,255,0.45)',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: '0.5rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', ...style,
  }}>{children}</button>
)

// ─── Stage label helper ───────────────────────────────────────────────────────
function stageLabel(r) {
  if (r.ipl_outcome === 'Champion') return '🏆 Champion'
  if (r.ipl_outcome === 'Finalist') return '🥈 Finalist'
  if (r.ipl_outcome) return r.ipl_outcome
  if (r.stage_reached) return r.stage_reached
  return `${r.wins}W-${r.losses}L`
}

// ─── Playoff bracket (top 4 by wins, then stage, then losses) ────────────────
function buildBracket(results) {
  const sorted = [...results].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (stageRank(b.stage_reached) !== stageRank(a.stage_reached)) return stageRank(b.stage_reached) - stageRank(a.stage_reached)
    return a.losses - b.losses
  })
  const top4 = sorted.slice(0, 4)
  if (top4.length < 2) return null
  // S1: #1 vs #4, S2: #2 vs #3, Final: winners
  const s1winner = top4[0]  // higher seed always advances in this simple model
  const s2winner = top4[1]
  return {
    semi1: { a: top4[0], b: top4[3] ?? null, winner: s1winner },
    semi2: { a: top4[1], b: top4[2] ?? null, winner: s2winner },
    final: { a: s1winner, b: s2winner, winner: s1winner },  // #1 seed wins
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FriendsCup({ user, onStartSeason, onHome, joinCode: propJoinCode = null }) {
  const [savedSession] = useState(() => loadSession())
  const [phase, setPhase] = useState(() => savedSession ? 'lobby' : 'entry')
  const [myId]           = useState(() => user?.id ?? getAnonId())
  const [nameInput, setNameInput] = useState(() => localStorage.getItem('live_cup_display_name') || user?.email?.split('@')[0] || '')
  const [joinInput, setJoinInput] = useState(() => propJoinCode ?? '')
  const [joinError, setJoinError] = useState('')
  const [createError, setCreateError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [pendingCupMode, setPendingCupMode] = useState('ipl')
  const [pendingCupSettings, setPendingCupSettings] = useState(null)

  const [room, setRoom]       = useState(null)
  const [players, setPlayers] = useState([])  // from friends_cup_results
  const [myResult, setMyResult] = useState(null)
  const [countdown, setCountdown] = useState(null) // seconds left in next-season timer
  const hasStartedNextRef  = useRef(false) // prevent double-trigger when timer fires
  const isReadyForNextRef  = useRef(false) // always-fresh: is current player in readyPlayers?

  const isMobile = window.innerWidth <= 640
  const subRef = useRef([])

  useEffect(() => {
    if (savedSession?.roomId) subscribeToRoom(savedSession.roomId)
    return () => subRef.current.forEach(s => { try { s.unsubscribe() } catch {} })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep isReadyForNextRef fresh so the timer closure never reads stale readyPlayers
  useEffect(() => {
    const readyPlayers = room?.settings?.nextSeason?.readyPlayers ?? []
    isReadyForNextRef.current = readyPlayers.includes(myId)
  }, [room?.settings?.nextSeason?.readyPlayers, myId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Next-season countdown timer ─────────────────────────────────────────────
  useEffect(() => {
    const meta = room?.settings?.nextSeason
    if (!meta?.startsAt) { setCountdown(null); return }
    hasStartedNextRef.current = false
    function tick() {
      const remaining = Math.max(0, Math.ceil((meta.startsAt - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining <= 0 && !hasStartedNextRef.current && isReadyForNextRef.current) {
        hasStartedNextRef.current = true
        handlePlaySeason()
      }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [room?.settings?.nextSeason?.startsAt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill join code from deep link prop
  useEffect(() => {
    if (propJoinCode && phase === 'entry') setJoinInput(propJoinCode)
  }, [propJoinCode, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const subscribeToRoom = useCallback(async (roomId) => {
    const sb = await getSupabase()
    if (!sb) return

    async function loadRoom() {
      const { data } = await sb.from('friends_cup_rooms').select('*').eq('id', roomId).single()
      if (data) setRoom(data)
    }
    async function loadResults() {
      const { data } = await sb.from('friends_cup_results').select('*').eq('room_id', roomId).order('wins', { ascending: false })
      if (data) {
        setPlayers(data)
        const mine = data.find(r => r.player_id === myId)
        if (mine) setMyResult(mine)
      }
    }

    await Promise.all([loadRoom(), loadResults()])

    const resSub = sb.channel(`fcup_results_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends_cup_results', filter: `room_id=eq.${roomId}` },
        () => loadResults())
      .subscribe()

    // Subscribe to room changes (settings updates — used for next-season timer)
    const roomSub = sb.channel(`fcup_room_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friends_cup_rooms', filter: `id=eq.${roomId}` },
        (payload) => { if (payload.new) setRoom(payload.new) })
      .subscribe()

    subRef.current = [resSub, roomSub]
  }, [myId])

  // ── Create room — step 1: go to settings screen ─────────────────────────────
  function handleCreateClick() {
    if (!nameInput.trim()) return
    setPhase('cup-settings')
  }

  // ── Create room — step 2: settings confirmed, create room in DB ──────────────
  async function handleSettingsConfirm(cupMode, cupSettings) {
    setPendingCupMode(cupMode)
    setPendingCupSettings(cupSettings)
    const name = nameInput.trim()
    setIsCreating(true)
    setCreateError('')
    try {
      const sb = await getSupabase()
      if (!sb) throw new Error('No connection')
      let code, attempt = 0
      do {
        code = genCode()
        const { data } = await sb.from('friends_cup_rooms').select('id').eq('code', code).maybeSingle()
        if (!data) break
      } while (++attempt < 5)

      // Strip computed fields before storing (filteredEntries is too large for DB)
      const { filteredEntries, composition, hardMode, ...dbSettings } = cupSettings

      // Try full insert with mode + settings; fall back to minimal insert if table columns are missing
      let roomData
      const { data: d1, error: e1 } = await sb.from('friends_cup_rooms')
        .insert({ code, host_id: myId, mode: cupMode, settings: dbSettings })
        .select().single()
      if (e1) {
        console.warn('Full insert failed, trying minimal insert:', e1.message)
        const { data: d2, error: e2 } = await sb.from('friends_cup_rooms')
          .insert({ code, host_id: myId })
          .select().single()
        if (e2) throw e2
        // Attach mode + settings locally so the session and room state are correct
        roomData = { ...d2, mode: cupMode, settings: dbSettings }
      } else {
        roomData = d1
      }

      await sb.from('friends_cup_results').upsert({ room_id: roomData.id, player_id: myId, display_name: name, wins: 0, losses: 0 }, { onConflict: 'room_id,player_id' })

      localStorage.setItem('live_cup_display_name', name)
      setRoom(roomData)
      saveSession(roomData.id, roomData.code, roomData.mode)
      await subscribeToRoom(roomData.id)
      setPhase('lobby')
    } catch (e) {
      console.error(e)
      setCreateError(e?.message || 'Failed to create room. Please try again.')
    } finally { setIsCreating(false) }
  }

  // ── Join room ────────────────────────────────────────────────────────────────
  async function handleJoin() {
    const name = nameInput.trim()
    const code = joinInput.trim().toUpperCase()
    if (!name || !code) return
    setJoinError('')
    const sb = await getSupabase()
    if (!sb) { setJoinError('No connection'); return }

    const { data: roomData } = await sb.from('friends_cup_rooms').select('*').eq('code', code).maybeSingle()
    if (!roomData) { setJoinError('Room not found.'); return }

    await sb.from('friends_cup_results').upsert({ room_id: roomData.id, player_id: myId, display_name: name, wins: 0, losses: 0 }, { onConflict: 'room_id,player_id' })

    localStorage.setItem('live_cup_display_name', name)
    setRoom(roomData)
    saveSession(roomData.id, roomData.code, roomData.mode)
    await subscribeToRoom(roomData.id)
    setPhase('lobby')
  }

  // ── Start season ─────────────────────────────────────────────────────────────
  async function handlePlaySeason() {
    const roomId   = room?.id   ?? savedSession?.roomId
    const roomMode = room?.mode ?? savedSession?.mode ?? 'ipl'
    const name     = nameInput.trim() || localStorage.getItem('live_cup_display_name') || 'Player'
    const roomSettings = room?.settings ?? {}

    // Clear nextSeason timer from DB so it doesn't re-trigger for latecomers
    if (roomId && room?.settings?.nextSeason) {
      try {
        const sb = await getSupabase()
        if (sb) {
          const { nextSeason: _removed, ...restSettings } = room.settings
          await sb.from('friends_cup_rooms').update({ settings: restSettings }).eq('id', roomId)
        }
      } catch { /* ignore — best effort */ }
    }

    onStartSeason({ roomId, playerId: myId, displayName: name }, roomMode, roomSettings)
  }

  // ── Host: initiate next season (20s ready timer) ────────────────────────────
  async function handleInitNextSeason() {
    if (!room) return
    const sb = await getSupabase()
    if (!sb) return
    const newMeta = { startsAt: Date.now() + 20000, readyPlayers: [myId] }
    await sb.from('friends_cup_rooms').update({
      settings: { ...(room.settings ?? {}), nextSeason: newMeta },
    }).eq('id', room.id)
    // Optimistic local update so host sees the countdown immediately
    setRoom(r => ({ ...r, settings: { ...(r?.settings ?? {}), nextSeason: newMeta } }))
  }

  // ── Any player: mark themselves ready for next season ───────────────────────
  async function handleMarkReady() {
    if (!room) return
    const sb = await getSupabase()
    if (!sb) return
    const meta = room.settings?.nextSeason ?? {}
    const readyPlayers = meta.readyPlayers ?? []
    if (readyPlayers.includes(myId)) return
    const newMeta = { ...meta, readyPlayers: [...readyPlayers, myId] }
    await sb.from('friends_cup_rooms').update({
      settings: { ...(room.settings ?? {}), nextSeason: newMeta },
    }).eq('id', room.id)
    setRoom(r => ({ ...r, settings: { ...(r?.settings ?? {}), nextSeason: newMeta } }))
  }

  // ── Host: force-start immediately ───────────────────────────────────────────
  async function handleStartNow() {
    if (!room) return
    const sb = await getSupabase()
    if (!sb) return
    const meta = room.settings?.nextSeason ?? {}
    // Push startsAt to the past so all clients' timers fire immediately
    const newMeta = { ...meta, startsAt: Date.now() - 1 }
    await sb.from('friends_cup_rooms').update({
      settings: { ...(room.settings ?? {}), nextSeason: newMeta },
    }).eq('id', room.id)
    setRoom(r => ({ ...r, settings: { ...(r?.settings ?? {}), nextSeason: newMeta } }))
  }

  // ── Called by App.jsx after sim completes ────────────────────────────────────
  // (called via the friendsCupCtx mechanism in App.jsx)

  // ── Wrap ─────────────────────────────────────────────────────────────────────
  const wrap = (content) => (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isMobile ? '1.25rem 1rem' : '2rem 1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button onClick={onHome} style={{ background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E', fontSize: '0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em' }}>← Home</button>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>👥 Friends Cup</div>
        </div>
        {content}
      </div>
    </div>
  )

  // ── Entry ────────────────────────────────────────────────────────────────────
  if (phase === 'entry') return wrap(<>
    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
      <div style={{ fontSize: isMobile ? '1.8rem' : '2.2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.35rem' }}>👥 Friends Cup</div>
      <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Private cup with your mates. Everyone sims their own season — highest W-L wins.</div>
    </div>

    <Card style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Your name</div>
      <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="e.g. Aryaman" maxLength={24}
        style={{ width: '100%', padding: '0.625rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.5rem', color: 'var(--text)', fontSize: '0.9rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
    </Card>

    <Card style={{ marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.25rem' }}>🏠 Create a room</div>
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>Share the 6-letter code with friends.</div>
      <PrimaryBtn onClick={handleCreateClick} disabled={!nameInput.trim()} style={{ width: '100%' }}>
        Set Rules & Create →
      </PrimaryBtn>
    </Card>

    <Card>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.5rem' }}>🔗 Join a room</div>
      <input value={joinInput} onChange={e => { setJoinInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setJoinError('') }}
        placeholder="6-letter code" maxLength={6}
        style={{ width: '100%', padding: '0.625rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: `1px solid ${joinError ? '#ef4444' : 'rgba(255,255,255,0.12)'}`, borderRadius: '0.5rem', color: 'var(--text)', fontSize: '0.9rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.5rem' }} />
      {joinError && <div style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: '0.5rem' }}>{joinError}</div>}
      <PrimaryBtn onClick={handleJoin} disabled={!nameInput.trim() || joinInput.length < 6} style={{ width: '100%' }}>Join Room →</PrimaryBtn>
    </Card>
  </>)

  // ── Cup settings (host only, before room is created) ─────────────────────────
  if (phase === 'cup-settings') return wrap(<>
    <CupSettingsScreen
      onConfirm={handleSettingsConfirm}
      onBack={() => { setPhase('entry'); setCreateError('') }}
      compact
      saveLabel={isCreating ? 'Creating…' : 'Create Room →'}
    />
    {createError && (
      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.875rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '0.5rem', fontSize: '0.78rem', color: '#ef4444', fontWeight: 700 }}>
        ⚠️ {createError}
      </div>
    )}
  </>)

  // ── Lobby / results ───────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    const roomCode   = room?.code ?? savedSession?.code ?? '……'
    const haveResult = !!myResult?.stage_reached || (myResult?.wins > 0 || myResult?.losses > 0)
    const bracket    = players.length >= 2 ? buildBracket(players.filter(p => p.stage_reached || p.wins > 0 || p.losses > 0)) : null
    const anyResults = players.some(p => p.stage_reached || p.wins > 0)

    return wrap(<>
      <Card style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>Room Code</div>
        <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '0.18em', marginBottom: '0.25rem' }}>{roomCode}</div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => { try { navigator.clipboard.writeText(`https://16zero.in/#fcup=${roomCode}`) } catch {} }}
            style={{ fontSize: '0.72rem', color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem' }}>
            📋 Copy Link
          </button>
          <button onClick={() => {
            const hostName = players.find(p => p.player_id === room?.host_id)?.display_name || nameInput.trim() || 'A friend'
            const shareUrl = `https://16zero.in/#fcup=${roomCode}`
            const text = `Join ${hostName}'s Friends Cup 🏏\n${shareUrl}`
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
          }} style={{ fontSize: '0.72rem', color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem' }}>
            💬 Share on WhatsApp
          </button>
        </div>
      </Card>

      {/* Leaderboard */}
      <Card style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.625rem' }}>
          📊 Standings ({players.length} player{players.length !== 1 ? 's' : ''})
        </div>
        {players.length === 0 ? (
          <div style={{ fontSize: '0.78rem', color: '#475569', textAlign: 'center', padding: '0.875rem' }}>Waiting for players…</div>
        ) : (
          <>
            {/* Column header */}
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 32px 32px 32px 42px', gap: '0.2rem', padding: '0 0.5rem 0.35rem', fontSize: '0.58rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <div>#</div><div>Player</div>
              <div style={{ textAlign: 'center' }}>P</div>
              <div style={{ textAlign: 'center' }}>W</div>
              <div style={{ textAlign: 'center' }}>L</div>
              <div style={{ textAlign: 'center' }}>Pts</div>
            </div>
            {players
              .slice()
              .sort((a, b) => {
                const ptsA = (a.wins ?? 0) * 2, ptsB = (b.wins ?? 0) * 2
                if (ptsB !== ptsA) return ptsB - ptsA
                return stageRank(b.stage_reached) - stageRank(a.stage_reached)
              })
              .map((p, idx) => {
                const played = (p.wins ?? 0) + (p.losses ?? 0)
                const pts = (p.wins ?? 0) * 2
                const isMe = p.player_id === myId
                return (
                  <div key={p.player_id} style={{
                    display: 'grid', gridTemplateColumns: '24px 1fr 32px 32px 32px 42px', gap: '0.2rem',
                    alignItems: 'center', padding: '0.4rem 0.5rem', marginBottom: '0.2rem',
                    background: isMe ? 'rgba(200,16,46,0.08)' : idx === 0 && pts > 0 ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isMe ? 'rgba(200,16,46,0.25)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: '0.5rem', fontSize: '0.78rem',
                  }}>
                    <div style={{ fontWeight: 800, color: idx === 0 && pts > 0 ? '#f59e0b' : idx < 4 ? '#22c55e' : '#64748b', textAlign: 'center' }}>
                      {idx < 4 ? `Q${idx + 1}` : idx + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.display_name}{isMe ? ' ★' : ''}
                      </div>
                      {(p.stage_reached || p.ipl_outcome) && (
                        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{stageLabel(p)}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', color: '#64748b' }}>{played || '–'}</div>
                    <div style={{ textAlign: 'center', color: '#22c55e', fontWeight: 700 }}>{p.wins ?? 0}</div>
                    <div style={{ textAlign: 'center', color: '#ef4444', fontWeight: 700 }}>{p.losses ?? 0}</div>
                    <div style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 900 }}>{pts}</div>
                  </div>
                )
              })}
          </>
        )}
      </Card>

      {/* Playoff bracket if ≥ 4 results in */}
      {bracket && anyResults && (
        <Card style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f59e0b', marginBottom: '0.75rem' }}>🏆 Playoff Bracket</div>
          {[
            { label: 'Semi-Final 1', m: bracket.semi1 },
            { label: 'Semi-Final 2', m: bracket.semi2 },
            { label: 'Final',        m: bracket.final  },
          ].map(({ label, m }) => m.b ? (
            <div key={label} style={{ marginBottom: '0.625rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{label}</div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 800, color: m.winner.player_id === m.a.player_id ? '#22c55e' : 'var(--text)' }}>{m.a.display_name}</span>
                <span style={{ color: '#475569' }}>vs</span>
                <span style={{ fontWeight: 800, color: m.winner.player_id === m.b.player_id ? '#22c55e' : 'var(--text)' }}>{m.b.display_name}</span>
                <span style={{ marginLeft: 'auto', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 800 }}>→ {m.winner.display_name}</span>
              </div>
            </div>
          ) : null)}
        </Card>
      )}

      {/* Play / replay / next-season section */}
      {(() => {
        const amHost = room?.host_id === myId
        const nextSeasonMeta = room?.settings?.nextSeason
        const readyPlayers = nextSeasonMeta?.readyPlayers ?? []
        const iAmReady = readyPlayers.includes(myId)
        const nextSeasonActive = !!nextSeasonMeta?.startsAt

        // If next-season timer is active: show countdown + ready/start-now UI
        if (nextSeasonActive) {
          return (
            <Card style={{ marginBottom: '0.625rem', background: 'rgba(34,197,94,0.07)', borderColor: 'rgba(34,197,94,0.3)' }}>
              <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
                  ⏱ Next Season Starting
                </div>
                {countdown !== null && countdown > 0 ? (
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>
                    {countdown}s
                  </div>
                ) : (
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#22c55e' }}>Starting…</div>
                )}
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.3rem' }}>
                  {readyPlayers.length} / {players.length} ready
                </div>
              </div>
              {!iAmReady ? (
                <PrimaryBtn onClick={handleMarkReady} style={{ width: '100%', marginBottom: '0.5rem', background: 'linear-gradient(135deg,#22c55e,#15803d)' }}>
                  ✓ I'm Ready!
                </PrimaryBtn>
              ) : (
                <div style={{ textAlign: 'center', fontSize: '0.82rem', color: '#22c55e', fontWeight: 800, marginBottom: '0.5rem' }}>
                  ✓ You're in for next season
                </div>
              )}
              {amHost && (
                <GhostBtn onClick={handleStartNow} style={{ width: '100%' }}>
                  🚀 Start Now
                </GhostBtn>
              )}
            </Card>
          )
        }

        // First time playing
        if (!haveResult) {
          return (
            <PrimaryBtn onClick={handlePlaySeason} style={{ width: '100%', marginBottom: '0.5rem' }}>
              🏏 Play My Season →
            </PrimaryBtn>
          )
        }

        // Already played: show result + next-season option
        return (
          <>
            <div style={{ padding: '0.75rem', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '0.625rem', textAlign: 'center', marginBottom: '0.625rem', fontSize: '0.82rem', color: '#22c55e', fontWeight: 800 }}>
              ✓ Season submitted · {stageLabel(myResult)}
            </div>
            {amHost ? (
              <PrimaryBtn onClick={handleInitNextSeason} style={{ width: '100%', marginBottom: '0.5rem' }}>
                ⏱ Start Next Season (20s timer) →
              </PrimaryBtn>
            ) : (
              <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#475569', marginBottom: '0.5rem' }}>
                Waiting for host to start next season…
              </div>
            )}
            <GhostBtn onClick={handlePlaySeason} style={{ width: '100%' }}>🔄 Play Solo Again</GhostBtn>
          </>
        )
      })()}
    </>)
  }

  return null
}
