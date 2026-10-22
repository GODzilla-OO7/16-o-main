import { useState, useEffect, useRef, useCallback } from 'react'
import { calcTeamStrength } from '../utils/simulator.js'
import { MODE_CONFIG } from '../data/players.js'
import { getSupabase } from '../lib/supabase.js'
import CupSettingsScreen from './CupSettingsScreen.jsx'

// ─── Helpers ────────────────────────────────────────────────────────────────

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// Retrieve or create a stable anonymous player ID in localStorage
function getAnonId() {
  let id = localStorage.getItem('live_cup_anon_id')
  if (!id) {
    id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    localStorage.setItem('live_cup_anon_id', id)
  }
  return id
}

function getAnonName() {
  return localStorage.getItem('live_cup_display_name') || ''
}

function winProb(myStr, oppStr) {
  const diff = myStr - oppStr
  return 1 / (1 + Math.exp(-diff / 8))
}

// Generate a realistic cricket score string
function genScore(runs, isWinner, format) {
  const maxWkts = 10
  const wickets = isWinner
    ? Math.floor(Math.random() * 6)          // winner: 0-5 wkts
    : Math.min(maxWkts, 5 + Math.floor(Math.random() * 6))  // loser: 5-10 wkts
  return `${runs}/${wickets}`
}

// Pre-calculate H2H match result deterministically
function calcH2HResult(myStr, oppStr, mode) {
  const won = Math.random() < winProb(myStr, oppStr)
  const format = (MODE_CONFIG[mode] ?? MODE_CONFIG['ipl']).format
  const base = format === 'odi' ? 250 : 160
  const variance = format === 'odi' ? 80 : 50
  const winRuns  = base + Math.floor(Math.random() * variance)
  const loseRuns = Math.max(60, winRuns - 10 - Math.floor(Math.random() * 60))
  const myRuns  = won ? winRuns  : loseRuns
  const oppRuns = won ? loseRuns : winRuns
  return {
    won,
    myScore:  genScore(myRuns,  won,  format),
    oppScore: genScore(oppRuns, !won, format),
  }
}

// Get number of league matches for a mode
function leagueMatchCount(mode) {
  if (mode === 't20-wc') return 4
  if (mode === 'odi-wc') return 9
  return 14
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div style={{
      background: 'rgba(8,8,14,0.72)',
      border: '1.5px solid rgba(255,255,255,0.11)',
      borderRadius: '1rem',
      padding: '1.25rem',
      ...style,
    }}>
      {children}
    </div>
  )
}

function Pill({ children, color = '#C8102E' }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.6rem',
      background: `${color}22`,
      border: `1px solid ${color}55`,
      borderRadius: '999px',
      fontSize: '0.62rem',
      fontWeight: 800,
      color,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}>
      {children}
    </span>
  )
}

function PrimaryBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '0.75rem 1.5rem',
        background: disabled ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg,#C8102E,#9b0e24)',
        color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
        border: 'none',
        borderRadius: '0.625rem',
        fontSize: '0.9rem',
        fontWeight: 800,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'opacity 0.2s',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function GhostBtn({ onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.625rem 1.25rem',
        background: 'none',
        color: 'rgba(255,255,255,0.45)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '0.5rem',
        fontSize: '0.82rem',
        fontWeight: 700,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function PlayerRow({ player, isMe }) {
  const ready = player.ready
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.6rem 0.875rem',
      background: isMe ? 'rgba(200,16,46,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isMe ? 'rgba(200,16,46,0.25)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: '0.625rem',
      marginBottom: '0.4rem',
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: ready ? '#22c55e' : '#475569',
        boxShadow: ready ? '0 0 6px #22c55e88' : 'none',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.display_name}{isMe ? ' (you)' : ''}
        </div>
        {player.team_name && (
          <div style={{ fontSize: '0.68rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {player.team_name}
          </div>
        )}
      </div>
      <div style={{ fontSize: '0.7rem', color: ready ? '#22c55e' : '#475569', fontWeight: 800, flexShrink: 0 }}>
        {ready ? '✓ Ready' : 'Drafting…'}
      </div>
    </div>
  )
}

// Live table row
function TableRow({ rank, player, isMe }) {
  const played  = (player.results ?? []).length
  const won     = (player.results ?? []).filter(r => r.won).length
  const lost    = played - won
  const pts     = won * 2
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr 36px 36px 36px 48px',
      gap: '0.25rem',
      alignItems: 'center',
      padding: '0.45rem 0.625rem',
      background: isMe ? 'rgba(200,16,46,0.08)' : (rank <= 4 ? 'rgba(34,197,94,0.04)' : 'transparent'),
      border: `1px solid ${isMe ? 'rgba(200,16,46,0.25)' : 'transparent'}`,
      borderRadius: '0.5rem',
      marginBottom: '0.2rem',
      fontSize: '0.78rem',
    }}>
      <div style={{ color: rank <= 4 ? '#22c55e' : '#64748b', fontWeight: 800, textAlign: 'center' }}>
        {rank <= 4 ? `Q${rank}` : rank}
      </div>
      <div style={{ fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.display_name}{isMe ? ' ★' : ''}
        {player.team_name ? <span style={{ color: '#64748b', fontWeight: 600 }}> · {player.team_name}</span> : null}
      </div>
      <div style={{ textAlign: 'center', color: '#64748b' }}>{played}</div>
      <div style={{ textAlign: 'center', color: '#22c55e', fontWeight: 700 }}>{won}</div>
      <div style={{ textAlign: 'center', color: '#ef4444', fontWeight: 700 }}>{lost}</div>
      <div style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 800 }}>{pts}</div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

// ─── Session persistence helpers ─────────────────────────────────────────────

function saveSession(roomId, code, mode, phase) {
  try { sessionStorage.setItem('lcup_session', JSON.stringify({ roomId, code, mode, phase })) } catch {}
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem('lcup_session') ?? 'null') } catch { return null }
}
function clearSession() {
  try { sessionStorage.removeItem('lcup_session') } catch {}
}

export default function LiveCup({
  user,
  onStartDraft,      // (mode, onDraftDone) — triggers draft flow in App.jsx
  onStartSeason,     // (liveCupCtx, team, manager, ratingType) — starts MatchSimulator
  onHome,
}) {
  // ── Restore persisted session ───────────────────────────────────────────
  const [savedSession] = useState(() => loadSession())

  // ── Local phase & identity ──────────────────────────────────────────────
  const [phase, setPhaseRaw] = useState(() => {
    const s = loadSession()
    if (s?.phase === 'lobby') return 'lobby'
    if (s?.phase === 'table') return 'table'
    return 'entry'
  })
  function setPhase(p) {
    setPhaseRaw(p)
    // Persist lobby/table phase so remount after draft/sim restores correctly
    if ((p === 'lobby' || p === 'table') && savedSession?.roomId) {
      saveSession(savedSession.roomId, savedSession.code, savedSession.mode, p)
    }
  }

  const [myId]                = useState(() => user?.id ?? getAnonId())
  const [myName, setMyName]   = useState(() => user?.email?.split('@')[0] ?? getAnonName())
  const [nameInput, setNameInput] = useState(myName)
  const [isCreating, setIsCreating] = useState(false)

  // ── Room & player data ──────────────────────────────────────────────────
  const [room, setRoom]       = useState(null)
  const [players, setPlayers] = useState([])
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')

  // ── My draft / team data ────────────────────────────────────────────────
  const [teamName, setTeamName] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)

  // ── Live cup fixtures + results for this player ─────────────────────────
  const [myFixtures, setMyFixtures] = useState([])
  const [liveResults, setLiveResults] = useState([]) // all players' results in this room

  // ── Realtime subscriptions ──────────────────────────────────────────────
  const subRef = useRef([])

  const isMobile = window.innerWidth <= 640

  // ── On mount: if we have a saved session (returning after draft or sim), rejoin ──
  useEffect(() => {
    if (savedSession?.roomId && (phase === 'lobby' || phase === 'table')) {
      subscribeToRoom(savedSession.roomId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup subscriptions on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      subRef.current.forEach(s => { try { s.unsubscribe() } catch {} })
    }
  }, [])

  // ── Subscribe to room data ──────────────────────────────────────────────
  const subscribeToRoom = useCallback(async (roomId) => {
    const sb = await getSupabase()
    if (!sb) return

    // Initial load
    async function loadPlayers() {
      const { data } = await sb.from('live_cup_players').select('*').eq('room_id', roomId).order('joined_at')
      if (data) setPlayers(data)
    }
    async function loadRoom() {
      const { data } = await sb.from('live_cup_rooms').select('*').eq('id', roomId).single()
      if (data) setRoom(data)
    }
    async function loadFixtures() {
      const { data } = await sb.from('live_cup_fixtures').select('*').eq('room_id', roomId).eq('player_id', myId).order('match_num')
      if (data) setMyFixtures(data)
    }
    async function loadResults() {
      const { data } = await sb.from('live_cup_results').select('*').eq('room_id', roomId).order('submitted_at')
      if (data) setLiveResults(data)
    }

    await Promise.all([loadPlayers(), loadRoom(), loadFixtures(), loadResults()])

    // Realtime: players changes
    const playersSub = sb.channel(`live_cup_players_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_cup_players', filter: `room_id=eq.${roomId}` },
        () => loadPlayers())
      .subscribe()

    // Realtime: room status changes (host clicked Start)
    const roomSub = sb.channel(`live_cup_rooms_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_cup_rooms', filter: `id=eq.${roomId}` },
        async (payload) => {
          setRoom(payload.new)
          if (payload.new.status === 'playing') {
            // Load fixtures and start season
            await loadFixtures()
          }
        })
      .subscribe()

    // Realtime: results
    const resultsSub = sb.channel(`live_cup_results_${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_cup_results', filter: `room_id=eq.${roomId}` },
        () => loadResults())
      .subscribe()

    subRef.current = [playersSub, roomSub, resultsSub]
  }, [myId])

  // ── When room goes to 'playing', auto-start season for all players ──────
  useEffect(() => {
    if (room?.status === 'playing' && myFixtures.length > 0 && phase === 'lobby') {
      const myPlayer = players.find(p => p.player_id === myId)
      if (myPlayer?.ready && myPlayer?.team) {
        startMySeason(myPlayer, myFixtures, room)
      }
    }
  }, [room?.status, myFixtures.length, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function startMySeason(myPlayer, fixtures, roomData) {
    setPhase('playing')
    // Save 'table' phase so that when the user returns from the Results screen,
    // LiveCup remounts in the table view instead of the entry screen
    saveSession(roomData.id, roomData.code, roomData.mode, 'table')
    const ctx = {
      roomId:     roomData.id,
      playerId:   myId,
      playerName: myPlayer.display_name,
      teamName:   myPlayer.team_name || '',
      mode:       roomData.mode,
      fixtures,   // pre-calculated: each has { match_num, opponent_name, opponent_strength, won, my_score, opp_score }
    }
    onStartSeason(ctx, myPlayer.team, myPlayer.manager, myPlayer.rating_type ?? 'overall')
  }

  // ── Create room ─────────────────────────────────────────────────────────
  async function handleCreate() {
    const name = nameInput.trim()
    if (!name) return
    setIsCreating(true)
    try {
      const sb = await getSupabase()
      if (!sb) throw new Error('No database connection')

      // Generate unique code
      let code, attempt = 0
      do {
        code = genCode()
        const { data } = await sb.from('live_cup_rooms').select('id').eq('code', code).maybeSingle()
        if (!data) break
        attempt++
      } while (attempt < 5)

      const { data: roomData, error } = await sb.from('live_cup_rooms').insert({
        code,
        host_id: myId,
        mode: 'ipl',
        status: 'lobby',
      }).select().single()
      if (error) throw error

      // Join as first player
      await sb.from('live_cup_players').insert({
        room_id:      roomData.id,
        player_id:    myId,
        display_name: name,
        team_name:    '',
        ready:        false,
      })

      localStorage.setItem('live_cup_display_name', name)
      localStorage.setItem('live_cup_display_name', name)
      setMyName(name)
      setRoom(roomData)
      saveSession(roomData.id, roomData.code, roomData.mode, 'lobby')
      await subscribeToRoom(roomData.id)
      setPhaseRaw('lobby')
    } catch (e) {
      console.error(e)
    } finally {
      setIsCreating(false)
    }
  }

  // ── Join room by code ────────────────────────────────────────────────────
  async function handleJoin() {
    const name = nameInput.trim()
    const code = joinCode.trim().toUpperCase()
    if (!name || !code) return
    setJoinError('')

    const sb = await getSupabase()
    if (!sb) { setJoinError('No database connection'); return }

    const { data: roomData } = await sb.from('live_cup_rooms').select('*').eq('code', code).maybeSingle()
    if (!roomData) { setJoinError('Room not found. Check the code.'); return }
    if (roomData.status !== 'lobby') { setJoinError('This room has already started.'); return }

    // Check player count
    const { count } = await sb.from('live_cup_players').select('*', { count: 'exact', head: true }).eq('room_id', roomData.id)
    if ((count ?? 0) >= 10) { setJoinError('Room is full (10 players max).'); return }

    // Upsert player (handles re-join gracefully)
    await sb.from('live_cup_players').upsert({
      room_id:      roomData.id,
      player_id:    myId,
      display_name: name,
      team_name:    '',
      ready:        false,
    }, { onConflict: 'room_id,player_id' })

    localStorage.setItem('live_cup_display_name', name)
    setMyName(name)
    setRoom(roomData)
    saveSession(roomData.id, roomData.code, roomData.mode, 'lobby')
    await subscribeToRoom(roomData.id)
    setPhaseRaw('lobby')
  }

  // ── Update team name ─────────────────────────────────────────────────────
  async function handleTeamNameSave(tn) {
    if (!room) return
    const sb = await getSupabase()
    if (!sb) return
    await sb.from('live_cup_players').update({ team_name: tn })
      .eq('room_id', room.id).eq('player_id', myId)
  }

  // ── Trigger draft (back in App.jsx) ─────────────────────────────────────
  function handleStartDraft() {
    setPhase('drafting-wait')
    // Pass a callback: App.jsx calls it with (team, manager, ratingType) after manager select
    onStartDraft(room.mode, room.settings ?? {}, async (team, manager, ratingType) => {
      await saveDraftedTeam(team, manager, ratingType)
    })
  }

  // ── After draft: save team to Supabase, mark ready ───────────────────────
  async function saveDraftedTeam(team, manager, ratingType) {
    // Use room from state OR reconstruct from savedSession
    const roomId   = room?.id   ?? savedSession?.roomId
    const roomMode = room?.mode ?? savedSession?.mode ?? 'ipl'
    if (!roomId) return

    const sb = await getSupabase()
    if (!sb) return

    const strength = calcTeamStrength(team, manager, roomMode, ratingType ?? 'overall')

    await sb.from('live_cup_players').update({
      team:        team,
      manager:     manager ?? null,
      rating_type: ratingType ?? 'overall',
      ready:       true,
      strength:    strength,
    }).eq('room_id', roomId).eq('player_id', myId)

    // Update session to reflect lobby phase (ready, awaiting host)
    if (savedSession?.roomId) {
      saveSession(savedSession.roomId, savedSession.code, savedSession.mode, 'lobby')
    }

    // If room is already subscribed (re-mount case), it will get realtime update
    // If not subscribed yet (came back from draft), subscribe now
    if (!room && savedSession?.roomId) {
      await subscribeToRoom(savedSession.roomId)
    }

    setPhaseRaw('lobby')
  }

  // ── Host: save settings (mode + all toggles) ────────────────────────────
  async function handleSettingsSave(newMode, cupSettings) {
    if (!room) return
    const sb = await getSupabase()
    if (!sb) return
    const { filteredEntries, composition, hardMode, ...dbSettings } = cupSettings
    await sb.from('live_cup_rooms').update({ mode: newMode, settings: dbSettings }).eq('id', room.id)
    setRoom(prev => ({ ...prev, mode: newMode, settings: dbSettings }))
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2500)
  }

  // ── Host: start season — pre-calculate all H2H fixtures ──────────────────
  async function handleHostStart() {
    if (!room || room.host_id !== myId) return
    const sb = await getSupabase()
    if (!sb) return

    const readyPlayers = players.filter(p => p.ready && p.team && p.strength > 0)
    if (readyPlayers.length < 2) return

    const totalMatches = leagueMatchCount(room.mode)
    const allFixtures  = []

    // For each player, assign H2H fixtures at evenly-spaced match slots
    // then fill remaining slots with AI opponents (null opponent_player_id)
    for (const player of readyPlayers) {
      const opponents = readyPlayers.filter(p => p.player_id !== player.player_id)
      const h2hCount  = opponents.length  // num human vs human matches

      // Evenly space H2H matches across the season
      const spacing   = Math.max(1, Math.floor(totalMatches / Math.max(h2hCount, 1)))
      const h2hSlots  = new Set()
      for (let i = 0; i < h2hCount; i++) {
        const slot = Math.min(totalMatches, 1 + i * spacing)
        h2hSlots.add(slot)
      }
      // If any slots collide due to rounding, push to next available
      const usedSlots = new Set()
      const finalH2HSlots = []
      for (let i = 0; i < h2hCount; i++) {
        let s = 1 + i * spacing
        while (usedSlots.has(s) && s <= totalMatches) s++
        if (s > totalMatches) s = totalMatches
        usedSlots.add(s)
        finalH2HSlots.push(s)
      }

      let oppIdx = 0
      for (let match = 1; match <= totalMatches; match++) {
        const h2hIdx = finalH2HSlots.indexOf(match)
        if (h2hIdx !== -1) {
          // Human vs human
          const opp = opponents[h2hIdx]
          if (!opp) continue
          const result = calcH2HResult(player.strength, opp.strength, room.mode)
          allFixtures.push({
            room_id:             room.id,
            player_id:           player.player_id,
            match_num:           match,
            opponent_player_id:  opp.player_id,
            opponent_name:       opp.team_name || opp.display_name,
            opponent_strength:   opp.strength,
            won:                 result.won,
            my_score:            result.myScore,
            opp_score:           result.oppScore,
          })
        } else {
          // AI opponent — strength ranges similar to normal mode
          const aiStr = 62 + (oppIdx / 10) * 18 + (Math.random() * 16 - 8)
          const aiName = getAIOpponentName(room.mode, oppIdx)
          oppIdx++
          allFixtures.push({
            room_id:             room.id,
            player_id:           player.player_id,
            match_num:           match,
            opponent_player_id:  null,
            opponent_name:       aiName,
            opponent_strength:   Math.round(aiStr),
            won:                 null,  // AI opponents are simulated normally by MatchSimulator
            my_score:            null,
            opp_score:           null,
          })
        }
      }
    }

    // Bulk insert fixtures
    if (allFixtures.length > 0) {
      await sb.from('live_cup_fixtures').insert(allFixtures)
    }

    // Update room status → playing
    await sb.from('live_cup_rooms').update({ status: 'playing', started_at: new Date().toISOString() }).eq('id', room.id)
  }

  // ── Submit match result to Supabase (called by MatchSimulator callback) ──
  async function submitMatchResult(matchNum, opponentName, won, myScore, oppScore, stage) {
    if (!room) return
    const sb = await getSupabase()
    if (!sb) return
    try {
      await sb.from('live_cup_results').upsert({
        room_id:       room.id,
        player_id:     myId,
        match_num:     matchNum,
        opponent_name: opponentName,
        won,
        my_score:      myScore ?? null,
        opp_score:     oppScore ?? null,
        stage:         stage ?? 'league',
      }, { onConflict: 'room_id,player_id,match_num' })
    } catch { /* ignore */ }
  }

  // ── Compute live table ──────────────────────────────────────────────────
  function computeTable() {
    const map = {}
    for (const player of players) {
      map[player.player_id] = {
        ...player,
        results: [],
      }
    }
    for (const result of liveResults) {
      if (map[result.player_id]) {
        map[result.player_id].results.push(result)
      }
    }
    return Object.values(map)
      .filter(p => p.ready || p.results.length > 0)
      .sort((a, b) => {
        const wA = a.results.filter(r => r.won).length
        const wB = b.results.filter(r => r.won).length
        return wB - wA
      })
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  const wrap = (content) => (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: isMobile ? '1.25rem 1rem' : '2rem 1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button
            onClick={onHome}
            style={{ background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E', fontSize: '0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em' }}
          >
            🏠 Home
          </button>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ⚡ Live Friends Cup
          </div>
        </div>
        {content}
      </div>
    </div>
  )

  // ── Entry ───────────────────────────────────────────────────────────────
  if (phase === 'entry') {
    return wrap(
      <>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: isMobile ? '1.8rem' : '2.2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.35rem' }}>
            ⚡ Live Friends Cup
          </div>
          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
            Draft your squad live with friends. Same fixtures, shared table, one champion.
          </div>
        </div>

        {/* Name input */}
        <Card style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
            Your display name
          </div>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="e.g. Aryaman"
            maxLength={24}
            style={{
              width: '100%', padding: '0.625rem 0.75rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '0.5rem',
              color: 'var(--text)', fontSize: '0.9rem', fontWeight: 700,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </Card>

        {/* Create */}
        <Card style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.375rem' }}>
            🏠 Create a room
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.875rem' }}>
            Get a 6-letter code to share with friends. You pick the mode.
          </div>
          <PrimaryBtn onClick={handleCreate} disabled={!nameInput.trim() || isCreating} style={{ width: '100%' }}>
            {isCreating ? 'Creating…' : 'Create Room →'}
          </PrimaryBtn>
        </Card>

        {/* Join */}
        <Card>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.375rem' }}>
            🔗 Join a room
          </div>
          <input
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setJoinError('') }}
            placeholder="6-letter code  e.g. KR7XP2"
            maxLength={6}
            style={{
              width: '100%', padding: '0.625rem 0.75rem',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${joinError ? '#ef4444' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: '0.5rem',
              color: 'var(--text)', fontSize: '0.9rem', fontWeight: 700,
              outline: 'none', boxSizing: 'border-box', letterSpacing: '0.15em',
              textTransform: 'uppercase', marginBottom: '0.5rem',
            }}
          />
          {joinError && <div style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: '0.5rem' }}>{joinError}</div>}
          <PrimaryBtn onClick={handleJoin} disabled={!nameInput.trim() || joinCode.length < 6} style={{ width: '100%' }}>
            Join Room →
          </PrimaryBtn>
        </Card>
      </>
    )
  }

  // ── Lobby ───────────────────────────────────────────────────────────────
  if (phase === 'lobby' || phase === 'drafting-wait') {
    const amHost     = room?.host_id === myId
    const myPlayer   = players.find(p => p.player_id === myId)
    const allReady   = players.length >= 2 && players.every(p => p.ready)
    const readyCount = players.filter(p => p.ready).length

    const shareLink = `${window.location.origin}${window.location.pathname}#livecup=${room?.code}`

    return wrap(
      <>
        {/* Room header */}
        <Card style={{ marginBottom: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            Room Code
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '0.18em', marginBottom: '0.25rem' }}>
            {room?.code}
          </div>
          <button
            onClick={() => {
              try { navigator.clipboard.writeText(shareLink) } catch {}
            }}
            style={{ fontSize: '0.72rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            📋 Copy invite link
          </button>
        </Card>

        {/* Settings panel: host configures, others see read-only mode */}
        {amHost ? (
          <Card style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
              Room Settings — only you see this
              {settingsSaved && <span style={{ color: '#22c55e', marginLeft: '0.5rem', textTransform: 'none', fontWeight: 700 }}>✓ Saved</span>}
            </div>
            <CupSettingsScreen
              initialMode={room?.mode ?? 'ipl'}
              onConfirm={handleSettingsSave}
              compact
              saveLabel={settingsSaved ? '✓ Settings Saved' : 'Save Settings'}
            />
          </Card>
        ) : room?.mode ? (
          <Card style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>Mode</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)' }}>
              {room.mode === 'ipl' ? '🏏 IPL' : room.mode === 't20-wc' ? '⚡ T20 WC' : '🌍 ODI WC'}
            </div>
          </Card>
        ) : null}

        {/* Team name */}
        {!myPlayer?.ready && (
          <Card style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
              Your team name (optional)
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="e.g. Thunder XI"
                maxLength={28}
                style={{
                  flex: 1, padding: '0.5rem 0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '0.5rem',
                  color: 'var(--text)', fontSize: '0.85rem', fontWeight: 700,
                  outline: 'none',
                }}
              />
              <GhostBtn onClick={() => handleTeamNameSave(teamName)}>Save</GhostBtn>
            </div>
          </Card>
        )}

        {/* Player list */}
        <Card style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)' }}>
              Players ({players.length}/10)
            </div>
            <Pill color={readyCount === players.length && players.length > 0 ? '#22c55e' : '#f59e0b'}>
              {readyCount}/{players.length} ready
            </Pill>
          </div>
          {players.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: '#475569', textAlign: 'center', padding: '0.875rem' }}>
              Waiting for players to join…
            </div>
          ) : (
            players.map(p => (
              <PlayerRow key={p.player_id} player={p} isMe={p.player_id === myId} />
            ))
          )}
        </Card>

        {/* Draft button (available for anyone who hasn't drafted yet) */}
        {!myPlayer?.ready && phase !== 'drafting-wait' && (
          <PrimaryBtn onClick={handleStartDraft} style={{ width: '100%', marginBottom: '0.625rem' }}>
            🏏 Draft My Team →
          </PrimaryBtn>
        )}

        {phase === 'drafting-wait' && (
          <Card style={{ textAlign: 'center', marginBottom: '1rem', background: 'rgba(200,16,46,0.08)', borderColor: 'rgba(200,16,46,0.3)' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ff4d6d' }}>
              Complete the draft to mark yourself ready ✓
            </div>
          </Card>
        )}

        {myPlayer?.ready && (
          <Card style={{ textAlign: 'center', marginBottom: '1rem', background: 'rgba(34,197,94,0.07)', borderColor: 'rgba(34,197,94,0.3)' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#22c55e' }}>
              ✓ Team drafted! Waiting for others…
            </div>
          </Card>
        )}

        {/* Host: start season */}
        {amHost && (
          <PrimaryBtn
            onClick={handleHostStart}
            disabled={!allReady}
            style={{ width: '100%' }}
          >
            {allReady
              ? `🚀 Start Season (${players.length} players) →`
              : `Waiting for all players to draft… (${readyCount}/${players.length})`}
          </PrimaryBtn>
        )}

        {!amHost && (
          <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#475569', marginTop: '0.375rem' }}>
            Waiting for host to start the season…
          </div>
        )}
      </>
    )
  }

  // ── Table view (visible during / after season) ──────────────────────────
  if (phase === 'table') {
    const table = computeTable()
    const totalMatches = leagueMatchCount(room?.mode ?? 'ipl')
    const myDone = liveResults.filter(r => r.player_id === myId && r.stage === 'league').length >= totalMatches

    return wrap(
      <>
        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.875rem' }}>
          📊 Live Standings
        </div>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr 36px 36px 36px 48px',
          gap: '0.25rem',
          padding: '0.25rem 0.625rem',
          fontSize: '0.62rem',
          fontWeight: 800,
          color: '#475569',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '0.25rem',
        }}>
          <div>#</div>
          <div>Team</div>
          <div style={{ textAlign: 'center' }}>P</div>
          <div style={{ textAlign: 'center' }}>W</div>
          <div style={{ textAlign: 'center' }}>L</div>
          <div style={{ textAlign: 'center' }}>Pts</div>
        </div>

        <Card>
          {table.map((player, idx) => (
            <TableRow key={player.player_id} rank={idx + 1} player={player} isMe={player.player_id === myId} />
          ))}
        </Card>

        {!myDone && (
          <PrimaryBtn
            onClick={() => setPhase('playing')}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            Back to My Season →
          </PrimaryBtn>
        )}

        {myDone && (
          <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#64748b', marginTop: '1rem' }}>
            Waiting for other players to finish their season…
          </div>
        )}
      </>
    )
  }

  return null
}

// ─── AI team names per mode ─────────────────────────────────────────────────

const AI_NAMES_IPL = [
  'Mumbai Indians','Chennai Super Kings','Kolkata Knight Riders','Royal Challengers Bangalore',
  'Sunrisers Hyderabad','Rajasthan Royals','Delhi Capitals','Punjab Kings','Gujarat Titans',
  'Lucknow Super Giants','Rising Pune Supergiant','Deccan Chargers',
]

const AI_NAMES_ODI = [
  'Australia','England','India','Pakistan','South Africa','New Zealand',
  'West Indies','Sri Lanka','Bangladesh','Afghanistan','Zimbabwe',
]

const AI_NAMES_T20 = [
  'India','Australia','England','Pakistan','South Africa','New Zealand',
  'West Indies','Afghanistan','Sri Lanka','Bangladesh',
]

function getAIOpponentName(mode, idx) {
  const pool = mode === 'ipl' ? AI_NAMES_IPL : mode === 'odi-wc' ? AI_NAMES_ODI : AI_NAMES_T20
  return pool[idx % pool.length]
}
