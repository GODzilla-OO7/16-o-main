import { useState, useEffect, useRef, useMemo } from 'react'
import { simulateFullSeason, simulateIPLPlayoffs, generateIPLTable, simulateSuperOver, calcTeamStrength } from '../utils/simulator.js'
import { MODE_CONFIG, applyPrimeRatings } from '../data/players.js'
import MatchEvent from './MatchEvent.jsx'
import ImpactSub from './ImpactSub.jsx'
import { getSupabase } from '../lib/supabase.js'
import ConfirmLeaveModal from './ConfirmLeaveModal.jsx'

// ─── Final drama commentary ─────────────────────────────────────────────────

const COMMENTARY_T20 = [
  'Both teams stride out. The stadium is packed to the rafters.',
  'Toss done. The match is underway — first ball delivered!',
  'Powerplay: Openers taking on the attack. Boundaries flow!',
  'Middle overs — wickets fall, pressure mounts on both sides.',
  'DEATH OVERS — last five overs. One team surges ahead!',
  'The final ball is bowled…',
]
const COMMENTARY_ODI = [
  'The captains shake hands at the toss. History is in the making.',
  'Both openers stride to the crease under bright skies.',
  'First 15 overs: steady start, then the boundaries come.',
  'Over 30 — drinks break. The game is perfectly poised.',
  '50-over crunch! Yorkers, sixes, runouts — everything on the line.',
  'The last ball of the Final is delivered…',
]

export default function MatchSimulator({ team, mode, manager, ratingType, freePositions = false, enableQTEs = true, onDone, h2hContext = null, liveCupContext = null, onHome }) {
  const [leagueSeason,    setLeagueSeason]    = useState(null)
  const [revealed,        setRevealed]        = useState([])
  const [liveRuns,        setLiveRuns]        = useState({})
  const [liveWkts,        setLiveWkts]        = useState({})
  const [expandedMatch,   setExpandedMatch]   = useState(null)
  const [liveIPLTable,    setLiveIPLTable]    = useState(null)
  const [showFullTable,   setShowFullTable]   = useState(false)
  const [iplPhase,        setIplPhase]        = useState('league') // league|table|playoffs|done
  const [iplTable,        setIplTable]        = useState(null)
  const [iplPosition,     setIplPosition]     = useState(null)
  const [playoffData,     setPlayoffData]     = useState(null)
  const [playoffRevealed, setPlayoffRevealed] = useState([])

  // Final drama states
  const [pendingFinal,    setPendingFinal]    = useState(null)  // the pre-simulated result
  const [finalPhase,      setFinalPhase]      = useState('idle') // idle|button|playing|done
  const [finalStep,       setFinalStep]       = useState(0)
  const [showCelebration, setShowCelebration] = useState(false)

  // Heartbreak overlay — shown full-screen on Semi or Final loss in WC
  const [showHeartbreak,  setShowHeartbreak]  = useState(false)

  // Match events — quick-time moments (century, hat-trick etc.)
  const [pendingEvent,    setPendingEvent]    = useState(null)  // { event, matchToReveal, resumeFn }

  // League Super Over — shown when a close league match flips to SO
  const [pendingLeagueSO, setPendingLeagueSO] = useState(null)  // { match, resume }

  // Impact Sub — mid-season transfer before playoffs (IPL only)
  const [activeTeam,      setActiveTeam]      = useState(team)  // may be updated by Impact Sub
  const [showImpactSub,   setShowImpactSub]   = useState(false)
  const [impactSubDone,   setImpactSubDone]   = useState(false)
  const [impactSubLog,    setImpactSubLog]    = useState(null)  // { out, in, event }
  const [iconSubPlayer,   setIconSubPlayer]   = useState(null)  // set if impact sub brought in a legend
  const [showSimConfirm,  setShowSimConfirm]  = useState(false) // back-to-home confirmation

  // Playoffs: queue of pending matches (shown one-by-one via "Play Match" button)
  const [pendingPlayoffQueue, setPendingPlayoffQueue] = useState([])  // matches not yet revealed
  const [playoffSimming,      setPlayoffSimming]      = useState(false) // H2H: auto-sim playoffs

  // Win streak tracker
  const [currentStreak,   setCurrentStreak]   = useState({ type: null, count: 0 })
  const [bestWinStreak,   setBestWinStreak]   = useState(0)
  const streakRef         = useRef({ type: null, count: 0 })  // stable read in timeouts — avoids nested-setState bug

  // Guard: prevent double-calls to callOnDone (e.g. double-click on results button)
  const onDoneCalledRef = useRef(false)

  // H2H: showdown match animation + live opponent results
  const [h2hShowdown, setH2hShowdown]       = useState(null)  // { match, opponentName }
  const [h2hOppResults, setH2hOppResults]   = useState([])    // opponent's published results
  const h2hPollRef = useRef(null)


  // Group draw — WC modes show a group draw before simulation starts
  const cfg    = MODE_CONFIG[mode]
  const isIPL  = mode === 'ipl'
  const format = cfg.format  // t20 | odi

  // Shuffle opponents for the group draw (generated once, used for both draw UI and simulation)
  const [drawnAllOpponents] = useState(() => {
    if (isIPL) return null
    const pool = [...cfg.opponents]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool
  })

  // IPL starts immediately; WC modes wait for user to click "Start Tournament"
  const [tournamentStarted, setTournamentStarted] = useState(isIPL)

  const leagueRef        = useRef(null)
  const playoffRef       = useRef(null)
  const tableTimRef      = useRef(null)
  const finalTimRef      = useRef(null)
  const startPlayoffsRef  = useRef(null)  // always latest startPlayoffs — avoids stale closure in ImpactSub
  const playoffStartedRef = useRef(false) // guards against double-call (Impact Sub skip + button race)

  // ── H2H live results polling ────────────────────────────────────────────────
  useEffect(() => {
    if (!h2hContext?.roomId) return
    async function pollOppResults() {
      const sb = await getSupabase()
      if (!sb) return
      const { data } = await sb
        .from('h2h_live_results')
        .select('*')
        .eq('room_id', h2hContext.roomId)
        .neq('player_id', h2hContext.myUserId)
        .order('match_num', { ascending: true })
      if (data) setH2hOppResults(data)
    }
    pollOppResults()
    h2hPollRef.current = setInterval(pollOppResults, 3000)
    return () => clearInterval(h2hPollRef.current)
  }, [h2hContext?.roomId])

  // ── Helper: publish my match result to Supabase ────────────────────────────
  async function publishH2HResult(match, matchNum) {
    if (!h2hContext?.roomId) return
    try {
      const sb = await getSupabase()
      if (!sb) return
      await sb.from('h2h_live_results').insert({
        room_id:    h2hContext.roomId,
        player_id:  h2hContext.myUserId,
        match_num:  matchNum,
        opponent_name: match.opponent,
        won:        match.won,
        my_score:   match.myScore ?? null,
        opp_score:  match.oppScore ?? null,
        is_h2h_showdown: match.isH2HShowdown ?? false,
      })
    } catch { /* ignore */ }
  }

  // ── Helper: publish live cup match result ────────────────────────────────
  async function publishLiveCupResult(match, matchNum) {
    if (!liveCupContext?.roomId) return
    try {
      const sb = await getSupabase()
      if (!sb) return
      await sb.from('live_cup_results').upsert({
        room_id:       liveCupContext.roomId,
        player_id:     liveCupContext.playerId,
        match_num:     matchNum,
        opponent_name: match.opponent,
        won:           match.won,
        my_score:      match.myScore ?? null,
        opp_score:     match.oppScore ?? null,
        stage:         match.stage === 'League' ? 'league' : 'playoff',
      }, { onConflict: 'room_id,player_id,match_num' })
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!tournamentStarted) return  // Wait for group draw → "Start Tournament" click

    const groupStageCount = mode === 'odi-wc' ? 9 : mode === 't20-wc' ? 4 : 0
    const groupOppNames   = drawnAllOpponents ? drawnAllOpponents.slice(0, groupStageCount) : null
    // H2H: inject opponent team as match 7 + compute their strength (prime-rated if in prime mode)
    const oppTeamForSim = h2hContext?.opponentTeam?.length > 0
      ? (ratingType === 'prime' ? applyPrimeRatings(h2hContext.opponentTeam, mode) : h2hContext.opponentTeam)
      : null
    const h2hOpp = oppTeamForSim
      ? { name: h2hContext.opponentName, strength: calcTeamStrength(oppTeamForSim, null, mode) }
      : null
    const rawSeason = simulateFullSeason(ratingType === 'prime' ? applyPrimeRatings(team, mode) : team, mode, manager, { groupOppNames, h2hOpponent: h2hOpp, freePositions, ratingType })

    // ── Live Cup: inject pre-calculated H2H results at specific match indices ──
    let season = rawSeason
    if (liveCupContext?.fixtures?.length > 0) {
      const fixMap = {}
      for (const fx of liveCupContext.fixtures) {
        if (fx.won !== null && fx.won !== undefined) {  // only pre-determined H2H results
          fixMap[fx.match_num] = fx
        }
      }
      if (Object.keys(fixMap).length > 0) {
        const overriddenResults = rawSeason.results.map((m, idx) => {
          const fx = fixMap[idx + 1]
          if (!fx) return m
          return {
            ...m,
            won:       fx.won,
            myScore:   fx.my_score   ?? m.myScore,
            oppScore:  fx.opp_score  ?? m.oppScore,
            opponent:  fx.opponent_name ?? m.opponent,
            isLiveCupH2H: true,  // skip QTEs for this match
          }
        })
        // Recount wins for table
        const overriddenWins = overriddenResults.filter(m => m.stage === 'League' && m.won).length
        season = { ...rawSeason, results: overriddenResults, wins: overriddenWins }
      }
    }

    setLeagueSeason(season)
    if (isIPL) setLiveIPLTable(generateIPLTable(season.wins))

    // ── Sequential reveal: one match at a time ──────────────────────────────
    const BATTING_MILESTONES = { 'half-century': 50, 'century': 100, '150': 150, '200': 200 }
    const WICKET_EVENTS      = new Set(['catch', 'run-out', 'stumping'])
    const RUN_BONUS_EVENTS   = { 'free-hit': 6, 'powerplay': 12 }

    // H2H gets fast smooth reveal; regular IPL gets original pacing
    const MATCH_DELAY = h2hContext ? 120 : 1200

    const runsAcc = {}, wktsAcc = {}

    // Resolve stats/streaks for a fully-resolved match (event already decided)
    function finaliseMatch(match, success, choiceLabel) {
      let finalMatch = { ...match, eventResult: match.event ? { success, choiceLabel } : undefined }

      if (match.event) {
        const evt = match.event
        const milestone = BATTING_MILESTONES[evt.type]
        if (milestone !== undefined) {
          const origScorer = finalMatch.stats?.topScorer
          const preservedScorer2 = origScorer?.name !== evt.playerName ? origScorer : finalMatch.stats?.topScorer2
          if (success) {
            const bonus = Math.floor(Math.random() * 36)
            const teamTotal = parseScoreStr(match.myScore ?? '').runs
            const cappedRuns = teamTotal ? Math.min(milestone + bonus, teamTotal) : milestone + bonus
            finalMatch = { ...finalMatch, stats: { ...finalMatch.stats, topScorer: { name: evt.playerName, runs: cappedRuns }, topScorer2: preservedScorer2 } }
          } else {
            finalMatch = { ...finalMatch, stats: { ...finalMatch.stats, topScorer: { name: evt.playerName, runs: milestone - 1 }, topScorer2: preservedScorer2 } }
          }
        } else if (evt.type === 'hat-trick') {
          finalMatch = { ...finalMatch, stats: { ...finalMatch.stats, topBowler: { name: evt.playerName, wickets: success ? 3 : 2 } } }
        } else if (success && RUN_BONUS_EVENTS[evt.type] !== undefined) {
          const bonus = RUN_BONUS_EVENTS[evt.type]
          const existing = finalMatch.stats?.topScorer
          const teamTotal = parseScoreStr(match.myScore ?? '').runs
          const rawRuns = (existing?.runs ?? 0) + bonus
          finalMatch = { ...finalMatch, stats: { ...finalMatch.stats, topScorer: { name: evt.playerName, runs: teamTotal ? Math.min(rawRuns, teamTotal) : rawRuns } } }
        }
        if (success && WICKET_EVENTS.has(evt.type)) {
          wktsAcc[evt.playerName] = (wktsAcc[evt.playerName] || 0) + 1
        }
      }

      if (match.superOver) {
        finalMatch = { ...finalMatch, won: match.superOver.won }
      }

      const { topScorer, topScorer2, topBowler } = finalMatch.stats ?? {}
      if (topScorer)  runsAcc[topScorer.name]  = (runsAcc[topScorer.name]  || 0) + topScorer.runs
      if (topScorer2) runsAcc[topScorer2.name] = (runsAcc[topScorer2.name] || 0) + topScorer2.runs
      if (topBowler)  wktsAcc[topBowler.name]  = (wktsAcc[topBowler.name]  || 0) + topBowler.wickets
      updateStreak(finalMatch.won, streakRef, setCurrentStreak, setBestWinStreak)
      return finalMatch
    }

    // processMatch: returns null if we need to stop (Final gate or QTE shown)
    // onDone(finalMatch) called when match is fully resolved
    function processMatch(match, onDone) {
      if (!isIPL && match.stage === 'Final') {
        setPendingFinal(match)
        setFinalPhase('button')
        return null // signal: stop here
      }

      // If match has a QTE event, pause and show the overlay
      // Skip QTEs for live cup H2H matches (score is pre-determined)
      if (match.event && !h2hContext && !match.isLiveCupH2H && enableQTEs) {
        setPendingEvent({
          event: match.event,
          opponent: match.opponent,
          resume: (success, choiceLabel) => {
            setPendingEvent(null)
            onDone(finaliseMatch(match, success, choiceLabel))
          },
        })
        return null // paused for user input
      }

      // Super Over — pause to show the SO card, then continue
      if (match.superOver && !h2hContext) {
        setPendingLeagueSO({
          match,
          resume: () => {
            setPendingLeagueSO(null)
            onDone(finaliseMatch(match, false, 'auto'))
          },
        })
        return null
      }

      // No event (or H2H auto-sim) — resolve immediately
      const success = match.event ? Math.random() < 0.6 : false
      return finaliseMatch(match, success, 'auto')
    }

    function scheduleNext(idx) {
      if (idx >= season.results.length) {
        // All league matches done
        if (isIPL) {
          tableTimRef.current = setTimeout(() => {
            const td = generateIPLTable(season.wins)
            setIplTable(td)
            setIplPosition(td.position)
            setIplPhase('table')
          }, 400)
        } else {
          // WC non-final: check last match
          setTimeout(() => {
            setRevealed(prev => {
              const last = prev[prev.length - 1]
              if (last && !last.won && last.stage === 'Semi-Final') setShowHeartbreak(true)
              else setIplPhase('done')
              return prev
            })
          }, 400)
        }
        return
      }

      leagueRef.current = setTimeout(() => {
        const match = season.results[idx]

        function commitAndContinue(finalMatch) {
          setRevealed(prev => [...prev, finalMatch])
          setLiveRuns({ ...runsAcc })
          setLiveWkts({ ...wktsAcc })
          publishH2HResult(finalMatch, idx + 1)
          publishLiveCupResult(finalMatch, idx + 1)
          scheduleNext(idx + 1)
        }

        const result = processMatch(match, commitAndContinue)
        if (result === null) return // Final gate or QTE paused — stop timer loop
        commitAndContinue(result)
      }, idx === 0 ? 300 : MATCH_DELAY)
    }

    scheduleNext(0)

    return () => {
      clearTimeout(leagueRef.current)
      clearTimeout(playoffRef.current)
      clearTimeout(tableTimRef.current)
      clearTimeout(finalTimRef.current)
    }
  }, [tournamentStarted])

  // H2H auto-sim: auto-proceed from league table to playoffs (skip user click)
  useEffect(() => {
    if (!h2hContext || iplPhase !== 'table' || !iplTable) return
    const t = setTimeout(() => {
      // Skip impact sub in H2H mode — proceed straight to playoffs if qualified
      if (iplTable.qualified) startPlayoffs()
      else callOnDone()
    }, 4000)  // show table for 4 seconds so the player can see it
    return () => clearTimeout(t)
  }, [iplPhase, h2hContext])

  function startPlayoffs(overrideTeam) {
    if (playoffStartedRef.current) return  // already started — ignore duplicate call
    playoffStartedRef.current = true
    const teamToUse = overrideTeam ?? activeTeam
    const pd = simulateIPLPlayoffs(ratingType === 'prime' ? applyPrimeRatings(teamToUse, mode) : teamToUse, manager, iplPosition, iplTable?.table ?? [])
    if (!pd?.results?.length) { setIplPhase('done'); return }
    setPlayoffData(pd)
    setIplPhase('playoffs')

    // H2H: auto-reveal all playoff matches quickly (no button clicks needed)
    if (h2hContext) {
      setPlayoffSimming(true)
      let idx = 0
      function revealNext() {
        if (idx >= pd.results.length) {
          setPlayoffSimming(false)
          setIplPhase('done')
          return
        }
        const match = pd.results[idx++]
        if (match.stage === 'Final') {
          setPlayoffSimming(false)
          setPendingFinal({ ...match, _fromPlayoff: true, _playoffData: pd })
          setFinalPhase('button')
          return
        }
        setPlayoffRevealed(prev => [...prev, match])
        setLiveRuns(prev => { const n = {...prev}; const { topScorer, topScorer2, topBowler } = match.stats ?? {}; if (topScorer) n[topScorer.name] = (n[topScorer.name]||0)+topScorer.runs; if (topScorer2) n[topScorer2.name] = (n[topScorer2.name]||0)+topScorer2.runs; if (topBowler) n[topBowler.name] = (n[topBowler.name]||0)+topBowler.wickets; return n })
        setTimeout(revealNext, 200)
      }
      setTimeout(revealNext, 300)
      return
    }

    // Regular IPL: sequential reveal with same 1200ms pacing as league matches
    let pidx = 0
    function revealNextPlayoff() {
      if (pidx >= pd.results.length) {
        playoffRef.current = setTimeout(() => setIplPhase('done'), 600)
        return
      }
      const match = pd.results[pidx++]
      if (match.stage === 'Final') {
        setPendingFinal({ ...match, _fromPlayoff: true, _playoffData: pd })
        setFinalPhase('button')
        return
      }

      // QTE pause — same logic as league scheduleNext
      function commitAndContinue(finalMatch) {
        setPlayoffRevealed(prev => [...prev, finalMatch])
        const { topScorer, topScorer2, topBowler } = finalMatch.stats ?? {}
        setLiveRuns(prev => {
          const n = { ...prev }
          if (topScorer)  n[topScorer.name]  = (n[topScorer.name]  || 0) + topScorer.runs
          if (topScorer2) n[topScorer2.name] = (n[topScorer2.name] || 0) + topScorer2.runs
          return n
        })
        setLiveWkts(prev => {
          const n = { ...prev }
          if (topBowler) n[topBowler.name] = (n[topBowler.name] || 0) + topBowler.wickets
          return n
        })
        playoffRef.current = setTimeout(revealNextPlayoff, 1200)
      }

      // Playoff matches have no QTEs or Super Overs — already resolved by simulateIPLPlayoffs
      commitAndContinue(match)
    }
    playoffRef.current = setTimeout(revealNextPlayoff, 400)
  }

  // Keep ref current so ImpactSub onComplete always calls latest version
  startPlayoffsRef.current = startPlayoffs

  // ── Dramatic final ───────────────────────────────────────────────────────

  function startFinalDrama() {
    // Show first innings first, then transition to live chase
    setFinalPhase('bat')
  }

  function finishFinal(wonOverride) {
    if (!pendingFinal) return
    const match       = pendingFinal
    const isFromPlayoff = match._fromPlayoff
    // wonOverride comes from Super Over result; falls back to pre-simulated result
    const actuallyWon = wonOverride !== undefined ? wonOverride : match.won

    addStats(match, setLiveRuns, setLiveWkts)

    if (isFromPlayoff) {
      const pd = match._playoffData
      setPlayoffRevealed(prev => [...prev, { ...match, won: actuallyWon, _fromPlayoff: undefined, _playoffData: undefined }])
      const fullPd = { ...pd, outcome: actuallyWon ? 'champion' : 'runner-up' }
      setPlayoffData(fullPd)
      if (actuallyWon) {
        setTimeout(() => setShowCelebration(true), 800)
      } else {
        setTimeout(() => setShowHeartbreak(true), 800)
      }
    } else {
      // WC mode
      setRevealed(prev => [...prev, { ...match, won: actuallyWon }])
      if (actuallyWon) {
        setTimeout(() => setShowCelebration(true), 800)
      } else {
        setTimeout(() => setShowHeartbreak(true), 800)
      }
    }
  }

  function dismissCelebration() {
    setShowCelebration(false)
    setTimeout(() => setIplPhase('done'), 300)
  }

  function dismissHeartbreak() {
    setShowHeartbreak(false)
    setTimeout(() => setIplPhase('done'), 300)
  }

  function callOnDone() {
    if (!leagueSeason || onDoneCalledRef.current) return
    onDoneCalledRef.current = true
    const iplOutcome = isIPL
      ? (!iplTable?.qualified ? 'not_qualified' : (playoffData?.outcome || 'eliminated'))
      : null
    onDone(
      {
        wins:            leagueSeason.wins,
        losses:          leagueSeason.losses,
        myStrength:      leagueSeason.myStrength,
        perfect:         leagueSeason.perfect,
        total:           leagueSeason.total,
        stageReached:    leagueSeason.stageReached,
        actualWinner:    leagueSeason.actualWinner,
        tournamentStats: leagueSeason.tournamentStats,
        iplOutcome,
        iplTable,
        iplPosition,
        iconPlayer:      iconSubPlayer,   // legend via impact sub (null if none)
        impactSubLog,                     // { out, in, event } or null
        finalTeam:       activeTeam,      // team after any impact sub swap (may differ from original team prop)
      },
      [...revealed, ...playoffRevealed],
    )
  }

  // ── Derived display values ─────────────────────────────────────────────

  const leagueWins   = revealed.filter(r => r.won).length
  const leagueLosses = revealed.filter(r => !r.won).length
  const playoffWins   = playoffRevealed.filter(r => r.won).length
  const playoffLosses = playoffRevealed.filter(r => !r.won).length
  const totalWins     = leagueWins   + playoffWins
  const totalLosses   = leagueLosses + playoffLosses

  const topRunScorers   = Object.entries(liveRuns).map(([name, runs]) => ({ name, runs })).sort((a,b) => b.runs - a.runs).slice(0,5)
  const topWicketTakers = Object.entries(liveWkts).map(([name, w]) => ({ name, wickets: w })).sort((a,b) => b.wickets - a.wickets).slice(0,5)

  const iplChampion =
    playoffData?.outcome === 'champion'  ? 'Your XI' :
    playoffData?.outcome === 'runner-up' ? (playoffData.results?.find(r => r.stage === 'Final')?.opponent ?? iplTable?.table?.find(t => !t.isUser)?.team) :
    iplTable?.table?.find(t => !t.isUser)?.team ?? 'Another team'

  const phaseLabel =
    iplPhase === 'league'   ? (revealed.length >= cfg.totalMatches ? 'League Stage Complete' : 'Season in Progress') :
    iplPhase === 'table'    ? 'IPL Points Table' :
    iplPhase === 'playoffs' ? '⚡ Playoffs' :
    finalPhase === 'button' ? '🏆 The Final' :
    finalPhase === 'playing' ? '🏟 Final in Progress' :
    isIPL && playoffData?.outcome === 'champion'  ? '🏆 IPL Champions!' :
    isIPL && playoffData?.outcome === 'runner-up' ? '🥈 Runners-Up' :
    'Season Complete'

  const commentary = format === 'odi' ? COMMENTARY_ODI : COMMENTARY_T20

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── H2H Showdown Full-screen Overlay ─────────────────────────── */}
      {h2hShowdown && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5000, pointerEvents: 'none',
          background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fade-in 0.3s ease both',
        }}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem', animation: 'trophy-bounce 0.7s ease both' }}>⚔️</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>
              H2H SHOWDOWN
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: 700, marginBottom: '0.3rem' }}>
              Your XI vs {h2hShowdown.opponentName}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              The moment of truth — two drafted squads collide!
            </div>
            <div style={{ marginTop: '1rem', fontSize: '1.8rem', fontWeight: 900, color: h2hShowdown.match.won ? '#22c55e' : '#ef4444' }}>
              {h2hShowdown.match.won ? '✅ YOU WON!' : '❌ YOU LOST'}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '0.3rem' }}>
              {h2hShowdown.match.myScore} vs {h2hShowdown.match.oppScore}
            </div>
          </div>
        </div>
      )}

      {/* ── Trophy Celebration Overlay ───────────────────────────────── */}
      {showCelebration && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'radial-gradient(ellipse at 50% 40%, #2a1500 0%, var(--bg) 70%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'fade-in 0.4s ease both',
        }}>
          <Confetti />
          <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: '7rem', lineHeight: 1, animation: 'trophy-bounce 0.7s cubic-bezier(0.34,1.56,0.64,1) both' }}>🏆</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.75rem', animation: 'champion-glow 2s ease infinite, fade-in-up 0.6s 0.4s ease both', animationFillMode: 'both' }}>
              {isIPL ? 'IPL Champions!' : (mode === 'odi-wc' ? 'World Champions!' : 'World Champions!')}
            </div>
            <div style={{ fontSize: '1rem', color: '#94a3b8', marginTop: '0.5rem', animation: 'fade-in 0.5s 0.8s ease both', animationFillMode: 'both' }}>
              You lifted the trophy. An all-time great team.
            </div>
            <button
              onClick={dismissCelebration}
              style={{ marginTop: '2.5rem', padding: '0.875rem 2.5rem', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', animation: 'fade-in 0.5s 1.2s ease both', animationFillMode: 'both' }}
            >
              View Season Summary →
            </button>
          </div>
        </div>
      )}

      {/* ── Impact Sub overlay ──────────────────────────────────────── */}
      {showImpactSub && (
        <ImpactSub
          team={activeTeam}
          mode={mode}
          ratingType={ratingType}
          onComplete={(newTeam, outPlayer, inPlayer, event) => {
            setActiveTeam(newTeam)
            setImpactSubLog({ out: outPlayer, in: inPlayer, event })
            if (inPlayer._isIcon) setIconSubPlayer(inPlayer)
            setImpactSubDone(true)
            setShowImpactSub(false)
            setTimeout(() => startPlayoffsRef.current(newTeam), 1000)
          }}
          onSkip={() => {
            setImpactSubDone(true)
            setShowImpactSub(false)
            setTimeout(() => startPlayoffsRef.current(), 1000)
          }}
        />
      )}

      {/* ── Match Event overlay ─────────────────────────────────────── */}
      {pendingEvent && (
        <MatchEvent
          event={pendingEvent.event}
          opponent={pendingEvent.opponent}
          onContinue={pendingEvent.resume}
        />
      )}

      {/* ── League Super Over overlay ─────────────────────────────── */}
      {pendingLeagueSO && (
        <LeagueSuperOverModal
          match={pendingLeagueSO.match}
          onDone={pendingLeagueSO.resume}
        />
      )}

      {/* ── Heartbreak Overlay ───────────────────────────────────────── */}
      {showHeartbreak && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: playoffData?.outcome === 'runner-up'
            ? 'radial-gradient(ellipse at 50% 30%, #1a0a00 0%, #0a0006 50%, var(--bg) 100%)'
            : 'radial-gradient(ellipse at 50% 40%, #1a0505 0%, var(--bg) 70%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'fade-in 0.4s ease both',
          padding: '1.5rem',
        }}>
          {playoffData?.outcome === 'runner-up' ? (
            // ── FINAL LOSS — special treatment ──────────────────────────────
            <div style={{ textAlign: 'center', maxWidth: 440, position: 'relative', zIndex: 2 }}>
              <div style={{ fontSize: '5rem', lineHeight: 1, animation: 'trophy-bounce 0.7s cubic-bezier(0.34,1.56,0.64,1) both', marginBottom: '0.5rem' }}>🥈</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem', animation: 'fade-in 0.4s 0.2s ease both', animationFillMode: 'both' }}>
                IPL Final
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2, animation: 'fade-in-up 0.6s 0.4s ease both', animationFillMode: 'both' }}>
                So close.
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#94a3b8', marginTop: '0.4rem', animation: 'fade-in 0.5s 0.6s ease both', animationFillMode: 'both' }}>
                A full season, every match, every decision —<br />
                it all came down to this. And you fell just short.
              </div>
              {pendingFinal && (
                <div style={{ marginTop: '1rem', padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.625rem', display: 'inline-block', animation: 'fade-in 0.5s 0.8s ease both', animationFillMode: 'both' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.2rem' }}>Your XI {pendingFinal.myScore} · {pendingFinal.opponent} {pendingFinal.oppScore}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>{pendingFinal.summary}</div>
                </div>
              )}
              {leagueSeason?.actualWinner && (
                <div style={{ marginTop: '0.75rem', padding: '0.5rem 1.25rem', background: 'rgba(255,255,255,0.04)', borderRadius: '0.5rem', display: 'inline-block', animation: 'fade-in 0.5s 1s ease both', animationFillMode: 'both' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>🏆 Champions: </span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: 800 }}>{leagueSeason.actualWinner}</span>
                </div>
              )}
              <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: '#475569', fontStyle: 'italic', animation: 'fade-in 0.5s 1.2s ease both', animationFillMode: 'both' }}>
                Your squad will remember this. Come back stronger.
              </div>
              <button
                onClick={dismissHeartbreak}
                style={{ marginTop: '2rem', padding: '0.875rem 2.5rem', background: 'linear-gradient(135deg,#374151,#1f2937)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', animation: 'fade-in 0.5s 1.4s ease both', animationFillMode: 'both' }}
              >
                View Season Summary →
              </button>
            </div>
          ) : (
            // ── SEMI / other loss ────────────────────────────────────────────
            <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
              <div style={{ fontSize: '7rem', lineHeight: 1, animation: 'trophy-bounce 0.7s cubic-bezier(0.34,1.56,0.64,1) both' }}>💔</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.75rem', animation: 'fade-in-up 0.6s 0.4s ease both', animationFillMode: 'both' }}>
                {leagueSeason?.stageReached === 'Semi-Final' ? 'Out in the Semis' : 'Heartbreak at the Final'}
              </div>
              <div style={{ fontSize: '1rem', color: '#94a3b8', marginTop: '0.5rem', animation: 'fade-in 0.5s 0.8s ease both', animationFillMode: 'both' }}>
                {leagueSeason?.stageReached === 'Semi-Final'
                  ? 'So close to the final — but it wasn\'t to be.'
                  : 'You made it to the last match, but fell just short.'}
              </div>
              {leagueSeason?.actualWinner && (
                <div style={{ marginTop: '0.75rem', padding: '0.5rem 1.25rem', background: 'rgba(255,255,255,0.07)', borderRadius: '0.5rem', display: 'inline-block', animation: 'fade-in 0.5s 1s ease both', animationFillMode: 'both' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>🏆 Tournament Winner: </span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 800 }}>{leagueSeason.actualWinner}</span>
                </div>
              )}
              <button
                onClick={dismissHeartbreak}
                style={{ marginTop: '2.5rem', padding: '0.875rem 2.5rem', background: 'linear-gradient(135deg,#ef4444,#b91c1c)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', animation: 'fade-in 0.5s 1.2s ease both', animationFillMode: 'both' }}
              >
                View Season Summary →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem', position: 'relative' }}>

        {/* Back button — top left */}
        {onHome && (
          <button
            onClick={() => setShowSimConfirm(true)}
            style={{
              position: 'absolute', top: '1.5rem', left: '1rem', zIndex: 10,
              background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)',
              color: '#C8102E', fontSize: '0.8rem', borderRadius: '0.4rem',
              cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em',
            }}
          >
            ← Back
          </button>
        )}

        {showSimConfirm && (
          <ConfirmLeaveModal
            message="Going back will take you all the way to the home screen and your season progress will be lost. Are you sure?"
            onYes={() => { setShowSimConfirm(false); onHome?.() }}
            onNo={() => setShowSimConfirm(false)}
          />
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.72rem', color: '#C8102E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{cfg.icon} {cfg.label}</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.2rem' }}>
            {!tournamentStarted ? '🎲 Group Stage Draw' : phaseLabel}
          </div>
          {tournamentStarted && (
            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
              {totalWins}W – {totalLosses}L · {revealed.length + playoffRevealed.length}/{cfg.totalMatches + playoffRevealed.length} matches
            </div>
          )}
        </div>

        {/* ── Group Draw (WC only, before tournament starts) ─────────── */}
        {!tournamentStarted && drawnAllOpponents && (
          <GroupDraw
            mode={mode}
            drawnOpponents={drawnAllOpponents}
            onStart={() => setTournamentStarted(true)}
          />
        )}

        {/* ── "Play Final" Gate — entrance button only ──────────────── */}
        {finalPhase === 'button' && (
          <FinalGate
            result={pendingFinal}
            onPlay={startFinalDrama}
          />
        )}

        {/* ── First innings animation ─────────────────────────────────── */}
        {finalPhase === 'bat' && pendingFinal && (
          <FinalBat
            result={pendingFinal}
            format={format}
            myBatting={!!pendingFinal.myBatsFirst}
            team={activeTeam}
            onComplete={() => setFinalPhase('chase')}
          />
        )}

        {/* ── Live Chase Scorecard ────────────────────────────────────── */}
        {finalPhase === 'chase' && pendingFinal && (
          <FinalChase
            result={pendingFinal}
            format={format}
            team={activeTeam}
            myStr={leagueSeason?.myStrength ?? 65}
            myChasing={!pendingFinal.myBatsFirst}
            enableQTEs={enableQTEs}
            onQTE={(event, opp, done) => {
              setPendingEvent({
                event,
                opponent: opp,
                resume: (success, label) => {
                  setPendingEvent(null)
                  done(success, label)
                }
              })
            }}
            onComplete={(won) => {
              setFinalPhase('done')
              finishFinal(won)
            }}
          />
        )}

        {/* Scoreboard */}
        {revealed.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.625rem', marginBottom: '1.5rem' }}>
            <div className="scoreboard-row" style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center' }}>
              {[
                { label: 'Wins',   value: totalWins,                              color: '#22c55e' },
                { label: 'Losses', value: totalLosses,                            color: '#ef4444' },
                { label: 'Played', value: revealed.length + playoffRevealed.length, color: '#94a3b8' },
              ].map(s => (
                <div key={s.label} className="score-box" style={{ width: 86, textAlign: 'center', padding: '0.75rem 0.5rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '0.75rem' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.2rem' }}>{s.label}</div>
                </div>
              ))}
              {/* Orange Cap & Purple Cap quick boxes */}
              {topRunScorers.length > 0 && (
                <div className="score-box cap-box" style={{ minWidth: 100, textAlign: 'center', padding: '0.75rem 0.75rem', background: 'linear-gradient(135deg,#7c2d12,#1c1002)', border: '1px solid #f9731644', borderRadius: '0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>{mode === 'ipl' ? '🧡 Orange Cap' : '⭐ Top Scorer'}</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{topRunScorers[0].name.split(' ').slice(-1)[0]}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#f97316', marginTop: '0.1rem' }}>{topRunScorers[0].runs} <span style={{ fontSize: '0.55rem', color: '#94a3b8' }}>runs</span></div>
                </div>
              )}
              {topWicketTakers.length > 0 && (
                <div className="score-box cap-box" style={{ minWidth: 100, textAlign: 'center', padding: '0.75rem 0.75rem', background: 'linear-gradient(135deg,#2e1065,#0f0520)', border: '1px solid #a855f744', borderRadius: '0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>{mode === 'ipl' ? '💜 Purple Cap' : '🎯 Top Wicket Taker'}</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{topWicketTakers[0].name.split(' ').slice(-1)[0]}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#a855f7', marginTop: '0.1rem' }}>{topWicketTakers[0].wickets} <span style={{ fontSize: '0.55rem', color: '#94a3b8' }}>wkts</span></div>
                </div>
              )}
            </div>
            {/* Live streak badge */}
            {currentStreak.count >= 2 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.3rem 0.875rem',
                background: currentStreak.type === 'W' ? '#C8102E18' : '#ef444418',
                border: `1px solid ${currentStreak.type === 'W' ? '#C8102E44' : '#ef444444'}`,
                borderRadius: '999px',
                fontSize: '0.78rem', fontWeight: 800,
                color: currentStreak.type === 'W' ? '#C8102E' : '#ef4444',
                animation: 'fade-in 0.3s ease both',
              }}>
                {currentStreak.type === 'W' ? `🔥 ${currentStreak.count} in a row!` : `💀 ${currentStreak.count} losses in a row`}
              </div>
            )}
            {/* Streak broken — flash of previous streak */}
            {currentStreak.type === 'L' && currentStreak.count === 1 && bestWinStreak >= 3 && (
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                Win streak ended at {bestWinStreak} 🏆
              </div>
            )}
          </div>
        )}

        {/* Main two-column grid (three columns in H2H mode) */}
        <div className="sim-grid" style={{ display: 'grid', gridTemplateColumns: revealed.length > 0 ? (h2hContext ? '220px 1fr 260px' : '1fr 260px') : '1fr', gap: '1.25rem', alignItems: 'start' }}>

          {/* H2H Opponent Live Results (left column, H2H only) */}
          {h2hContext && revealed.length > 0 && (
            <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '80vh', overflow: 'hidden' }}>
              <div style={{ padding: '0.5rem 0.75rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>⚔️ {h2hContext.opponentName}</div>
                <div style={{ fontSize: '0.6rem', color: '#64748b' }}>
                  {h2hOppResults.length === 0 ? 'Waiting for results…' : `${h2hOppResults.filter(r => r.won).length}W – ${h2hOppResults.filter(r => !r.won).length}L`}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {[...h2hOppResults].reverse().map((r, i) => (
                  <div key={i} style={{
                    padding: '0.4rem 0.6rem', borderRadius: '0.4rem',
                    background: r.is_h2h_showdown ? (r.won ? '#0d1a0d' : '#1a0d0d') : 'var(--card)',
                    border: `1px solid ${r.is_h2h_showdown ? (r.won ? '#22c55e44' : '#ef444444') : 'var(--border2)'}`,
                    animation: 'fade-in 0.25s ease both',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: r.won ? '#22c55e' : '#ef4444' }}>
                        {r.won ? '✅' : '❌'}
                      </span>
                      <span style={{ fontSize: '0.6rem', color: '#64748b', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.is_h2h_showdown ? '⚔️ vs YOU' : `vs ${r.opponent_name}`}
                      </span>
                    </div>
                    {(r.my_score || r.opp_score) && (
                      <div style={{ fontSize: '0.55rem', color: '#475569', marginTop: '0.1rem', textAlign: 'right' }}>
                        {r.my_score} • {r.opp_score}
                      </div>
                    )}
                  </div>
                ))}
                {h2hOppResults.length === 0 && (
                  <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.65rem', fontStyle: 'italic' }}>
                    Their results will<br/>appear here…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Left — phase UI + match cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

            {/* IPL Table */}
            {iplPhase === 'table' && iplTable && (
              <IPLTableView
                table={iplTable.table}
                position={iplTable.position}
                qualified={iplTable.qualified}
                leagueWins={leagueSeason?.wins}
                impactSubLog={impactSubLog}
                onProceed={() => {
                  if (!impactSubDone && iplTable.qualified) {
                    setShowImpactSub(true)
                  } else {
                    startPlayoffs()
                  }
                }}
                onSummary={callOnDone}
              />
            )}

            {/* Done result banner */}
            {iplPhase === 'done' && isIPL && (
              <IPLResultBanner outcome={playoffData?.outcome ?? 'not_qualified'} iplChampion={iplChampion} onDone={callOnDone} />
            )}

            {/* WC non-Final elimination: show results button once all matches are done */}
            {iplPhase === 'done' && !isIPL && finalPhase === 'idle' && (
              <div style={{ textAlign: 'center', padding: '1.25rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.75rem' }}>Tournament over for your team</div>
                <button
                  onClick={callOnDone}
                  style={{ padding: '0.875rem 2rem', background: '#C8102E', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  View Season Summary →
                </button>
              </div>
            )}

            {/* Playoff header */}
            {(iplPhase === 'playoffs' || (iplPhase === 'done' && playoffRevealed.length > 0)) && (
              <SectionBadge color="#a78bfa" bg="var(--card2)" border="#6d28d944">⚡ Playoffs</SectionBadge>
            )}

            {/* Playoff match cards — newest first */}
            {[...playoffRevealed].reverse().map((r, ri) => {
              const origI = playoffRevealed.length - 1 - ri
              return (
                <MatchCard key={`po-${origI}`} result={r} isLatest={false} animDelay={ri * 0.055} expanded={expandedMatch === `po-${origI}`} onToggle={() => setExpandedMatch(expandedMatch === `po-${origI}` ? null : `po-${origI}`)} enableQTEs={enableQTEs} />
              )
            })}

            {/* League section divider */}
            {playoffRevealed.length > 0 && revealed.length > 0 && (
              <SectionBadge color="#C8102E" bg="var(--card2)" border="#C8102E44">📋 League Stage</SectionBadge>
            )}

            {/* League match cards — newest first */}
            {[...revealed].reverse().map((r, ri) => {
              const origI = revealed.length - 1 - ri
              return (
                <MatchCard key={origI} result={r} isLatest={false} animDelay={ri * 0.055} expanded={expandedMatch === origI} onToggle={() => setExpandedMatch(expandedMatch === origI ? null : origI)} enableQTEs={enableQTEs} />
              )
            })}

            {/* Live Points Table — removed from simulation view */}

          </div>

          {/* Right — leaderboard */}
          {revealed.length > 0 && (
            <div className="sim-right" style={{ position: 'sticky', top: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <LeaderboardPanel title={mode === 'ipl' ? "🟠 Orange Cap Race" : "⭐ Top Scorer Race"} entries={topRunScorers}   valueKey="runs"    unit="runs" color="#f97316" />
              <LeaderboardPanel title={mode === 'ipl' ? "🟣 Purple Cap Race" : "🎯 Top Wicket Taker Race"} entries={topWicketTakers} valueKey="wickets" unit="wkts" color="#a855f7" />
              {/* Cap winner crowns — shown once season is complete */}
              {iplPhase !== 'league' && topRunScorers.length > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#7c2d12,#1c1002)', border: '1px solid #f9731644', borderRadius: '0.875rem', padding: '0.875rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>{mode === 'ipl' ? '🧡 Orange Cap Winner' : '⭐ Top Scorer'}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>{topRunScorers[0].name}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f97316' }}>{topRunScorers[0].runs} <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>runs</span></div>
                </div>
              )}
              {iplPhase !== 'league' && topWicketTakers.length > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#2e1065,#0f0520)', border: '1px solid #a855f744', borderRadius: '0.875rem', padding: '0.875rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>{mode === 'ipl' ? '💜 Purple Cap Winner' : '🎯 Top Wicket Taker'}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>{topWicketTakers[0].name}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#a855f7' }}>{topWicketTakers[0].wickets} <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>wkts</span></div>
                </div>
              )}

              {/* Recent Form — last 5 results */}
              {revealed.length > 0 && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', backdropFilter: 'blur(8px)' }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>Recent Form</div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {[...revealed].slice(-5).map((r, i) => (
                      <div key={i} style={{
                        width: 28, height: 28, borderRadius: '0.375rem',
                        background: r.won ? '#16a34a22' : '#dc262622',
                        border: `1px solid ${r.won ? '#16a34a55' : '#dc262655'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', fontWeight: 900,
                        color: r.won ? '#22c55e' : '#ef4444',
                      }}>
                        {r.won ? 'W' : 'L'}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.5rem' }}>
                    Last {Math.min(revealed.length, 5)} match{Math.min(revealed.length, 5) !== 1 ? 'es' : ''}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// streakRef holds the live streak so we never read stale state inside a timeout
function updateStreak(won, streakRef, setCurrentStreak, setBestWinStreak) {
  const prev = streakRef.current
  let next
  if (won) {
    const newCount = prev.type === 'W' ? prev.count + 1 : 1
    next = { type: 'W', count: newCount }
    setBestWinStreak(best => Math.max(best, newCount))
  } else {
    next = { type: 'L', count: prev.type === 'L' ? prev.count + 1 : 1 }
  }
  streakRef.current = next
  setCurrentStreak(next)
}

function addStats(match, setRuns, setWkts) {
  if (!match?.stats) return
  const { topScorer, topScorer2, topBowler } = match.stats
  if (topScorer) setRuns(prev => ({ ...prev, [topScorer.name]: (prev[topScorer.name] || 0) + topScorer.runs }))
  // Include the 2nd batter so the race has more names
  if (topScorer2) setRuns(prev => ({ ...prev, [topScorer2.name]: (prev[topScorer2.name] || 0) + topScorer2.runs }))
  if (topBowler) setWkts(prev => ({ ...prev, [topBowler.name]: (prev[topBowler.name] || 0) + topBowler.wickets }))
}

function ordinal(n) {
  if (!n) return ''
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function SectionBadge({ color, bg, border, children }) {
  return (
    <div style={{ padding: '0.55rem 1rem', background: bg, border: `1px solid ${border}`, borderRadius: '0.75rem', fontSize: '0.72rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', marginTop: '0.25rem' }}>
      {children}
    </div>
  )
}

// ─── Confetti ────────────────────────────────────────────────────────────────

function Confetti() {
  const COLORS = ['#f59e0b','#C8102E','#C8102E','#ef4444','#a855f7','#ec4899','#fff']
  const particles = useMemo(() =>
    Array.from({ length: 55 }, (_, i) => ({
      id: i,
      left:     `${Math.random() * 100}%`,
      color:    COLORS[i % COLORS.length],
      delay:    `${(Math.random() * 2).toFixed(2)}s`,
      duration: `${(2.5 + Math.random() * 2).toFixed(2)}s`,
      size:     `${6 + Math.random() * 8}px`,
      round:    Math.random() > 0.5,
    }))
  , [])

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: '-20px', left: p.left,
          width: p.size, height: p.size,
          background: p.color,
          borderRadius: p.round ? '50%' : '2px',
          animation: `confetti-fall ${p.duration} ${p.delay} linear infinite`,
        }} />
      ))}
    </div>
  )
}

// ─── Final Gate (entrance only) ──────────────────────────────────────────────

function FinalGate({ result, onPlay }) {
  const opponent = result?.opponent ?? 'the opposition'
  return (
    <div style={{ marginBottom: '1.5rem', animation: 'final-entrance 0.5s ease both' }}>
      <div style={{
        background: 'var(--warn-bg)', border: '2px solid var(--warn-border)',
        borderRadius: '1.25rem', padding: '2rem 1.5rem', textAlign: 'center',
        boxShadow: '0 0 60px #f59e0b15',
      }}>
        <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>
          🏆 THE FINAL
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.25rem' }}>
          Your XI vs {opponent}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
          Everything comes down to this one match. You'll be chasing live.
        </div>
        <button
          onClick={onPlay}
          style={{
            padding: '1rem 2.5rem',
            background: 'linear-gradient(135deg,#f59e0b,#d97706)',
            color: 'var(--bg)', border: 'none', borderRadius: '0.875rem',
            fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer',
            letterSpacing: '0.04em', textTransform: 'uppercase',
            boxShadow: '0 0 30px #f59e0b33',
          }}
        >
          ▶ Play The Final
        </button>
      </div>
    </div>
  )
}

// ─── Chase helpers ────────────────────────────────────────────────────────────

function parseScoreStr(str) {
  if (!str || typeof str !== 'string') return { runs: 0, wickets: 0 }
  const [r, w] = str.split('/').map(Number)
  return { runs: r || 0, wickets: w || 0 }
}

// ─── First innings score builder ──────────────────────────────────────────────

function buildFirstInningsPoints(finalRuns, finalWickets, format) {
  const totalOvers = format === 'odi' ? 50 : 20
  const marks      = format === 'odi' ? [10, 20, 30, 40, 45, 50] : [4, 12, 18, 20]

  return marks.map((over, i) => {
    const isLast = i === marks.length - 1
    let runs, wkts
    if (isLast) {
      runs = finalRuns
      wkts = finalWickets
    } else {
      const frac = over / totalOvers
      const pace = over < totalOvers * 0.3 ? 0.70 : over < totalOvers * 0.75 ? 0.95 : 1.15
      const raw  = finalRuns * frac * pace + (Math.random() - 0.5) * 12
      runs = Math.round(Math.max(4, Math.min(raw, finalRuns - 4)))
      const rawW = finalWickets * frac * (0.3 + Math.random() * 0.8)
      wkts = Math.round(Math.max(0, Math.min(rawW, Math.min(9, finalWickets - 1))))
    }
    const crr = over > 0 ? (runs / over).toFixed(1) : '0.0'
    return { over, runs, wkts, crr }
  })
}

function genInningsCommentary(over, runs, wkts, battingName, format) {
  const crr = over > 0 ? (runs / over).toFixed(1) : '0.0'
  const isT20 = format !== 'odi'
  if (isT20) {
    if (over === 4) {
      if (wkts === 0) return `Over 4: Powerplay going well — ${runs}/${wkts}, CRR ${crr}. All wickets intact.`
      if (wkts <= 2) return `Over 4: ${runs}/${wkts} in the powerplay — CRR ${crr}. ${battingName} pressing on.`
      return `Over 4: Early wobble — ${runs}/${wkts}. ${wkts} wickets gone already.`
    }
    if (over === 7) {
      if (wkts === 0) return `Over 7: Powerplay done, no wickets lost! CRR ${crr} — strong foundation set.`
      return `Over 7: Powerplay ends — ${runs}/${wkts}, CRR ${crr}. ${battingName} must push on now.`
    }
    if (over === 12) {
      if (parseFloat(crr) >= 10) return `Over 12: ${battingName} exploding in the middle overs — CRR ${crr}! Huge total building.`
      if (wkts >= 5) return `Over 12: ${wkts} down in the middle overs. ${battingName} need wickets in hand for the death.`
      return `Over 12: Middle overs — ${runs}/${wkts}, CRR ${crr}. ${battingName} keeping a steady pace.`
    }
    if (over === 15) {
      const proj = Math.round(runs * (20 / 15))
      return `Over 15: ${runs}/${wkts} — projecting around ${proj} from here. ${5 - wkts > 0 ? `${5 - wkts} wickets lost.` : 'Tail exposed.'}`
    }
    if (over === 18) {
      return `Over 18: ${runs}/${wkts} — two overs to go! Everything is on the line now.`
    }
    if (over === 20) return `Final score: ${runs}/${wkts} off 20 overs.`
  } else {
    if (over === 10) return `Over 10: ${runs}/${wkts}, CRR ${crr}. ${battingName} ${wkts === 0 ? 'cruising along' : 'pushing through'} the first quarter.`
    if (over === 20) return `Over 20: ${runs}/${wkts}, CRR ${crr}. ${battingName} halfway through — ${wkts <= 2 ? 'plenty in hand' : 'losing wickets'}.`
    if (over === 30) return `Over 30: ${runs}/${wkts}, CRR ${crr}. Three-quarter mark — ${parseFloat(crr) > 6 ? 'on a good path' : 'need to accelerate'}.`
    if (over === 40) return `Over 40: ${runs}/${wkts}. Death overs incoming — ${battingName} ${wkts <= 5 ? 'well placed' : 'running out of batting'}.`
    if (over === 45) return `Over 45: ${runs}/${wkts} — five overs left! ${battingName} going for it.`
    if (over === 50) return `Final score: ${runs}/${wkts} off 50 overs.`
  }
  return `${runs}/${wkts} after ${over} overs`
}

// ─── FinalBat — opponent's first innings animation ────────────────────────────

function FinalBat({ result, format, myBatting, team, onComplete }) {
  const oppParsed  = parseScoreStr(result.oppScore)
  const myParsed   = parseScoreStr(result.myScore)
  const batParsed  = myBatting ? myParsed : oppParsed
  const battingName = myBatting ? 'Your XI' : result.opponent

  const [points]      = useState(() => buildFirstInningsPoints(batParsed.runs, batParsed.wickets, format))
  const [step,        setStep]        = useState(-1)
  const [finished,    setFinished]    = useState(false)
  const [wicketFlash, setWicketFlash] = useState(null)  // { name, wkts } shown briefly
  const stepRef  = useRef(-1)
  const timerRef = useRef(null)

  // Build batting order for wicket-flash names
  const BATTING_ORDER_ROLES = ['opener','top-order','middle-order','wicket-keeper','all-rounder','pace-bowler','spin-bowler']
  const battingOrder = useMemo(() => {
    if (!myBatting || !team) return []
    return [...team].sort((a, b) =>
      BATTING_ORDER_ROLES.indexOf(a.role) - BATTING_ORDER_ROLES.indexOf(b.role)
    )
  }, [team, myBatting])

  // Opp star names for wicket flash when opponent is batting
  const oppStarNames = useMemo(() => {
    if (myBatting) return []
    const s = result.oppStats
    return [s?.topScorer?.name, s?.topScorer2?.name, s?.topBowler?.name].filter(Boolean)
  }, [myBatting, result])

  function getWicketName(wktIndex) {
    if (myBatting && battingOrder[wktIndex]) return battingOrder[wktIndex].name
    if (!myBatting && oppStarNames[wktIndex % oppStarNames.length]) return oppStarNames[wktIndex % oppStarNames.length]
    return null
  }

  function advance() {
    const next = stepRef.current + 1
    if (next >= points.length) {
      setFinished(true)
      timerRef.current = setTimeout(onComplete, 2400)
      return
    }

    // Detect wicket change vs prev step
    const prevWkts = next > 0 ? points[next - 1].wkts : 0
    const newWkts  = points[next].wkts
    if (newWkts > prevWkts) {
      // Show wicket flash for each new wicket
      const latestWktIndex = newWkts - 1
      const name = getWicketName(latestWktIndex)
      setWicketFlash({ name, wkts: newWkts })
      timerRef.current = setTimeout(() => {
        setWicketFlash(null)
        stepRef.current = next
        setStep(next)
        timerRef.current = setTimeout(advance, 2200)
      }, 1600)
      return
    }

    stepRef.current = next
    setStep(next)
    timerRef.current = setTimeout(advance, 2200)
  }

  useEffect(() => {
    timerRef.current = setTimeout(advance, 900)
    return () => clearTimeout(timerRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalOvers = format === 'odi' ? 50 : 20
  const pt = step >= 0 ? points[step] : null
  const barPct = pt ? Math.round((pt.over / totalOvers) * 100) : 0
  const crrNum = pt ? parseFloat(pt.crr) : 0
  const ref    = format === 'odi' ? 6.5 : 9.5
  const barColor = crrNum > ref + 1.5 ? '#ef4444' : crrNum > ref - 0.5 ? '#f59e0b' : '#C8102E'
  const commentary = pt ? genInningsCommentary(pt.over, pt.runs, pt.wkts, battingName, format) : null

  return (
    <div style={{ marginBottom: '1.5rem', animation: 'final-entrance 0.5s ease both' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.5rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.4rem' }}>
            🏆 THE FINAL · 1ST INNINGS
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.2rem' }}>
            {battingName}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Setting the target…</div>
        </div>

        {/* Wicket flash */}
        {wicketFlash && (
          <div style={{
            textAlign: 'center', padding: '0.6rem 1rem', marginBottom: '0.875rem',
            background: '#ef444418', border: '1px solid #ef444455',
            borderRadius: '0.625rem', animation: 'fade-in-up 0.25s ease both',
          }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              🏏 WICKET! {wicketFlash.wkts} down
            </span>
            {wicketFlash.name && (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: '0.4rem' }}>
                — {wicketFlash.name} departs
              </span>
            )}
          </div>
        )}

        {/* Live score */}
        {pt && (
          <div style={{ textAlign: 'center', marginBottom: '1rem', animation: 'fade-in 0.3s ease both' }}>
            <div style={{ fontSize: '2.75rem', fontWeight: 900, color: finished ? '#ef4444' : 'var(--text)', lineHeight: 1, transition: 'color 0.5s' }}>
              {pt.runs}<span style={{ fontSize: '1.3rem', color: '#64748b', fontWeight: 600 }}>/{pt.wkts}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.75rem', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                <span style={{ color: 'var(--text)', fontWeight: 800 }}>{pt.over}</span> overs
              </span>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                CRR <span style={{ color: 'var(--text)', fontWeight: 800 }}>{pt.crr}</span>
              </span>
            </div>
          </div>
        )}
        {!pt && (
          <div style={{ textAlign: 'center', marginBottom: '1rem', opacity: 0.4, fontSize: '0.85rem', color: '#64748b' }}>Innings starting…</div>
        )}

        {/* Commentary line */}
        {commentary && !finished && (
          <div style={{
            textAlign: 'center', fontSize: '0.72rem', color: '#94a3b8',
            fontStyle: 'italic', marginBottom: '0.875rem',
            padding: '0.4rem 0.75rem', background: 'var(--border2)',
            borderRadius: '0.4rem', lineHeight: 1.5,
            animation: 'fade-in 0.4s ease both',
          }}>
            🎙 {commentary}
          </div>
        )}

        {/* Single filling bar */}
        <div style={{ marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>
            <span>0 overs</span>
            <span>{totalOvers} overs</span>
          </div>
          <div style={{ height: 14, background: 'var(--border)', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${finished ? 100 : barPct}%`,
              background: finished ? '#ef4444' : barColor,
              borderRadius: 7,
              transition: 'width 1.4s cubic-bezier(0.4,0,0.2,1), background 0.5s',
            }} />
          </div>
        </div>

        {/* Status / Target card */}
        {finished ? (
          <div style={{ textAlign: 'center', padding: '0.875rem 1rem', background: '#ef444410', border: '1px solid #ef444433', borderRadius: '0.75rem', animation: 'fade-in 0.4s ease both' }}>
            <div style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>Target set</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#ef4444', lineHeight: 1 }}>{batParsed.runs + 1}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              {myBatting ? `${result.opponent}'s chase begins in a moment…` : 'Your chase begins in a moment…'}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#ef4444', fontSize: '0.8rem', fontWeight: 700 }}>
            {myBatting ? 'Your XI batting…' : `${result.opponent} batting…`}
          </div>
        )}
      </div>
    </div>
  )
}

function buildChasePoints(targetRuns, finalRuns, finalWickets, format) {
  // Always generates the same checkpoints as buildFirstInningsPoints
  // so the second innings bar mirrors the first innings bar.
  // The "stop at winner" happens naturally at the final checkpoint when needed===0.
  const totalOvers = format === 'odi' ? 50 : 20
  const marks      = format === 'odi' ? [10, 20, 30, 40, 45, 50] : [4, 12, 18, 20]

  return marks.map((over, i) => {
    const isLast = i === marks.length - 1
    let runs, wkts

    if (isLast) {
      // If chasing team won (reached target), show exactly the target — not the full runs scored
      runs = finalRuns >= targetRuns ? targetRuns : finalRuns
      wkts = finalWickets
    } else {
      const frac = over / totalOvers
      const pace = over < totalOvers * 0.4 ? 0.78 : over < totalOvers * 0.75 ? 1.0 : 1.15
      const raw  = finalRuns * frac * pace + (Math.random() - 0.5) * 12
      runs = Math.round(Math.max(6, Math.min(raw, finalRuns - 4)))
      const rawW = finalWickets * frac * (0.5 + Math.random() * 0.9)
      wkts = Math.round(Math.max(0, Math.min(rawW, Math.min(9, finalWickets - 1))))
    }
    const ballsLeft = (totalOvers - over) * 6
    const needed    = Math.max(0, targetRuns - runs)
    const crr       = over > 0 ? (runs / over).toFixed(1) : '0.0'
    const rrr       = ballsLeft > 0 ? (needed / ballsLeft * 6).toFixed(1) : '0.0'
    const onTrack   = parseFloat(crr) >= parseFloat(rrr) - 0.5
    return { over, totalOvers, runs, wkts, ballsLeft, needed, crr, rrr, onTrack }
  })
}

// ─── FinalChase — live over-by-over chase scorecard ──────────────────────────

function FinalChase({ result, format, team, myStr, myChasing, enableQTEs = true, onQTE, onComplete }) {
  const oppParsed = parseScoreStr(result.oppScore)
  const myParsed  = parseScoreStr(result.myScore)
  const firstInningsParsed = myChasing ? oppParsed : myParsed
  const chaserParsed       = myChasing ? myParsed  : oppParsed
  const target             = firstInningsParsed.runs + 1

  const [points]       = useState(() => buildChasePoints(target, chaserParsed.runs, chaserParsed.wickets, format))
  const [step,         setStep]         = useState(-1)
  const [phase,        setPhase]        = useState('animating')  // animating | qte-paused | result
  const [soData,       setSoData]       = useState(null)
  const [wicketFlash,  setWicketFlash]  = useState(null)
  const [commentary,   setCommentary]   = useState(null)

  const stepRef    = useRef(-1)
  const qtesFired  = useRef(new Set())   // indices where QTE has fired
  const timerRef   = useRef(null)

  // Build batting order for dismissed-batter tracking (only relevant when myChasing)
  const BATTING_ORDER_ROLES = ['opener','top-order','middle-order','wicket-keeper','all-rounder','pace-bowler','spin-bowler']
  const battingOrder = useMemo(() => {
    if (!myChasing || !team) return []
    return [...team].sort((a, b) =>
      BATTING_ORDER_ROLES.indexOf(a.role) - BATTING_ORDER_ROLES.indexOf(b.role)
    )
  }, [team, myChasing])

  // QTE fires at index 1 (over 12 — mid innings) AND index 2 (over 18 — death)
  const QTE_INDICES = new Set([1, 2])

  function tryQTE(next) {
    if (!enableQTEs) return false
    if (!QTE_INDICES.has(next)) return false
    if (qtesFired.current.has(next)) return false

    const pt = points[next]
    const dismissedCount = pt.wkts  // number of batters already out at this checkpoint
    let type, player

    if (myChasing) {
      // Only pick from batters who are NOT yet dismissed
      const availableBatters = battingOrder.filter((_, idx) => idx >= dismissedCount)
        .filter(p => ['opener','top-order','middle-order','wicket-keeper','all-rounder'].includes(p.role))
      if (availableBatters.length === 0) return false  // all batters gone, skip QTE

      const isDeath = next === 2
      if (isDeath) {
        const r = Math.random()
        type = r < 0.4 ? 'free-hit' : r < 0.7 ? 'drs' : 'last-ball-six'
      } else {
        // Mid innings
        const r = Math.random()
        type = r < 0.4 ? 'powerplay' : r < 0.7 ? 'half-century' : 'free-hit'
      }
      player = availableBatters[Math.floor(Math.random() * availableBatters.length)]
    } else {
      const bowlers = team.filter(p => ['pace-bowler','spin-bowler','all-rounder'].includes(p.role))
      const wk = team.find(p => p.role === 'wicket-keeper')
      const isDeath = next === 2
      if (isDeath) {
        const r = Math.random()
        type = r < 0.35 ? 'hat-trick' : r < 0.65 ? 'last-over' : 'catch'
      } else {
        const pool = ['catch', 'hat-trick', 'run-out', ...(wk ? ['stumping'] : [])]
        type = pool[Math.floor(Math.random() * pool.length)]
      }
      if (type === 'stumping') player = wk ?? team[0]
      else if (type === 'catch' || type === 'run-out') player = team[Math.floor(Math.random() * team.length)]
      else player = bowlers[Math.floor(Math.random() * bowlers.length)] ?? team[0]
    }

    qtesFired.current.add(next)
    setPhase('qte-paused')
    onQTE({ type, playerName: player.name }, result.opponent, () => {
      setPhase('animating')
      timerRef.current = setTimeout(advance, 1600)
    })
    return true
  }

  function advance() {
    const next = stepRef.current + 1
    if (next >= points.length) {
      setPhase('result')
      if (myParsed.runs === oppParsed.runs && Math.random() < 0.5) {
        const so = simulateSuperOver(myStr, 70)
        timerRef.current = setTimeout(() => setSoData(so), 2000)
      } else {
        timerRef.current = setTimeout(() => onComplete(result.won), 2500)
      }
      return
    }

    // Wicket flash check
    const prevWkts = stepRef.current >= 0 ? points[stepRef.current].wkts : 0
    const newWkts  = points[next].wkts
    stepRef.current = next

    if (newWkts > prevWkts && phase !== 'qte-paused') {
      const name = myChasing
        ? (battingOrder[newWkts - 1]?.name ?? null)
        : (result.oppStats?.topScorer?.name ?? null)
      setWicketFlash({ name, wkts: newWkts })
      timerRef.current = setTimeout(() => {
        setWicketFlash(null)
        setStep(next)
        // Commentary for this checkpoint
        const pt = points[next]
        const chaseName = myChasing ? 'Your XI' : result.opponent
        setCommentary(genInningsCommentary(pt.over, pt.runs, pt.wkts, chaseName, format))
        // Target already reached — stop here even after a wicket flash
        if (pt.needed === 0) {
          timerRef.current = setTimeout(() => {
            setPhase('result')
            timerRef.current = setTimeout(() => onComplete(myChasing ? true : false), 2000)
          }, 2500)
          return
        }
        if (!tryQTE(next)) timerRef.current = setTimeout(advance, 2000)
      }, 1500)
      return
    }

    setStep(next)
    const pt = points[next]

    // Target already reached
    if (pt.needed === 0) {
      timerRef.current = setTimeout(() => {
        setPhase('result')
        timerRef.current = setTimeout(() => onComplete(myChasing ? true : false), 2000)
      }, 2500)
      return
    }

    // Commentary
    const chaseName = myChasing ? 'Your XI' : result.opponent
    setCommentary(genInningsCommentary(pt.over, pt.runs, pt.wkts, chaseName, format))

    if (!tryQTE(next)) timerRef.current = setTimeout(advance, 1900)
  }

  useEffect(() => {
    timerRef.current = setTimeout(advance, 1200)
    return () => clearTimeout(timerRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pt            = step >= 0 ? points[Math.min(step, points.length - 1)] : null
  const barPct        = pt ? Math.round((pt.over / (pt.totalOvers ?? 20)) * 100) : 0
  const rrr           = pt ? parseFloat(pt.rrr) : 0
  const pressureColor = rrr > 15 ? '#ef4444' : rrr > 12 ? '#f97316' : rrr > 9 ? '#f59e0b' : '#22c55e'
  const pressureBg    = rrr > 15 ? '#ef444418' : rrr > 12 ? '#f9731618' : rrr > 9 ? '#f59e0b15' : '#22c55e18'
  const isDeathCrunch = pt && phase === 'animating' && pt.ballsLeft <= 18 && pt.needed > 0
  const totalOvers    = format === 'odi' ? 50 : 20
  const won           = result.won

  return (
    <div style={{ marginBottom: '1.5rem', animation: 'final-entrance 0.5s ease both' }}>
      <div style={{
        background: 'var(--warn-bg)', border: '2px solid var(--warn-border)',
        borderRadius: '1.25rem', padding: '1.5rem',
        boxShadow: '0 0 60px #f59e0b15',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.4rem' }}>
            🏆 THE FINAL · {myChasing ? 'LIVE CHASE' : `${result.opponent.toUpperCase()} CHASE`}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.75rem' }}>
            {myChasing ? `Your XI vs ${result.opponent}` : `${result.opponent} chasing your target`}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{myChasing ? 'They set' : 'You set'}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ef4444', lineHeight: 1.1 }}>{firstInningsParsed.runs}<span style={{ fontSize: '0.85rem', color: '#64748b' }}>/{firstInningsParsed.wickets}</span></div>
            </div>
            <div style={{ width: 1, background: 'var(--border)', margin: '0 0.25rem' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1.1 }}>{target}</div>
            </div>
          </div>
        </div>

        {/* Wicket flash — small overlay banner, doesn't hide live score */}
        {wicketFlash && (
          <div style={{
            textAlign: 'center', padding: '0.35rem 1rem', marginBottom: '0.5rem',
            background: '#ef444418', border: '1px solid #ef444455',
            borderRadius: '0.5rem', animation: 'fade-in-up 0.25s ease both',
          }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              🏏 WICKET! {wicketFlash.wkts} down
            </span>
            {wicketFlash.name && (
              <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginLeft: '0.4rem' }}>
                — {wicketFlash.name} departs
              </span>
            )}
          </div>
        )}

        {/* Live score */}
        {pt && phase !== 'result' && (
          <div style={{ textAlign: 'center', marginBottom: '0.875rem', animation: 'fade-in 0.3s ease both' }}>
            <div style={{ fontSize: '2.75rem', fontWeight: 900, color: pt.needed === 0 ? '#22c55e' : 'var(--text)', lineHeight: 1, transition: 'color 0.5s' }}>
              {pt.runs}<span style={{ fontSize: '1.3rem', color: '#64748b', fontWeight: 600 }}>/{pt.wkts}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.75rem', marginTop: '0.4rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                <span style={{ color: 'var(--text)', fontWeight: 800 }}>{pt.over}</span> overs
              </span>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                CRR <span style={{ color: 'var(--text)', fontWeight: 800 }}>{pt.crr}</span>
              </span>
            </div>
          </div>
        )}
        {!pt && phase !== 'result' && (
          <div style={{ textAlign: 'center', marginBottom: '0.875rem', opacity: 0.4, fontSize: '0.85rem', color: '#64748b' }}>Chase starting…</div>
        )}

        {/* Commentary */}
        {commentary && phase === 'animating' && pt && pt.needed > 0 && (
          <div style={{
            textAlign: 'center', fontSize: '0.72rem', color: '#94a3b8',
            fontStyle: 'italic', marginBottom: '0.75rem',
            padding: '0.4rem 0.75rem', background: 'var(--border2)',
            borderRadius: '0.4rem', lineHeight: 1.5,
            animation: 'fade-in 0.4s ease both',
          }}>
            🎙 {commentary}
          </div>
        )}

        {/* Single filling bar */}
        {phase !== 'result' && (
          <div style={{ marginBottom: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>
              <span>0 overs</span>
              <span>{totalOvers} overs</span>
            </div>
            <div style={{ height: 14, background: 'var(--border)', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pt?.needed === 0 ? 100 : barPct}%`,
                background: pt?.needed === 0 ? '#22c55e' : pressureColor,
                borderRadius: 7,
                transition: 'width 1.4s cubic-bezier(0.4,0,0.2,1), background 0.5s',
              }} />
            </div>
          </div>
        )}

        {/* Pressure cards */}
        {phase === 'animating' && pt && pt.needed > 0 && !wicketFlash && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <div style={{ flex: 1, padding: '0.5rem 0.25rem', textAlign: 'center', background: pressureBg, border: `1px solid ${pressureColor}44`, borderRadius: '0.5rem', animation: isDeathCrunch ? 'pulse-glow 1.1s ease-in-out infinite' : 'none' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: pressureColor, lineHeight: 1 }}>{pt.needed}</div>
              <div style={{ fontSize: '0.6rem', color: pressureColor, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.1rem' }}>needed</div>
            </div>
            <div style={{ flex: 1, padding: '0.5rem 0.25rem', textAlign: 'center', background: isDeathCrunch ? '#ef444412' : 'var(--border2)', border: `1px solid ${isDeathCrunch ? '#ef444433' : 'var(--border)'}`, borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: isDeathCrunch ? '#ef4444' : 'var(--text)', lineHeight: 1 }}>{pt.ballsLeft}</div>
              <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.1rem' }}>balls</div>
            </div>
            <div style={{ flex: 1, padding: '0.5rem 0.25rem', textAlign: 'center', background: 'var(--border2)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: pressureColor, lineHeight: 1 }}>{pt.rrr}</div>
              <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.1rem' }}>req rr</div>
            </div>
            <div style={{ flex: 1, padding: '0.5rem 0.25rem', textAlign: 'center', background: pt.wkts >= 7 ? '#ef444412' : 'var(--border2)', border: `1px solid ${pt.wkts >= 7 ? '#ef444433' : 'var(--border)'}`, borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: pt.wkts >= 7 ? '#ef4444' : 'var(--text)', lineHeight: 1 }}>{pt.wkts}</div>
              <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.1rem' }}>wkts</div>
            </div>
          </div>
        )}

        {/* Target reached early */}
        {phase === 'animating' && pt && pt.needed === 0 && (
          <div style={{ textAlign: 'center', padding: '1rem', background: myChasing ? 'var(--win-bg)' : 'var(--loss-bg)', border: `2px solid ${myChasing ? 'var(--win-border)' : 'var(--loss-border)'}`, borderRadius: '0.875rem', marginBottom: '0.875rem', animation: 'result-reveal 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '0.2rem' }}>{myChasing ? '🏆' : '💔'}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: myChasing ? '#C8102E' : '#ef4444' }}>
              {myChasing ? 'Target reached!' : `${result.opponent} wins the chase!`}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
              {chaserParsed.runs}/{chaserParsed.wickets} · over {pt.over}
            </div>
          </div>
        )}

        {phase === 'qte-paused' && (
          <div style={{ textAlign: 'center', padding: '0.625rem', background: '#f59e0b18', border: '1px solid #f59e0b44', borderRadius: '0.5rem', color: '#f59e0b', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.875rem' }}>
            ⚡ Critical moment! Quick Time Event incoming…
          </div>
        )}

        {/* Result card */}
        {phase === 'result' && !soData && (
          <div style={{ padding: '1.25rem', textAlign: 'center', background: won ? 'var(--win-bg)' : 'var(--loss-bg)', border: `2px solid ${won ? 'var(--win-border)' : 'var(--loss-border)'}`, borderRadius: '1rem', animation: 'result-reveal 0.7s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.3rem' }}>{won ? '🏆' : '💔'}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: won ? '#C8102E' : '#ef4444' }}>
              {won ? 'YOU WIN THE FINAL!' : 'Heartbreak at the Final'}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.3rem' }}>{result.summary}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>Your XI: {result.myScore} · {result.opponent}: {result.oppScore}</div>
          </div>
        )}
        {phase === 'result' && soData && (
          <MiniSuperOver soData={soData} opponent={result.opponent} onDone={() => onComplete(soData.won)} />
        )}
      </div>
    </div>
  )
}

// ─── Mini Super Over (inside Final chase) — dramatic reveal ──────────────────

function MiniSuperOver({ soData, opponent, onDone }) {
  const [phase, setPhase] = useState('intro')  // intro | my-score | opp-score | result
  const [myR,   setMyR]   = useState(0)
  const [oppR,  setOppR]  = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('my-score'), 2000)
    const t2 = setTimeout(() => {
      // Count up my score
      let n = 0
      const max = soData.myRuns
      const iv = setInterval(() => {
        n = Math.min(n + 1, max)
        setMyR(n)
        if (n >= max) clearInterval(iv)
      }, 80)
    }, 2200)
    const t3 = setTimeout(() => setPhase('opp-score'), 4200)
    const t4 = setTimeout(() => {
      let n = 0
      const max = soData.oppRuns
      const iv = setInterval(() => {
        n = Math.min(n + 1, max)
        setOppR(n)
        if (n >= max) clearInterval(iv)
      }, 80)
    }, 4400)
    const t5 = setTimeout(() => setPhase('result'), 6500)
    return () => [t1,t2,t3,t4,t5].forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      marginTop: '1rem', padding: '1.75rem 1.5rem', textAlign: 'center',
      background: 'linear-gradient(135deg,#0d0521,#1a0a2e)',
      border: '2px solid #a855f766', borderRadius: '1rem',
      boxShadow: '0 0 60px #a855f720',
      animation: 'result-reveal 0.5s ease both',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>⚡</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.3rem' }}>
        SUPER OVER
      </div>
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.5rem' }}>
        Scores level — 6 balls, 2 wickets. Everything decided right now.
      </div>

      {phase === 'intro' && (
        <div style={{ color: '#a855f7', fontWeight: 800, fontSize: '0.9rem', animation: 'pulse-glow 1s ease infinite' }}>
          Batters stride to the crease…
        </div>
      )}

      {phase !== 'intro' && (
        <div className="super-over-scores" style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1.25rem' }}>
          <div style={{ opacity: phase === 'my-score' || phase === 'opp-score' || phase === 'result' ? 1 : 0, transition: 'opacity 0.4s' }}>
            <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.25rem', letterSpacing: '0.08em' }}>Your XI</div>
            <div style={{
              fontSize: '3rem', fontWeight: 900, lineHeight: 1,
              color: phase === 'result' ? (soData.won ? '#22c55e' : '#ef4444') : '#f1f5f9',
              transition: 'color 0.5s',
            }}>{myR}</div>
          </div>
          <div style={{ fontSize: '1.5rem', color: '#475569', alignSelf: 'center' }}>vs</div>
          <div style={{ opacity: phase === 'opp-score' || phase === 'result' ? 1 : 0.2, transition: 'opacity 0.4s 0.2s' }}>
            <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.25rem', letterSpacing: '0.08em' }}>{opponent}</div>
            <div style={{
              fontSize: '3rem', fontWeight: 900, lineHeight: 1,
              color: phase === 'result' ? (soData.won ? '#ef4444' : '#22c55e') : '#f1f5f9',
              transition: 'color 0.5s',
            }}>{oppR}</div>
          </div>
        </div>
      )}

      {phase === 'result' && (
        <>
          <div style={{
            fontSize: '1.25rem', fontWeight: 900,
            color: soData.won ? '#22c55e' : '#ef4444',
            marginBottom: '1.25rem',
            animation: 'fade-in-up 0.5s ease both',
          }}>
            {soData.won ? '⚡ WON THE SUPER OVER — IPL CHAMPIONS!' : '💔 Super Over lost. Season ends here.'}
          </div>
          <button
            onClick={onDone}
            style={{
              padding: '0.75rem 2.5rem',
              background: soData.won ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#ef4444,#b91c1c)',
              color: '#fff', border: 'none', borderRadius: '0.75rem',
              fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
              animation: 'fade-in 0.4s 0.3s ease both', animationFillMode: 'both',
            }}
          >
            {soData.won ? 'View Season Summary →' : 'See Results →'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── League Super Over Modal ──────────────────────────────────────────────────

function LeagueSuperOverModal({ match, onDone }) {
  const so = match.superOver   // { won, myRuns, oppRuns }
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 2500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#1a0508', border: '2px solid #a855f755',
        borderRadius: '1.25rem', padding: '2rem 1.5rem', textAlign: 'center',
        boxShadow: '0 0 60px #a855f720',
        animation: 'fade-in-up 0.35s ease both',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚡</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
          SUPER OVER!
        </div>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
          vs {match.opponent} — scores level! 6 balls, 2 wickets decides it.
        </div>

        {!revealed
          ? <div style={{ color: '#a855f7', fontWeight: 700, fontSize: '0.875rem' }}>6 balls. 2 wickets. Everything on the line…</div>
          : (
            <>
              <div className="super-over-scores" style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Your XI</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: so.won ? '#22c55e' : '#ef4444' }}>{so.myRuns}</div>
                </div>
                <div style={{ fontSize: '1.5rem', color: '#475569', alignSelf: 'center' }}>vs</div>
                <div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{match.opponent}</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: so.won ? '#ef4444' : '#22c55e' }}>{so.oppRuns}</div>
                </div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: so.won ? '#22c55e' : '#ef4444', marginBottom: '1.25rem' }}>
                {so.won ? '⚡ Super Over won!' : '💔 Super Over lost'}
              </div>
              <button
                onClick={() => onDone(so.won)}
                style={{
                  padding: '0.75rem 2.5rem',
                  background: so.won ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#ef4444,#b91c1c)',
                  color: '#fff', border: 'none', borderRadius: '0.75rem',
                  fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                Continue Season →
              </button>
            </>
          )
        }
      </div>
    </div>
  )
}

// ─── IPL Result Banner ────────────────────────────────────────────────────────

function IPLResultBanner({ outcome, iplChampion, onDone }) {
  const cfg = {
    champion:     { bg:'var(--warn-bg)',  border:'var(--warn-border)', icon:'🏆', title:'IPL CHAMPIONS!',  color:'#f59e0b', sub:'You lifted the trophy. Legendary.' },
    'runner-up':  { bg:'var(--card2)',    border:'var(--border)',       icon:'🥈', title:'Runners-Up',      color:'#94a3b8', sub:`Well played — you made the Final. ${iplChampion} won the IPL.` },
    eliminated:   { bg:'var(--elim-bg)', border:'var(--elim-border)',  icon:'❌', title:'Knocked Out',     color:'#ef4444', sub:`So close. ${iplChampion} went on to lift the trophy.` },
    not_qualified:{ bg:'var(--loss-bg)', border:'var(--loss-border)',  icon:'📊', title:'Did Not Qualify', color:'#ef4444', sub:`${iplChampion} won the IPL this season.` },
  }[outcome] ?? { bg:'var(--card)', border:'var(--border)', icon:'📊', title:'Season Complete', color:'#94a3b8', sub:'' }

  return (
    <div style={{ textAlign:'center', padding:'1.5rem', background:cfg.bg, border:`2px solid ${cfg.border}`, borderRadius:'1rem', animation:'fade-in-up 0.4s ease both' }}>
      <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>{cfg.icon}</div>
      <div style={{ fontSize:'1.25rem', fontWeight:900, color:cfg.color, marginBottom:'0.3rem' }}>{cfg.title}</div>
      <div style={{ fontSize:'0.875rem', color:'#94a3b8', marginBottom:'1.25rem' }}>{cfg.sub}</div>
      {onDone && (
        <button
          onClick={onDone}
          style={{ padding:'0.875rem 2rem', background:'#C8102E', color:'var(--bg)', border:'none', borderRadius:'0.875rem', fontSize:'1rem', fontWeight:800, cursor:'pointer' }}
        >
          See Full Results →
        </button>
      )}
    </div>
  )
}

// ─── IPL Points Table ──────────────────────────────────────────────────────

function IPLTableView({ table, position, qualified, leagueWins, onProceed, onSummary }) {
  const topTeam = table.find(t => !t.isUser)
  return (
    <div style={{ animation:'fade-in-up 0.4s ease both' }}>
      <div style={{ textAlign:'center', marginBottom:'1.25rem', padding:'1.25rem', background: qualified ? 'var(--win-bg)' : 'var(--loss-bg)', border:`1px solid ${qualified ? 'var(--win-border)' : 'var(--loss-border)'}`, borderRadius:'1rem' }}>
        <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>{qualified ? '🎉' : '😔'}</div>
        <div style={{ fontSize:'1.2rem', fontWeight:900, color: qualified ? '#C8102E' : '#ef4444', marginBottom:'0.3rem' }}>
          {qualified ? `Qualified! (Finished ${ordinal(position)})` : `Missed Playoffs (Finished ${ordinal(position)})`}
        </div>
        <div style={{ fontSize:'0.875rem', color:'#64748b' }}>
          {qualified ? `${leagueWins}W puts you in the top 4.` : `${leagueWins}W — just outside the top 4.`}
        </div>
      </div>

      <div className="ipl-table-container" style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'1rem', overflow:'hidden', marginBottom:'1.25rem' }}>
        <div className="ipl-table-row" style={{ display:'grid', gridTemplateColumns:'1.5rem 1fr 3rem 3rem 4rem 4.5rem', gap:'0.5rem', padding:'0.6rem 1rem', background:'var(--border2)', borderBottom:'1px solid var(--border)', fontSize:'0.58rem', fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em' }}>
          <div>#</div><div>Team</div><div style={{ textAlign:'center' }}>W</div><div style={{ textAlign:'center' }}>L</div><div style={{ textAlign:'center' }}>Pts</div><div style={{ textAlign:'right' }}>NRR</div>
        </div>
        {table.map((row, i) => (
          <div key={row.team} className="ipl-table-row" style={{ display:'grid', gridTemplateColumns:'1.5rem 1fr 3rem 3rem 4rem 4.5rem', gap:'0.5rem', padding:'0.6rem 1rem', borderBottom: i < table.length-1 ? '1px solid var(--border2)' : 'none', background: row.isUser ? '#C8102E0d' : 'transparent', borderLeft: row.isUser ? '3px solid #C8102E' : i < 4 ? '3px solid #C8102E22' : '3px solid transparent' }}>
            <div style={{ fontSize:'0.72rem', fontWeight:800, color: i < 4 ? '#C8102E' : '#64748b', alignSelf:'center' }}>{i+1}</div>
            <div style={{ fontSize:'0.82rem', fontWeight: row.isUser ? 900 : 600, color: row.isUser ? 'var(--text)' : '#94a3b8', alignSelf:'center' }}>{row.team}{row.isUser && ' ⭐'}</div>
            <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#C8102E', textAlign:'center', alignSelf:'center' }}>{row.wins}</div>
            <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#ef4444', textAlign:'center', alignSelf:'center' }}>{row.losses}</div>
            <div style={{ fontSize:'0.9rem', fontWeight:900, color:'#f59e0b', textAlign:'center', alignSelf:'center' }}>{row.points}</div>
            <div style={{ fontSize:'0.72rem', color: row.nrr?.startsWith('+') ? '#C8102E' : '#ef4444', textAlign:'right', alignSelf:'center', fontWeight:600 }}>{row.nrr}</div>
          </div>
        ))}
      </div>

      {!qualified && topTeam && (
        <div style={{ padding:'1rem', background:'var(--warn-bg)', border:'1px solid var(--warn-border)', borderRadius:'0.875rem', marginBottom:'1.25rem', textAlign:'center' }}>
          <div style={{ fontSize:'0.62rem', color:'#f59e0b', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.3rem' }}>IPL Champions (Simulated)</div>
          <div style={{ fontSize:'1.1rem', fontWeight:900, color:'var(--text)' }}>🏆 {topTeam.team}</div>
        </div>
      )}

      <button onClick={qualified ? onProceed : onSummary} style={{ width:'100%', padding:'1rem', background: qualified ? '#C8102E' : 'linear-gradient(135deg,#C8102E,#1d4ed8)', color: qualified ? 'var(--bg)' : 'var(--text)', border:'none', borderRadius:'0.875rem', fontSize:'1rem', fontWeight:800, cursor:'pointer' }}>
        {qualified ? 'Proceed to Playoffs →' : 'View Season Summary →'}
      </button>
    </div>
  )
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({ result, isLatest, expanded, onToggle, animDelay = 0, enableQTEs = true }) {
  const { won, matchNum, stage, opponent, summary, myScore, oppScore, stats, oppStats, event, eventResult, superOver } = result
  const stageClr = stage === 'Final' ? '#f59e0b' : (stage?.includes('Qualifier') || stage === 'Eliminator' || stage?.includes('Semi')) ? '#a78bfa' : '#64748b'

  // Primary: always shown
  const myScorer  = stats?.topScorer   || null
  const myBowler  = stats?.topBowler   || null
  const oppScorer = oppStats?.topScorer || null
  const oppBowler = oppStats?.topBowler || null
  const hasPrimary = !!(myScorer || myBowler || oppScorer || oppBowler)

  // Secondary: shown on click
  const myScorer2  = stats?.topScorer2   || null
  const oppScorer2 = oppStats?.topScorer2 || null
  const hasSecondary = !!(myScorer2 || oppScorer2 || eventResult)

  const divBorder = `1px solid ${won ? 'var(--win-border)' : 'var(--loss-border)'}`

  function QTEChip() {
    if (!eventResult || !event || !enableQTEs) return null
    const icon = event.type === 'hat-trick' ? '🎳' : event.type === 'catch' || event.type === 'run-out' ? '🧤' : '🏏'
    const label = eventResult.success ? '⚡ QTE' : '✗ QTE'
    const color = eventResult.success ? '#f59e0b' : '#ef4444'
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:'0.2rem', padding:'0.1rem 0.4rem', borderRadius:'999px', background: color + '18', border:`1px solid ${color}44`, fontSize:'0.68rem', fontWeight:800, color, marginLeft:'0.4rem' }}>
        {icon} {label}
      </span>
    )
  }

  return (
    <div style={{ background: won ? 'var(--win-bg)' : 'var(--loss-bg)', border:`1px solid ${won ? 'var(--win-border)' : 'var(--loss-border)'}`, borderRadius:'0.75rem', overflow:'hidden', animation: 'slide-in-up 0.35s cubic-bezier(0.22,1,0.36,1) both', animationDelay: `${animDelay}s` }}>

      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.65rem 1rem' }}>
        <div style={{ width:26, height:26, borderRadius:'50%', background:'rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', fontWeight:800, color:'#94a3b8', flexShrink:0 }}>{matchNum}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.55rem', color:stageClr, textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700 }}>{stage}</div>
          <div style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            vs {opponent}
            <QTEChip />
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:'0.68rem', color: won ? '#22c55e' : '#dc2626', fontWeight:700 }}>
            {summary}
            {superOver && (
              <span style={{ display:'inline-block', marginLeft:'0.35rem', padding:'0.05rem 0.35rem', background:'#a855f720', border:'1px solid #a855f744', borderRadius:'999px', fontSize:'0.5rem', color:'#a855f7', fontWeight:800, verticalAlign:'middle', letterSpacing:'0.05em' }}>⚡ SO</span>
            )}
          </div>
          <div style={{ fontSize:'0.58rem', color:'#64748b' }}>
            {myScore} · {oppScore}
            {superOver && <span style={{ color:'#a855f7', marginLeft:'0.3rem' }}>SO: {superOver.myRuns}–{superOver.oppRuns}</span>}
          </div>
        </div>
        <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0, background: won ? '#22c55e22' : '#ef444422', border:`1px solid ${won ? '#22c55e66' : '#ef444466'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', fontWeight:900, color: won ? '#22c55e' : '#ef4444' }}>
          {won ? 'W' : 'L'}
        </div>
      </div>

      {/* Primary stats — always visible once match is revealed */}
      {hasPrimary && (
        <div style={{ borderTop: divBorder, display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
          {/* My team column */}
          <div style={{ padding:'0.45rem 0.75rem', borderRight: divBorder }}>
            <div style={{ fontSize:'0.65rem', color:'#C8102E', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.3rem' }}>Your XI</div>
            {myScorer && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', marginBottom:'0.2rem' }}>
                <span style={{ fontSize:'0.7rem' }}>🏏</span>
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{myScorer.name}</div>
                  <div style={{ fontSize:'0.65rem', color:'#C8102E', fontWeight:700 }}>{myScorer.runs} runs</div>
                </div>
              </div>
            )}
            {myBowler && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                <span style={{ fontSize:'0.7rem' }}>🎯</span>
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{myBowler.name}</div>
                  <div style={{ fontSize:'0.65rem', color:'#a855f7', fontWeight:700 }}>{myBowler.wickets}/{myBowler.runsConceded}</div>
                </div>
              </div>
            )}
          </div>
          {/* Opponent column */}
          <div style={{ padding:'0.45rem 0.75rem' }}>
            <div style={{ fontSize:'0.65rem', color:'#ef4444', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.3rem' }}>{opponent}</div>
            {oppScorer && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', marginBottom:'0.2rem' }}>
                <span style={{ fontSize:'0.7rem' }}>🏏</span>
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{oppScorer.name}</div>
                  <div style={{ fontSize:'0.65rem', color:'#ef4444', fontWeight:700 }}>{oppScorer.runs} runs</div>
                </div>
              </div>
            )}
            {oppBowler && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                <span style={{ fontSize:'0.7rem' }}>🎯</span>
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{oppBowler.name}</div>
                  <div style={{ fontSize:'0.65rem', color:'#a855f7', fontWeight:700 }}>{oppBowler.wickets}/{oppBowler.runsConceded}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tap for 2nd scorer/bowler hint + toggle */}
      {hasSecondary && (
        <div
          onClick={onToggle}
          style={{ borderTop: divBorder, padding:'0.3rem 0.75rem', display:'flex', justifyContent:'center', alignItems:'center', gap:'0.3rem', cursor:'pointer', background: expanded ? 'transparent' : 'transparent' }}
        >
          <span style={{ fontSize:'0.62rem', color:'#64748b', fontWeight:700 }}>
            {expanded ? '▲ Hide 2nd scorer / bowler' : '▼ Tap for 2nd scorer & more'}
          </span>
        </div>
      )}

      {/* Secondary stats — revealed on tap */}
      {expanded && hasSecondary && (
        <div style={{ borderTop: divBorder, padding:'0.6rem 0.75rem', display:'flex', flexDirection:'column', gap:'0.5rem', animation:'fade-in 0.15s ease both' }}>
          {/* 2nd scorers side by side */}
          {(myScorer2 || oppScorer2) && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
              {myScorer2 && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.35rem 0.5rem', background:'#C8102E12', borderRadius:'0.4rem' }}>
                  <span style={{ fontSize:'0.65rem' }}>🏏</span>
                  <div>
                    <div style={{ fontSize:'0.6rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:700 }}>2nd scorer</div>
                    <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text)' }}>{myScorer2.name}</div>
                    <div style={{ fontSize:'0.62rem', color:'#C8102E', fontWeight:700 }}>{myScorer2.runs} runs</div>
                  </div>
                </div>
              )}
              {oppScorer2 && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.35rem 0.5rem', background:'#ef444410', borderRadius:'0.4rem' }}>
                  <span style={{ fontSize:'0.65rem' }}>🏏</span>
                  <div>
                    <div style={{ fontSize:'0.6rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:700 }}>2nd scorer</div>
                    <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text)' }}>{oppScorer2.name}</div>
                    <div style={{ fontSize:'0.62rem', color:'#ef4444', fontWeight:700 }}>{oppScorer2.runs} runs</div>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* QTE event result */}
          {eventResult && event && (
            <div style={{ display:'flex', gap:'0.6rem', alignItems:'flex-start', padding:'0.4rem 0.5rem', background: eventResult.success ? '#f59e0b10' : '#ef444410', borderRadius:'0.4rem' }}>
              <div style={{ fontSize:'1rem' }}>{event.type === 'hat-trick' ? '🎳' : event.type === 'catch' ? '🧤' : event.type === 'run-out' ? '💨' : event.type === 'drs' ? '📺' : '🏏'}</div>
              <div>
                <div style={{ fontSize:'0.7rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.07em' }}>QTE — {event.type.replace(/-/g,' ')}</div>
                <div style={{ fontSize:'0.82rem', fontWeight:800, color:'var(--text)' }}>{event.playerName}</div>
                <div style={{ fontSize:'0.7rem', fontWeight:700, color: eventResult.success ? '#f59e0b' : '#ef4444' }}>
                  {eventResult.success ? '✓ Success!' : `✗ Failed · ${eventResult.choiceLabel}`}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ─── Group Draw ───────────────────────────────────────────────────────────────

function GroupDraw({ mode, drawnOpponents, onStart }) {
  const isODI = mode === 'odi-wc'

  // T20 WC: Group A = your XI + first 4; Group B = next 5
  // ODI WC: single pool = your XI + all 9
  const groupANames = isODI ? drawnOpponents.slice(0, 9) : drawnOpponents.slice(0, 4)
  const groupBNames = isODI ? null : drawnOpponents.slice(4, 9)

  const GroupCard = ({ title, teams, highlight, accentColor }) => (
    <div style={{ background: '#0e0e18', border: `1px solid ${accentColor}33`, borderRadius: '1rem', overflow: 'hidden', flex: 1 }}>
      <div style={{ padding: '0.65rem 1rem', background: accentColor + '18', borderBottom: `1px solid ${accentColor}22` }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          🏏 {title}
        </span>
      </div>
      {/* Your XI first */}
      {highlight && (
        <div style={{ padding: '0.55rem 1rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#C8102E0d' }}>
          <span style={{ fontSize: '0.85rem' }}>⭐</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 900, color: 'var(--text)' }}>Your XI</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: '#C8102E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</span>
        </div>
      )}
      {teams.map((name, i) => (
        <div key={name} style={{ padding: '0.5rem 1rem', borderBottom: i < teams.length - 1 ? '1px solid var(--border2)' : 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>{name}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', animation: 'fade-in-up 0.4s ease both' }}>
      <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', marginBottom: '1.25rem' }}>
        {isODI ? 'All 10 teams compete in a round-robin pool.' : 'Top 2 from each group advance to the Super 8.'}
      </div>

      <div style={{ display: 'flex', gap: '0.875rem', marginBottom: '1.5rem' }}>
        <GroupCard
          title={isODI ? 'Pool A' : 'Group A — Your Group'}
          teams={groupANames}
          highlight={true}
          accentColor="#C8102E"
        />
        {groupBNames && (
          <GroupCard
            title="Group B"
            teams={groupBNames}
            highlight={false}
            accentColor="#64748b"
          />
        )}
      </div>

      <button
        onClick={onStart}
        style={{
          width: '100%', padding: '1rem',
          background: '#C8102E',
          color: 'var(--bg)', border: 'none', borderRadius: '0.875rem',
          fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer',
          letterSpacing: '0.03em',
        }}
      >
        Start Tournament →
      </button>
    </div>
  )
}

// ─── Leaderboard panel ────────────────────────────────────────────────────────

function LeaderboardPanel({ title, entries, valueKey, unit, color }) {
  if (!entries.length) return null
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'0.875rem', overflow:'hidden' }}>
      <div style={{ padding:'0.6rem 1rem', borderBottom:'1px solid var(--border2)', fontSize:'0.72rem', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em' }}>{title}</div>
      {entries.map((e, i) => (
        <div key={e.name} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1rem', borderBottom: i < entries.length-1 ? '1px solid var(--border2)' : 'none' }}>
          <div style={{ fontSize:'0.62rem', color: i===0 ? color : 'var(--border)', fontWeight:900, width:16 }}>{i===0 ? '▶' : `${i+1}`}</div>
          <div style={{ flex:1, fontSize:'0.78rem', fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
          <div style={{ fontSize:'0.875rem', fontWeight:900, color: i===0 ? color : '#94a3b8', flexShrink:0 }}>
            {e[valueKey]}<span style={{ fontSize:'0.58rem', color:'#64748b', marginLeft:'0.2rem' }}>{unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
