import { useState, useEffect, useRef, Component, lazy, Suspense } from 'react'
import { MODE_CONFIG, POSITIONS } from './data/players.js'
import ModeSelect from './components/ModeSelect.jsx'
import DraftSettings from './components/DraftSettings.jsx'
import ManagerSelect from './components/ManagerSelect.jsx'
import WheelSpin from './components/WheelSpin.jsx'
import TeamSheet from './components/TeamSheet.jsx'
import TeamStrengthPanel from './components/TeamStrengthPanel.jsx'
import MatchSimulator from './components/MatchSimulator.jsx'
import Results from './components/Results.jsx'
import ProfileModal from './components/ProfileModal.jsx'
import AuthModal from './components/AuthModal.jsx'
import SquadComposer from './components/SquadComposer.jsx'
import RetentionScreen from './components/RetentionScreen.jsx'
import { STARTING_BUDGET } from './components/WheelSpin.jsx'
import { DEFAULT_COMP } from './components/CupSettingsScreen.jsx'
import MusicPlayer from './components/MusicPlayer.jsx'
import ConfirmLeaveModal from './components/ConfirmLeaveModal.jsx'
import { recordSeason, loadProfile, mergeSessionAwardsOnSignIn } from './hooks/useProfile.js'
import { getStreakData, recordDailyLogin, recordPlayStreak, consumeStreakBonus } from './hooks/useStreak.js'
import { useAuth, saveGameResult, saveAwards, fetchProfile, incrementTotalPlays, signInWithGoogle } from './hooks/useAuth.js'
import { generateTournament } from './utils/sharedTournament.js'
import { getSupabase } from './lib/supabase.js'
import { resolveShortUrl } from './lib/shortUrl.js'

// Screens most players never open load on demand, so the home screen starts faster.
function lazyScreen(load) {
  const Screen = lazy(load)
  return function LazyScreen(props) {
    return <Suspense fallback={null}><Screen {...props} /></Suspense>
  }
}
const UserProfile = lazyScreen(() => import('./components/UserProfile.jsx'))
const DailyChallenge = lazyScreen(() => import('./components/DailyChallenge.jsx'))
const H2HLobby = lazyScreen(() => import('./components/H2HLobby.jsx'))
const H2HDraft = lazyScreen(() => import('./components/H2HDraft.jsx'))
const SharedLeague = lazyScreen(() => import('./components/SharedLeague.jsx'))
const LiveCup = lazyScreen(() => import('./components/LiveCup.jsx'))
const FriendsCup = lazyScreen(() => import('./components/FriendsCup.jsx'))
const WeeklyCup = lazyScreen(() => import('./components/WeeklyCup.jsx'))
const SeasonHub = lazyScreen(() => import('./season/SeasonHub.jsx'))

const ROLE_FULL_LABEL = {
  'opener': 'Opener',
  'top-order': 'Top Order',
  'middle-order': 'Middle Order',
  'wicket-keeper': 'Wicket-Keeper',
  'all-rounder': 'All-Rounder',
  'pace-bowler': 'Pace Bowler',
  'spin-bowler': 'Spin Bowler',
}

// Error boundary — catches H2HDraft crashes and shows a recoverable error screen
class H2HErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[H2H crash]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>⚠️</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)' }}>Multiplayer Draft crashed</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'monospace', background: 'var(--card)', padding: '0.75rem', borderRadius: '0.5rem', maxWidth: 480, wordBreak: 'break-all' }}>
            {this.state.error?.message ?? String(this.state.error)}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); this.props.onBack?.() }}
            style={{ padding: '0.75rem 1.5rem', background: '#C8102E', color: '#fff', border: 'none', borderRadius: '0.625rem', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            ← Back to menu
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Batting order sort — mirrors TeamSheet's defaultSort
const BATTING_ORDER_WEIGHT = {
  'opener': 0, 'top-order': 1, 'wicket-keeper': 2,
  'middle-order': 3, 'all-rounder': 4,
  'pace-bowler': 5, 'spin-bowler': 6,
}
function sortByBattingOrder(arr) {
  return [...arr].sort((a, b) => (BATTING_ORDER_WEIGHT[a.role] ?? 9) - (BATTING_ORDER_WEIGHT[b.role] ?? 9))
}

export default function App() {
  useEffect(() => {
    // Always dark mode — light mode removed
    document.body.classList.remove('light')
    localStorage.removeItem('cricket-theme')
  }, [])

  // ── URL-encoded share view (#share=...) ─────────────────────────────────────
  const [sharedResult, setSharedResult] = useState(null)
  // ── Challenge a Friend (#challenge=...) ─────────────────────────────────────
  const [challengeData, setChallengeData] = useState(null)  // decoded challenge from URL
  const [challengerResult, setChallengerResult] = useState(null) // shown in Results for comparison
  useEffect(() => {
    // Handle short URLs: /s/<code> or /<code> → resolve to long URL and redirect
    const path = window.location.pathname
    const shortCode = path.startsWith('/s/')
      ? path.slice(3)
      : (/^\/([a-z0-9]{5,7})$/.exec(path)?.[1] ?? null)
    if (shortCode) {
      resolveShortUrl(shortCode).then(longUrl => {
        if (longUrl) window.location.replace(longUrl)
        // else: not a valid code — just show the menu normally (path ignored)
      })
      return  // Don't parse hash until redirect resolves
    }

    const hash = window.location.hash
    if (hash.startsWith('#share=')) {
      try {
        const encoded = hash.slice('#share='.length)
        const decoded = JSON.parse(decodeURIComponent(escape(atob(encoded))))
        setSharedResult(decoded)
      } catch { /* ignore bad hashes */ }
    } else if (hash.startsWith('#challenge=')) {
      try {
        const encoded = hash.slice('#challenge='.length)
        const decoded = JSON.parse(decodeURIComponent(escape(atob(encoded))))
        setChallengeData(decoded)
      } catch { /* ignore bad hashes */ }
    } else if (hash.startsWith('#h2h=')) {
      const roomId = hash.slice('#h2h='.length).trim().toUpperCase()
      if (roomId) { setH2hJoinId(roomId); setShowH2H(true) }
    } else if (hash.startsWith('#livecup=')) {
      setShowLiveCup(true)
    } else if (hash.startsWith('#fcup=')) {
      const code = hash.slice('#fcup='.length).trim().toUpperCase()
      if (code) setFcupJoinCode(code)
      setShowFriendsCup(true)
    } else if (hash === '#wcup') {
      setShowWeeklyCup(true)
    }
  }, [])
  const { user, signOut } = useAuth()

  // Track whether we've already saved this game result to Supabase (to avoid double-save)
  const resultSavedRef = useRef(false)
  const [restoredAfterAuth, setRestoredAfterAuth] = useState(false)

  // When user signs in: pull their awards from Supabase and merge into local profile.
  // Also deferred-save the game result if they signed in from the results screen.
  useEffect(() => {
    if (user && !prevUserRef.current) {
      fetchProfile(user.id).then(({ profile: sbProfile }) => {
        const supabaseAwards = sbProfile?.awards ?? []
        if (supabaseAwards.length > 0) mergeSessionAwardsOnSignIn(supabaseAwards)
      })

      // Check for a result persisted before Google OAuth redirect
      try {
        const raw = localStorage.getItem('pending_game_result')
        if (raw) {
          localStorage.removeItem('pending_game_result')
          const data = JSON.parse(raw)
          saveGameResult(user.id, data)
          if (data.awardIds?.length) saveAwards(user.id, data.awardIds)
          resultSavedRef.current = true
        }
      } catch {}

      // Safari OAuth redirect: restore the full results screen state so the user
      // lands back on the results screen rather than the homepage
      try {
        const raw2 = localStorage.getItem('pending_results_state')
        if (raw2) {
          localStorage.removeItem('pending_results_state')
          const s = JSON.parse(raw2)
          setMode(s.mode ?? null)
          setSummary(s.summary ?? null)
          setMatchResults(s.matchResults ?? [])
          setTeam(s.team ?? [])
          setManager(s.manager ?? null)
          setNewAwards(s.newAwards ?? [])
          setPrevSeasons(s.prevSeasons ?? [])
          setSeasonNumber(s.seasonNumber ?? 1)
          setRestoredAfterAuth(true)
          setPhase('results')
        }
      } catch {}

      // Deferred save: user signed in via email/password while still on the results screen
      if (phase === 'results' && summary && !resultSavedRef.current) {
        resultSavedRef.current = true
        saveGameResult(user.id, {
          mode,
          wins:         summary.wins,
          losses:       summary.losses,
          total:        summary.total,
          stageReached: summary.stageReached,
          iplOutcome:   summary.iplOutcome,
          iplPosition:  summary.iplPosition,
          perfect:      summary.perfect,
        })
        if (sessionAwardIdsRef.current.length) saveAwards(user.id, sessionAwardIdsRef.current)
      }
    }
    prevUserRef.current = user
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const [mode, setMode]             = useState(null)
  const seasonModeRef = useRef(false)              // true while drafting a Season-mode squad
  const [seasonDraft, setSeasonDraft] = useState(null) // { team, manager, settings } for a new season
  const [phase, setPhase]           = useState('menu')
  const [settings, setSettings]     = useState(null)
  const [manager, setManager]       = useState(null)
  const [team, setTeam]             = useState([])
  const [draftedIds, setDraftedIds] = useState(new Set())
  const [rerollsLeft, setRerollsLeft] = useState(3)
  const [summary, setSummary]       = useState(null)
  const [matchResults, setMatchResults] = useState([])
  const [showProfile, setShowProfile]   = useState(false)
  const [showAuth, setShowAuth]         = useState(false)
  const [showUserProfile, setShowUserProfile] = useState(false)
  const [showDailyChallenge, setShowDailyChallenge] = useState(false)
  const [newAwards,   setNewAwards]     = useState([])
  const [prevSeasons, setPrevSeasons]  = useState([])  // history entries for prior seasons in this run
  const [streak, setStreak]           = useState(() => recordDailyLogin())
  const [streakBonus, setStreakBonus] = useState(() => getStreakData().bonusPending)
  const [previewManager,   setPreviewManager]   = useState(null) // coach landed (spin preview for TeamStrengthPanel)
  const [confirmedManager, setConfirmedManager] = useState(null) // coach confirmed by user click
  const [composition, setComposition] = useState(null) // squad role blueprint
  const [budgetLeft, setBudgetLeft]   = useState(STARTING_BUDGET) // ₹125cr auction budget
  const [seasonNumber, setSeasonNumber]       = useState(1)          // current season (1, 2, 3…)
  // runId: unique per app session — used to identify medals earned within the same continuous run
  const [runId] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  // Session awards: medals earned this session (in memory, merged to profile on sign-in)
  const sessionAwardIdsRef = useRef([])
  const prevUserRef = useRef(null)
  const [releasedPlayerNames, setReleasedPlayerNames] = useState(new Set()) // blocked by name for immediate next auction only
  const [impactSubOutName, setImpactSubOutName]     = useState(null)       // impact sub outgoing player name (added to released next retention)
  const [biddingWarsUsed, setBiddingWarsUsed]   = useState(0)          // max 4 bidding wars per draft
  const [draftConfirmAction, setDraftConfirmAction] = useState(null)   // null | 'back' | 'home'
  const [prevBudgetLeftover, setPrevBudgetLeftover] = useState(0)    // leftover from last auction
  const [retentionTeam, setRetentionTeam]     = useState([])         // full season-end team snapshot for retention screen
  const [showH2H,      setShowH2H]        = useState(false)
  const [h2hJoinId,    setH2hJoinId]      = useState(null)   // room ID from invite link
  const [h2hRoom,      setH2hRoom]        = useState(null)   // active H2H draft room
  const [h2hLeagueRoom, setH2hLeagueRoom] = useState(null)  // active shared league room
  const [h2hSimContext, setH2hSimContext] = useState(null)   // { roomId, opponentName, opponentTeam, myUserId } during sim
  const [h2hResultCtx, setH2hResultCtx] = useState(null)   // same data preserved for results screen
  const [activeChallenge, setActiveChallenge] = useState(null) // daily challenge in progress
  const [showLiveCup, setShowLiveCup]     = useState(false)
  const [liveCupCtx, setLiveCupCtx]       = useState(null)   // set to { draftMode:true } during draft, full ctx during sim
  const liveCupDraftDoneRef = useRef(null)                   // callback: (team, mgr, ratingType) → save + return to lobby
  const [showFriendsCup, setShowFriendsCup] = useState(false)
  const [friendsCupCtx, setFriendsCupCtx]   = useState(null)  // { roomId, playerId, displayName } during sim
  const [fcupJoinCode,  setFcupJoinCode]    = useState(null)  // room code from deep link
  const [showWeeklyCup, setShowWeeklyCup]   = useState(false)
  const [weeklyCupCtx, setWeeklyCupCtx]     = useState(null)  // { playerId, displayName, weekKey } during sim
  const [comingSoonMsg, setComingSoonMsg] = useState(null)   // brief toast for unbuilt features
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  function handleModeSelect(m) {
    setMode(m)
    setPhase('settings')
  }

  // Settings → draft (composition is now chosen inline in DraftSettings)
  function handleSettingsStart(s) {
    setSettings(s)
    setTeam([])
    setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    setRerollsLeft(s.rerolls ?? 3)
    // Streak bonus only rewarded to signed-in users
    const bonus = user ? consumeStreakBonus() : 0
    setBudgetLeft((s.budget ?? STARTING_BUDGET) + bonus)
    setStreakBonus(0)  // shown on banner — now consumed
    setBiddingWarsUsed(0)
    // Composition is passed directly from DraftSettings (null when freePositions=true)
    setComposition(s.composition ?? null)
    setPhase('draft')
  }

  function handleCompositionDone(comp) {
    setComposition(comp)
    setPhase('draft')
  }

  // After team is complete → pick a manager
  function handleGoToManager() {
    setPhase('manager')
  }

  // Manager selected → start simulation (or save to live cup if in cup draft mode)
  function handleManagerSelect(mgr) {
    setManager(mgr)
    if (seasonModeRef.current) {
      seasonModeRef.current = false
      setSeasonDraft({ team, manager: mgr, settings })
      setPhase('season')
      return
    }
    if (liveCupCtx?.draftMode && liveCupDraftDoneRef.current) {
      // Live cup: save team to Supabase via callback, then return to lobby
      const cb = liveCupDraftDoneRef.current
      liveCupDraftDoneRef.current = null
      setLiveCupCtx(null)
      setShowLiveCup(true)
      setPhase('menu')
      // Fire the save callback (async — LiveCup handles Supabase write)
      cb(team, mgr, settings?.ratingType ?? 'overall')
      return
    }
    setPhase('simulate')
  }

  function handlePlayerPicked(player) {
    // Always insert in sorted batting order so TeamSheet list and CricketOval match
    setTeam(prev => sortByBattingOrder([...prev, player]))
    setDraftedIds(prev => new Set([...prev, player.id]))
  }

  function handleReroll() {
    setRerollsLeft(r => Math.max(0, r - 1))
  }

  function handleSimDone(sum, results) {
    // Apply impact sub team swap — finalTeam reflects the squad that played the playoffs
    const finalTeam = sum.finalTeam ?? team
    if (sum.finalTeam) setTeam(sortByBattingOrder(sum.finalTeam))
    // Store impact sub outgoing player name — will be added to releasedPlayerNames at retention
    if (sum.impactSubLog?.out?.name) setImpactSubOutName(sum.impactSubLog.out.name)

    setSummary(sum)
    setMatchResults(results)
    setPhase('results')
    incrementTotalPlays()  // global counter — works for everyone, logged in or not

    // Record season + check awards. Awards only saved to localStorage if signed in.
    const { newlyEarned, profile } = recordSeason({
      mode,
      wins:         sum.wins,
      losses:       sum.losses,
      total:        sum.total,
      stageReached: sum.stageReached,
      iplOutcome:   sum.iplOutcome,
      iplPosition:  sum.iplPosition,
      perfect:      sum.perfect,
      difficulty:     settings?.difficulty,
      ratingType:     settings?.ratingType,
      manager,
      team:           finalTeam,
      composition,
      runId,
      seasonNumber,
      freePositions:  settings?.freePositions  ?? false,
      overseasLimit:  settings?.overseasLimit   ?? true,
      biddingWars:    settings?.biddingWars     ?? true,
      hiddenRatings:  settings?.hardMode        ?? false,
      budget:         settings?.budget          ?? STARTING_BUDGET,
    }, !!user)
    if (newlyEarned.length > 0) {
      const newIds = newlyEarned.map(a => a.id)
      // Always accumulate in session ref (so they can be saved on sign-in)
      sessionAwardIdsRef.current = [...new Set([...sessionAwardIdsRef.current, ...newIds])]
      setNewAwards(newlyEarned)
      // If already signed in, push straight to Supabase immediately
      if (user) saveAwards(user.id, newIds)
    }
    // Store prior seasons for the share card (history[0] = current season just recorded; history.slice(1) = prior)
    setPrevSeasons((profile.history ?? []).slice(1).filter(h => h.runId === runId))

    // Record play streak (once per calendar day)
    const newStreak = recordPlayStreak()
    setStreak(newStreak)
    setStreakBonus(getStreakData().bonusPending)

    // Save to Supabase if signed in; mark as saved so deferred-save doesn't double-fire
    resultSavedRef.current = false  // reset for this new game
    if (user) {
      resultSavedRef.current = true
      saveGameResult(user.id, {
        mode,
        wins:         sum.wins,
        losses:       sum.losses,
        total:        sum.total,
        stageReached: sum.stageReached,
        iplOutcome:   sum.iplOutcome,
        iplPosition:  sum.iplPosition,
        perfect:      sum.perfect,
      })
    }

    // ── Friends Cup result submission ─────────────────────────────────────────
    // Cumulative: read existing wins/losses, then add this season's totals.
    // Keep ctx so handlePlayAgain can re-open the lobby.
    const fCtx = friendsCupCtx
    if (fCtx?.roomId) {
      getSupabase().then(async sb => {
        if (!sb) return
        // Fetch existing row to accumulate across seasons
        const { data: existing } = await sb.from('friends_cup_results')
          .select('wins,losses')
          .eq('room_id', fCtx.roomId)
          .eq('player_id', fCtx.playerId)
          .maybeSingle()
        const prevWins   = existing?.wins   ?? 0
        const prevLosses = existing?.losses ?? 0
        await sb.from('friends_cup_results').upsert({
          room_id:       fCtx.roomId,
          player_id:     fCtx.playerId,
          display_name:  fCtx.displayName,
          wins:          prevWins + sum.wins,
          losses:        prevLosses + sum.losses,
          stage_reached: sum.stageReached ?? null,
          ipl_outcome:   sum.iplOutcome ?? null,
          submitted_at:  new Date().toISOString(),
        }, { onConflict: 'room_id,player_id' })
      })
      // friendsCupCtx stays set so handlePlayAgain can re-open the lobby
    }

    // ── Weekly Cup result submission ──────────────────────────────────────────
    const wCtx = weeklyCupCtx
    if (wCtx?.weekKey) {
      getSupabase().then(sb => {
        if (!sb) return
        sb.from('weekly_cup_entries').upsert({
          week_key:     wCtx.weekKey,
          player_id:    wCtx.playerId,
          display_name: wCtx.displayName,
          mode:         mode,
          wins:         sum.wins,
          losses:       sum.losses,
          total:        sum.total ?? (sum.wins + sum.losses),
          stage_reached: sum.stageReached ?? null,
          ipl_outcome:  sum.iplOutcome ?? null,
          submitted_at: new Date().toISOString(),
        }, { onConflict: 'week_key,player_id' })
      })
      // weeklyCupCtx stays set so handlePlayAgain can re-open the leaderboard
    }
  }

  function handlePlayAgain() {
    // If coming from a cup, re-open the cup lobby instead of the main menu
    const returnToFriendsCup = !!friendsCupCtx?.roomId
    const returnToWeeklyCup  = !!weeklyCupCtx?.weekKey
    const returnToLiveCup    = !!liveCupCtx?.roomId

    seasonModeRef.current = false
    setMode(null); setPhase('menu')
    setTeam([]); setDraftedIds(new Set())
    setSettings(null); setManager(null)
    setRerollsLeft(3)
    setSummary(null); setMatchResults([])
    setNewAwards([])
    setPreviewManager(null); setConfirmedManager(null)
    setComposition(null)
    setBudgetLeft(STARTING_BUDGET)
    setActiveChallenge(null)
    setSeasonNumber(1)
    setReleasedPlayerNames(new Set())
    setImpactSubOutName(null)
    setPrevBudgetLeftover(0)
    setRetentionTeam([])
    setH2hResultCtx(null)
    window.__activeChallenge = null

    if (returnToFriendsCup) {
      setFriendsCupCtx(null)
      setShowFriendsCup(true)
    } else if (returnToWeeklyCup) {
      setWeeklyCupCtx(null)
      setShowWeeklyCup(true)
    } else if (returnToLiveCup) {
      setLiveCupCtx(null)
      setShowLiveCup(true)
    } else {
      setFriendsCupCtx(null)
      setWeeklyCupCtx(null)
      setLiveCupCtx(null)
    }
  }

  function handleBackToSettings() {
    setPhase('settings')
    setTeam([]); setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    setComposition(null)
    setBudgetLeft(STARTING_BUDGET)
    // Clear any release blocks — back-to-settings is a full restart so these shouldn't persist
    setReleasedPlayerNames(new Set())
    setImpactSubOutName(null)
  }

  // Draft back/home with confirmation when players picked
  function handleDraftBack() {
    if (team.length > 0) setDraftConfirmAction('back')
    else handleBackToComposition()
  }
  function handleDraftHome() {
    if (team.length > 0) setDraftConfirmAction('home')
    else handlePlayAgain()
  }
  function handleDraftConfirmYes() {
    const action = draftConfirmAction
    setDraftConfirmAction(null)
    if (action === 'home') handlePlayAgain()
    else handleBackToComposition()
  }

  // Back from draft → settings (S1) or retention screen (S2+)
  function handleBackToComposition() {
    if (seasonNumber > 1) {
      // In S2+, undo the season increment from handleRetentionDone so re-confirming works correctly
      setSeasonNumber(n => n - 1)
      setTeam([])
      setDraftedIds(new Set())
      setManager(null)
      setPreviewManager(null); setConfirmedManager(null)
      // retentionTeam snapshot still holds the full season-end XI for the retention screen
      setPhase('retention')
    } else {
      setPhase('settings')
      setTeam([]); setDraftedIds(new Set())
      setManager(null)
      setPreviewManager(null); setConfirmedManager(null)
      setComposition(null)
      setBudgetLeft(STARTING_BUDGET)
    }
  }

  // Results → retention window (next season) — IPL only
  function handleNextSeason() {
    setPrevBudgetLeftover(budgetLeft)   // save unused auction budget
    setRetentionTeam([...team])         // snapshot full 11-player team for retention screen
    setPhase('retention')
  }

  // Results → fresh draft (next season) — ODI/T20 WC (no retention screen)
  function handleNextSeasonWC() {
    setSeasonNumber(n => n + 1)
    setTeam([])
    setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    setComposition(settings?.composition ?? null)
    setRerollsLeft(settings?.rerolls ?? 3)
    setBudgetLeft(STARTING_BUDGET)
    setBiddingWarsUsed(0)
    setSummary(null); setMatchResults([])
    setNewAwards([])
    setReleasedPlayerNames(new Set())
    setImpactSubOutName(null)
    setPhase('draft')
  }

  // Retention confirmed → straight to draft (keep Season 1 composition, pre-fill retained players)
  function handleRetentionDone({ retained, releasedIds, newBudget }) {
    setSeasonNumber(n => n + 1)
    // releasedIds is now a Set of names; also include the impact sub outgoing player
    const allReleased = new Set(releasedIds)
    if (impactSubOutName) allReleased.add(impactSubOutName)
    setReleasedPlayerNames(allReleased)
    setImpactSubOutName(null)  // consumed
    setBudgetLeft(newBudget)
    // Pre-fill team and draftedIds with retained players
    setTeam(retained)
    setDraftedIds(new Set(retained.map(p => p.id)))
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    // composition stays from Season 1 — we reuse it so slot needs are computed correctly
    setRerollsLeft(settings?.rerolls ?? 3)  // fresh rerolls for the new auction
    setSummary(null); setMatchResults([])
    setNewAwards([])
    setPhase('draft')   // skip composition screen, go straight to auction
  }

  // Retry bidding: keep composition + settings, reset squad + budget
  function handleRetryBidding() {
    setTeam([])
    setDraftedIds(new Set())
    setManager(null)
    setPreviewManager(null); setConfirmedManager(null)
    setBudgetLeft(STARTING_BUDGET)
    setRerollsLeft(settings?.rerolls ?? 3)
  }

  // Persistent challenge banner — shown across all phases while a daily challenge is active
  const BANNER_H = 38
  const challengeBanner = activeChallenge ? (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1100,
      background: 'linear-gradient(90deg, #7a0a14, #C8102E)',
      padding: '0 1.25rem',
      height: BANNER_H,
      display: 'flex', alignItems: 'center', gap: '0.625rem',
      boxShadow: '0 2px 12px rgba(200,16,46,0.35)',
    }}>
      <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
        🗓️ Daily Challenge
      </span>
      <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff', flexShrink: 0 }}>
        {activeChallenge.constraint_label}
      </span>
      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        — {activeChallenge.constraint_desc}
      </span>
    </div>
  ) : null

  const btnBase = {
    width: 44, height: 44, borderRadius: '50%',
    background: 'var(--card)', border: '1px solid var(--border)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    transition: 'border-color 0.2s, color 0.2s',
  }

  const profileBtn = null

  // Profile full-screen page takeover
  if (showProfile) return (
    <ProfileModal
      onClose={() => setShowProfile(false)}
      newlyEarned={newAwards}
      user={user}
      onSignIn={signInWithGoogle}
    />
  )

  // Live Friends Cup full-page takeover
  if (showLiveCup) {
    return (
      <LiveCup
        user={user}
        onHome={() => {
          try { sessionStorage.removeItem('lcup_session') } catch {}
          setShowLiveCup(false)
          setLiveCupCtx(null)
        }}
        onStartDraft={(cupMode, cupSettings = {}, onDraftDone) => {
          // Kick off a normal draft in the chosen mode, but in live-cup context
          liveCupDraftDoneRef.current = onDraftDone
          setMode(cupMode || 'ipl')
          // Compute filteredEntries + composition from stored settings
          const allTeams = cupSettings.allTeams ?? false
          const filteredEntries = allTeams
            ? [...MODE_CONFIG['ipl'].entries, ...MODE_CONFIG['odi-wc'].entries, ...MODE_CONFIG['t20-wc'].entries]
            : (MODE_CONFIG[cupMode || 'ipl']?.entries ?? [])
          const comp = (cupSettings.freePositions ?? false) ? null : { ...DEFAULT_COMP }
          setSettings({
            ...cupSettings,
            filteredEntries,
            composition: comp,
            hardMode: cupSettings.hiddenRatings ?? false,
            enableQTEs: cupSettings.enableQTEs ?? true,
            rerolls: cupSettings.rerolls ?? 3,
            inCupDraft: true,
          })
          setComposition(comp)
          setRerollsLeft(cupSettings.rerolls ?? 3)
          setTeam([]); setDraftedIds(new Set())
          setManager(null); setPreviewManager(null); setConfirmedManager(null)
          setBudgetLeft(cupSettings.budget ?? STARTING_BUDGET); setBiddingWarsUsed(0)
          // Signal that draft completion should save to cup, not start season
          setLiveCupCtx({ draftMode: true })
          setShowLiveCup(false)
          setPhase('draft')
        }}
        onStartSeason={(ctx, draftedTeam, draftedManager, ratingType) => {
          // Host clicked Start — begin the actual season with pre-calculated fixtures
          setLiveCupCtx(ctx)
          setTeam(sortByBattingOrder(draftedTeam))
          setMode(ctx.mode)
          setManager(draftedManager ?? null)
          setSettings(prev => ({ ...(prev ?? {}), ratingType: ratingType ?? 'overall', enableQTEs: true }))
          setShowLiveCup(false)
          setPhase('simulate')
        }}
      />
    )
  }

  // Friends Cup full-page takeover
  if (showFriendsCup) {
    return (
      <FriendsCup
        user={user}
        joinCode={fcupJoinCode}
        onHome={() => { setShowFriendsCup(false); setFriendsCupCtx(null); setFcupJoinCode(null) }}
        onStartSeason={(ctx, cupMode, roomSettings = {}) => {
          setFriendsCupCtx(ctx)
          setMode(cupMode || 'ipl')
          // Compute filteredEntries + composition from stored settings
          const allTeams = roomSettings.allTeams ?? false
          const filteredEntries = allTeams
            ? [...MODE_CONFIG['ipl'].entries, ...MODE_CONFIG['odi-wc'].entries, ...MODE_CONFIG['t20-wc'].entries]
            : (MODE_CONFIG[cupMode || 'ipl']?.entries ?? [])
          const comp = (roomSettings.freePositions ?? false) ? null : { ...DEFAULT_COMP }
          setSettings({
            ...roomSettings,
            filteredEntries,
            composition: comp,
            hardMode: roomSettings.hiddenRatings ?? false,
            enableQTEs: roomSettings.enableQTEs ?? true,
            rerolls: roomSettings.rerolls ?? 3,
            inCupDraft: true,
          })
          setComposition(comp)
          setRerollsLeft(roomSettings.rerolls ?? 3)
          setTeam([]); setDraftedIds(new Set())
          setManager(null); setPreviewManager(null); setConfirmedManager(null)
          setBudgetLeft(roomSettings.budget ?? STARTING_BUDGET); setBiddingWarsUsed(0)
          setShowFriendsCup(false)
          setPhase('draft')
        }}
      />
    )
  }

  // Weekly Cup full-page takeover
  if (showWeeklyCup) {
    return (
      <WeeklyCup
        user={user}
        onHome={() => { setShowWeeklyCup(false); setWeeklyCupCtx(null) }}
        onStartSeason={(ctx, cupMode) => {
          setWeeklyCupCtx(ctx)
          setMode(cupMode || 'ipl')
          setSettings({ ratingType: 'overall', difficulty: 'normal', rerolls: 3, freePositions: false, enableQTEs: true, inCupDraft: true })
          setTeam([]); setDraftedIds(new Set())
          setManager(null); setPreviewManager(null); setConfirmedManager(null)
          setBudgetLeft(STARTING_BUDGET); setBiddingWarsUsed(0)
          setComposition(null)
          setShowWeeklyCup(false)
          setPhase('settings')
        }}
      />
    )
  }

  // Shared League full-page takeover
  if (h2hLeagueRoom) {
    return (
      <SharedLeague
        room={h2hLeagueRoom}
        uid={sessionStorage.getItem('h2h_uid') ?? ''}
        onBack={() => { setH2hLeagueRoom(null) }}
      />
    )
  }

  // H2H active draft screen (full-page takeover)
  if (h2hRoom) {
    const handleH2HBack = () => { setH2hRoom(null); setShowH2H(false) }
    return (
      <H2HErrorBoundary onBack={handleH2HBack}>
      <H2HDraft
        room={h2hRoom}
        uid={sessionStorage.getItem('h2h_uid') ?? ''}
        onBack={handleH2HBack}
        onDone={finalRoom => {
          const myUid    = sessionStorage.getItem('h2h_uid') ?? ''
          const amHost   = myUid === finalRoom.host_id
          const myTeam   = sortByBattingOrder(amHost ? (finalRoom.host_team ?? []) : (finalRoom.guest_team ?? []))
          const oppTeam  = amHost ? (finalRoom.guest_team ?? []) : (finalRoom.host_team ?? [])
          const oppName  = amHost ? (finalRoom.guest_name ?? 'Opponent XI') : (finalRoom.host_name ?? 'Opponent XI')
          const myName   = amHost ? (finalRoom.host_name ?? 'My XI') : (finalRoom.guest_name ?? 'My XI')
          const oppUid   = amHost ? (finalRoom.guest_id ?? '') : (finalRoom.host_id ?? '')
          setH2hRoom(null)
          setShowH2H(false)
          setTeam(myTeam)
          setMode('ipl')
          setSettings({ ratingType: 'overall', difficulty: 'normal', rerolls: 0 })
          setManager(null)
          setH2hSimContext({ roomId: finalRoom.id, myUserId: myUid, myName, opponentName: oppName, opponentUserId: oppUid, opponentTeam: oppTeam })
          setPhase('simulate')
        }}
        onInitSharedLeague={async (finalRoom) => {
          // Host generates and saves the tournament
          const myUid     = sessionStorage.getItem('h2h_uid') ?? ''
          const hostName  = finalRoom.host_name ?? 'Host XI'
          const guestName = finalRoom.guest_name ?? 'Guest XI'
          const tournament = generateTournament(
            finalRoom.host_team ?? [], finalRoom.guest_team ?? [],
            null, null, hostName, guestName,
          )
          const sb = await getSupabase()
          if (sb) await sb.from('h2h_rooms').update({ tournament }).eq('id', finalRoom.id)
          // Host also transitions
          setH2hRoom(null)
          setShowH2H(false)
          setH2hLeagueRoom({ ...finalRoom, tournament })
        }}
        onSharedLeague={(finalRoom) => {
          // Guest transitions when tournament appears
          setH2hRoom(null)
          setShowH2H(false)
          setH2hLeagueRoom(finalRoom)
        }}
      />
      </H2HErrorBoundary>
    )
  }

  const globalOverlays = (
    <>
      {comingSoonMsg && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(8,8,14,0.92)', border: '1.5px solid rgba(255,255,255,0.15)',
          borderRadius: '0.75rem', padding: '0.75rem 1.5rem',
          color: '#fff', fontWeight: 700, fontSize: '0.9rem',
          zIndex: 9999, whiteSpace: 'nowrap',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          animation: 'fade-in-up 0.3s ease both',
        }}>
          {comingSoonMsg}
        </div>
      )}
      {challengeBanner}
      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} newAwards={newAwards} />
      )}
      {showH2H && (
        <H2HLobby
          onClose={() => { setShowH2H(false); setH2hJoinId(null) }}
          onStartDraft={(room, uid) => {
            setShowH2H(false)
            setH2hRoom(room)
          }}
          joinRoomId={h2hJoinId}
        />
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />}
      {showUserProfile && user && (
        <UserProfile
          user={user}
          onClose={() => setShowUserProfile(false)}
          onSignOut={() => { signOut(); setShowUserProfile(false) }}
        />
      )}
      {showDailyChallenge && (
        <DailyChallenge
          user={user}
          onClose={() => setShowDailyChallenge(false)}
          onPlay={(challenge) => {
            setShowDailyChallenge(false)
            setMode('ipl')
            setPhase('settings')
            setActiveChallenge(challenge)
            window.__activeChallenge = challenge
          }}
        />
      )}
      <MusicPlayer />
    </>
  )

  // ── Shared result view — shown when URL has #share=... ─────────────────────
  if (sharedResult) return <SharedResultView data={sharedResult} onPlay={() => setSharedResult(null)} />

  // ── Challenge accept screen — shown when URL has #challenge=... ─────────────
  if (challengeData) {
    const cd = challengeData
    const modeLabel = { ipl: 'IPL', 'odi-wc': 'ODI WC', 't20-wc': 'T20 WC' }[cd.m] || cd.m
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.25rem' }}>
        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⚔️</div>
          <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>Challenge</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.25rem' }}>
            Beat {cd.w}W–{cd.l}L
          </div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>
            {modeLabel} · {cd.rl} · You'll play with their exact squad — squad is locked. Can you do better?
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '0.875rem', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Their Squad</div>
            {(cd.sq || []).map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', borderBottom: i < cd.sq.length - 1 ? '1px solid var(--border)' : 'none', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text)', fontWeight: 700 }}>{p.n}</span>
                <span style={{ color: '#64748b' }}>{ROLE_FULL_LABEL[p.r] ?? p.r} · {p.o}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              // Reconstruct team from encoded squad data
              const reconstructed = (cd.sq || []).map(p => ({
                id: p.id || `challenge-${p.n}`,
                name: p.n, role: p.r,
                overall: p.o, batting: p.bt, bowling: p.bw, fielding: p.f,
                nationality: p.nat,
                iplTeam: p.it ?? null, iplYear: p.iy ?? null,
                primeOverall: p.po ?? p.o, primeBatting: p.pb ?? p.bt, primeBowling: p.pbw ?? p.bw,
              }))
              setTeam(reconstructed)
              setDraftedIds(new Set(reconstructed.map(p => p.id)))
              setMode(cd.m || 'ipl')
              setSettings({ ratingType: 'season', difficulty: 'normal', rerolls: 3, filteredEntries: [] })
              setChallengerResult({ wins: cd.w, losses: cd.l, ratingLabel: cd.rl, mode: cd.m })
              setChallengeData(null)
              window.location.hash = ''
              setPhase('manager')
            }}
            style={{
              width: '100%', padding: '1rem', marginBottom: '0.75rem',
              background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
              color: '#fff', border: 'none', borderRadius: '0.75rem',
              fontSize: '1rem', fontWeight: 900, cursor: 'pointer',
              boxShadow: '0 4px 20px #6366f133',
            }}
          >
            ⚔️ Accept Challenge
          </button>
          <button onClick={() => { setChallengeData(null); window.location.hash = '' }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.82rem', cursor: 'pointer' }}>
            No thanks, play normally →
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'menu')     return (
    <>
      <ModeSelect
        onSelect={(m) => { seasonModeRef.current = false; handleModeSelect(m) }}
        onSeason={async () => {
          const { loadSeason } = await import('./season/store.js')
          const saved = await loadSeason(user)
          if (saved) { setSeasonDraft(null); setPhase('season') }
          else { seasonModeRef.current = true; handleModeSelect('ipl') }
        }}
        onH2H={() => setShowH2H(true)}
        onDailyChallenge={() => setShowDailyChallenge(true)}
        onWeeklyCup={() => setShowWeeklyCup(true)}
        onFriendsCup={() => setShowFriendsCup(true)}
        onLiveCup={() => setShowLiveCup(true)}
        user={user}
        onSignIn={() => setShowAuth(true)}
        onGoogleSignIn={signInWithGoogle}
        onAccount={() => setShowUserProfile(true)}
        onMedals={() => { setNewAwards([]); setShowProfile(true) }}
        newAwards={newAwards}
        streak={streak}
        streakBonus={streakBonus}
      />
      {profileBtn}
      {globalOverlays}
    </>
  )
  if (phase === 'settings') return (
    <div style={{ paddingTop: activeChallenge ? BANNER_H : 0, minHeight: '100vh', position: 'relative' }}>
      <div className="page-overlay" />
      <DraftSettings
        mode={mode}
        onStart={handleSettingsStart}
        onBack={() => setPhase('menu')}
        defaultFreePositions={!!(friendsCupCtx || weeklyCupCtx || liveCupCtx?.draftMode)}
      />
      {profileBtn}
      {globalOverlays}
    </div>
  )
  if (phase === 'compose') return (
    <div style={{ paddingTop: activeChallenge ? BANNER_H : 0, minHeight: '100vh', position: 'relative' }}>
      <div className="page-overlay" />
      <SquadComposer onDone={handleCompositionDone} onBack={() => setPhase('settings')} onHome={handlePlayAgain} />
      {profileBtn}
      {globalOverlays}
    </div>
  )

  // Manager select now comes AFTER the draft is complete
  if (phase === 'manager')  return (
    <div style={{ paddingTop: activeChallenge ? BANNER_H : 0, minHeight: '100vh', position: 'relative' }}>
      <div className="page-overlay" />
      <ManagerSelect mode={mode} team={team} onSelect={handleManagerSelect} onBack={() => setPhase('draft')} />
      {profileBtn}
      {globalOverlays}
    </div>
  )

  if (phase === 'draft') {
    const slotsFilled = team.length
    const totalSlots  = POSITIONS.length
    const isDone      = slotsFilled === totalSlots
    const cfg         = MODE_CONFIG[mode]

    // Cup minimum validation: ≥1 WK, ≥1 opener, ≥1 bowler (any type)
    const inCupDraft  = !!(friendsCupCtx || weeklyCupCtx || liveCupCtx?.draftMode)
    const hasWK       = team.some(p => p.role === 'wicket-keeper')
    const hasOpener   = team.some(p => p.role === 'opener')
    const hasBowler   = team.some(p => p.role === 'pace-bowler' || p.role === 'spin-bowler')
    const cupMinsMet  = !inCupDraft || (hasWK && hasOpener && hasBowler)
    const missingRoles = inCupDraft && isDone && !cupMinsMet
      ? [!hasOpener && 'opener', !hasWK && 'wicket-keeper', !hasBowler && 'bowler'].filter(Boolean)
      : []

    return (
      <div style={{ minHeight: '100vh', paddingTop: activeChallenge ? 36 : 0, position: 'relative' }}>
        <div className="page-overlay" />
        {/* Sticky header */}
        <div className="draft-header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: activeChallenge ? 36 : 0, background: 'var(--card)',
          backdropFilter: 'blur(8px)', zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button onClick={handleDraftBack} style={{ background: 'rgba(200,16,46,0.12)', color: '#C8102E', border: '1px solid rgba(200,16,46,0.35)', borderRadius: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em' }}>
              ← Back
            </button>
            <button onClick={handleDraftHome} style={{ background: 'rgba(200,16,46,0.12)', color: '#C8102E', border: '1px solid rgba(200,16,46,0.35)', borderRadius: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em' }}>
              🏠 Home
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>
            <img src="/logo.png" alt="16-0" style={{ height: 28, width: 28, objectFit: 'contain' }} />
            {cfg.icon} {cfg.label}
            {settings?.hardMode && <span style={{ fontSize: '0.7rem', color: '#f59e0b', marginLeft: '0.5rem' }}>🔒 HARD</span>}
            {settings?.ratingType === 'prime' && <span style={{ fontSize: '0.7rem', color: '#a855f7', marginLeft: '0.5rem' }}>⚡ PRIME</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.85rem', color: isDone ? '#C8102E' : 'var(--text-muted)', fontWeight: 700 }}>
              {slotsFilled}/{totalSlots}
            </div>
          </div>
        </div>

        <div className="draft-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1.25rem', maxWidth: 1200, margin: '0 auto', padding: '1.25rem', alignItems: 'start' }}>

          {/* Left column — wheel or done banner + (desktop) team strength, manager, start */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '1rem', overflow: 'hidden' }}>
              {!isDone ? (
                <WheelSpin
                  mode={mode}
                  settings={settings}
                  composition={composition}
                  slotIndex={slotsFilled}
                  totalSlots={totalSlots}
                  draftedIds={draftedIds}
                  releasedPlayerIds={releasedPlayerNames}
                  team={team}
                  rerollsLeft={rerollsLeft}
                  onReroll={handleReroll}
                  onResult={handlePlayerPicked}
                  budget={mode === 'ipl' ? budgetLeft : null}
                  onSpend={amt => setBudgetLeft(b => Math.max(0, b - amt))}
                  onRetryFromBeginning={handleBackToSettings}
                  onRetryBidding={handleRetryBidding}
                  biddingWarsUsed={biddingWarsUsed}
                  onBiddingWar={() => setBiddingWarsUsed(n => n + 1)}
                  biddingWarsEnabled={mode === 'ipl' && (settings?.biddingWars ?? true)}
                />
              ) : (
                <div style={{ padding: '1.75rem 1.5rem', textAlign: 'center', animation: 'fade-in-up 0.4s ease both' }}>
                  <div style={{ fontSize: '0.72rem', color: '#C8102E', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                    XI Complete
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.5rem' }}>
                    Squad is set ✓
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                    Reorder your XI using the arrows on the right, then spin for a coach and start the season.
                  </div>
                </div>
              )}
            </div>

            {/* Team strength — desktop: always here. Mobile: only before coach confirmed */}
            {team.length > 0 && (!isMobile || !confirmedManager) && (
              <TeamStrengthPanel
                team={team}
                manager={isDone ? (confirmedManager || previewManager) : null}
                mode={mode}
                ratingType={settings?.ratingType ?? 'season'}
                showPenalty={isDone}
                hideStartButton={true}
                onStart={undefined}
              />
            )}

            {/* Cup minimum warning */}
            {isDone && missingRoles.length > 0 && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.625rem', fontSize: '0.8rem', color: '#ef4444', fontWeight: 700 }}>
                ⚠️ Cup requires at least 1 {missingRoles.join(', 1 ')}. Use a reroll to swap a player.
              </div>
            )}

            {/* Desktop only: ManagerSelect + Start Season button in left column */}
            {!isMobile && isDone && cupMinsMet && (
              <>
                <ManagerSelect
                  inline
                  mode={mode}
                  team={team}
                  onLand={mgr => setPreviewManager(mgr)}
                  onSelect={mgr => { setConfirmedManager(mgr); setPreviewManager(mgr) }}
                />
                {confirmedManager && (
                  <button
                    onClick={() => handleManagerSelect(confirmedManager)}
                    style={{
                      width: '100%', padding: '0.875rem',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: 'var(--bg)', border: 'none', borderRadius: '0.625rem',
                      fontSize: '1rem', fontWeight: 800,
                      cursor: 'pointer', letterSpacing: '0.03em',
                      animation: 'pulse-glow 2s ease infinite',
                    }}
                  >
                    🏏 Start Season →
                  </button>
                )}
              </>
            )}
          </div>

          {/* Right column — TeamSheet + (mobile) manager + (mobile, post-confirm) team strength */}
          <div className="draft-right-col" style={{
            position: 'sticky', top: activeChallenge ? 'calc(36px + 4.5rem)' : '4.5rem',
            height: activeChallenge ? 'calc(100vh - 5.5rem - 36px)' : 'calc(100vh - 5.5rem)',
            display: 'flex', flexDirection: 'column', gap: '0.625rem',
          }}>

            {/* TeamSheet takes all remaining space and scrolls internally if needed */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <TeamSheet
                team={team}
                onReorder={newOrder => setTeam(newOrder)}
                ratingType={settings?.ratingType}
                mode={mode}
                composition={composition}
              />
            </div>

            {/* Mobile only: ManagerSelect pinned below XI */}
            {isMobile && isDone && cupMinsMet && (
              <div style={{ flexShrink: 0 }}>
                <ManagerSelect
                  inline
                  mode={mode}
                  team={team}
                  onLand={mgr => setPreviewManager(mgr)}
                  onSelect={mgr => { setConfirmedManager(mgr); setPreviewManager(mgr) }}
                />
              </div>
            )}

            {/* Mobile only: team strength + start season below coach, only after confirmed */}
            {isMobile && confirmedManager && (
              <div style={{ flexShrink: 0 }}>
                <TeamStrengthPanel
                  team={team}
                  manager={confirmedManager}
                  mode={mode}
                  ratingType={settings?.ratingType ?? 'season'}
                  showPenalty={true}
                  hideStartButton={false}
                  onStart={() => handleManagerSelect(confirmedManager)}
                />
              </div>
            )}
          </div>
        </div>
      {profileBtn}
      {globalOverlays}
      {draftConfirmAction && (
        <ConfirmLeaveModal
          message="Your drafted players will be lost. Are you sure you want to go back?"
          onYes={handleDraftConfirmYes}
          onNo={() => setDraftConfirmAction(null)}
          onHome={() => { setDraftConfirmAction(null); handlePlayAgain() }}
        />
      )}
      </div>
    )
  }

  if (phase === 'season') return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="page-overlay" />
      <SeasonHub
        key={seasonDraft ? 'new' : 'saved'}
        user={user}
        draft={seasonDraft}
        onHome={() => { setSeasonDraft(null); handlePlayAgain() }}
        onNewSeason={() => { setSeasonDraft(null); seasonModeRef.current = true; setMode('ipl'); setPhase('settings') }}
      />
      {globalOverlays}
    </div>
  )

  if (phase === 'simulate') return (
    <div style={{ minHeight: '100vh', paddingTop: activeChallenge ? BANNER_H : 0, position: 'relative' }}>
      <div className="page-overlay" />
      <MatchSimulator
        team={team} mode={mode} manager={manager}
        ratingType={settings?.ratingType}
        freePositions={settings?.freePositions ?? false}
        enableQTEs={settings?.enableQTEs ?? true}
        onDone={(sum, results) => {
          if (h2hSimContext) setH2hResultCtx(h2hSimContext)
          setH2hSimContext(null)
          // Keep liveCupCtx alive so handlePlayAgain can detect and return to LiveCup
          handleSimDone(sum, results)
          // After sim, if returning from a cup we go back to results
          // (handleSimDone already sets phase to 'results')
        }}
        h2hContext={h2hSimContext}
        liveCupContext={liveCupCtx?.draftMode ? null : (liveCupCtx ?? null)}
        onHome={handlePlayAgain}
      />
      {profileBtn}
      {globalOverlays}
    </div>
  )

  if (phase === 'retention') return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="page-overlay" />
      {/* Home button bar for S2+ retention screen */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.625rem 1.25rem',
        background: 'var(--card)', borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(8px)',
      }}>
        <button
          onClick={handlePlayAgain}
          style={{ background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E', borderRadius: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700, padding: '0.3rem 0.65rem', letterSpacing: '0.02em' }}
        >
          🏠 Home
        </button>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f59e0b' }}>
          Season {seasonNumber + 1} Retention
        </div>
        <div style={{ width: 60 }} />
      </div>
      <RetentionScreen
        team={retentionTeam}          // snapshot of full season-end XI, not the live (possibly cleared) team
        prevBudgetLeftover={prevBudgetLeftover}
        seasonNumber={seasonNumber + 1}
        onConfirm={handleRetentionDone}
      />
      {globalOverlays}
    </div>
  )

  if (phase === 'results') return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="page-overlay" />
      <Results
        team={team} mode={mode} manager={manager}
        summary={summary} matchResults={matchResults}
        onPlayAgain={handlePlayAgain}
        onNextSeason={mode === 'ipl' ? handleNextSeason : handleNextSeasonWC}
        seasonNumber={seasonNumber}
        newAwards={newAwards}
        prevSeasons={prevSeasons}
        challengerResult={challengerResult}
        h2hContext={h2hResultCtx}
        user={user}
        onGoogleSignIn={signInWithGoogle}
        onShowAuth={() => setShowAuth(true)}
        restoredAfterAuth={restoredAfterAuth}
        cupCtx={
          friendsCupCtx?.roomId ? { type: 'friends', roomId: friendsCupCtx.roomId, playerId: friendsCupCtx.playerId }
          : liveCupCtx?.roomId  ? { type: 'live',    roomId: liveCupCtx.roomId,    playerId: liveCupCtx.playerId }
          : null
        }
      />
      {profileBtn}
      {globalOverlays}
    </div>
  )

  return null
}

// ── Shared result view ─────────────────────────────────────────────────────────

function SharedResultView({ data, onPlay }) {
  // Support both compact keys (new) and verbose keys (old shared links)
  const wins             = data.w   ?? data.wins
  const losses           = data.l   ?? data.losses
  const rating           = data.r   ?? data.rating
  const mode             = data.m   ?? data.mode
  const potm             = data.p   ?? data.potm
  const topScorer        = data.ts  ?? data.topScorer
  const topScorerRuns    = data.sr  ?? data.topScorerRuns
  const topWicketTaker   = data.tw  ?? data.topWicketTaker
  const topWicketTakerWkts = data.wk ?? data.topWicketTakerWkts
  const manager          = data.mg  ?? data.manager
  const stage            = data.st  ?? data.stage
  const team             = data.tm  ?? data.team ?? []
  // Awards: encoded as ["icon|name", ...] strings
  const awards = (data.aw ?? []).map(s => {
    const idx = s.indexOf('|')
    return idx === -1 ? { icon: '🏅', name: s } : { icon: s.slice(0, idx), name: s.slice(idx + 1) }
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.25)', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, color: '#C8102E', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
            Cricket 16-0 · {mode || 'Season'}
          </div>
          <div style={{ fontSize: '3rem', lineHeight: 1 }}>🏆</div>
        </div>

        {/* Main card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1rem' }}>

          {/* Record */}
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '2.75rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>
              {wins}W <span style={{ color: '#64748b', fontSize: '1.8rem' }}>–</span> {losses}L
            </div>
            {stage && <div style={{ fontSize: '0.8rem', color: '#C8102E', fontWeight: 700, marginTop: '0.35rem' }}>{stage}</div>}
            <div style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.2rem 0.75rem', background: '#C8102E18', border: '1px solid #C8102E33', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, color: '#C8102E' }}>{rating}</div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1.25rem' }}>
            {potm && (
              <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Player of Tournament</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>{potm}</div>
              </div>
            )}
            {topScorer && (
              <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Top Run Scorer</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>{topScorer}</div>
                {topScorerRuns && <div style={{ fontSize: '0.72rem', color: '#C8102E', fontWeight: 700 }}>{topScorerRuns} runs</div>}
              </div>
            )}
            {topWicketTaker && (
              <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Top Wicket Taker</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>{topWicketTaker}</div>
                {topWicketTakerWkts && <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700 }}>{topWicketTakerWkts} wickets</div>}
              </div>
            )}
            {manager && (
              <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem' }}>
                <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Manager</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>{manager}</div>
              </div>
            )}
          </div>

          {/* Team names */}
          {team.length > 0 && (
            <div>
              <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Their XI</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {team.map((name, i) => (
                  <span key={i} style={{ padding: '0.2rem 0.6rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)' }}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Medal cards */}
        {awards.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '1.25rem', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.6rem' }}>
              🏅 Medals Earned
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {awards.map((award, i) => (
                <div key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 0.75rem',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.06))',
                  border: '1.5px solid rgba(245,158,11,0.35)',
                  borderRadius: '0.625rem',
                }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>{award.icon}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1.1 }}>{award.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onPlay}
          style={{ width: '100%', padding: '1rem', background: '#C8102E', color: '#fff', border: 'none', borderRadius: '0.875rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(200,16,46,0.35)', letterSpacing: '0.02em' }}
        >
          Can you go unbeaten? Play Cricket 16-0 →
        </button>
        <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.72rem', color: '#64748b' }}>16zero.in</div>
      </div>
    </div>
  )
}
