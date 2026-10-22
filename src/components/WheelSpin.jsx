import { useState, useRef, useEffect } from 'react'
import { getPrimeRatings } from '../data/players.js'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Role display ─────────────────────────────────────────────────────────

function roleCategory(role) {
  if (role === 'wicket-keeper') return 'WK'
  if (role === 'all-rounder')  return 'ALL-RDR'
  if (['pace-bowler','spin-bowler'].includes(role)) return role === 'pace-bowler' ? 'PACE' : 'SPIN'
  return 'BATTER'
}

const CAT_COLOR = {
  'BATTER':  '#C8102E',
  'WK':      '#f59e0b',
  'ALL-RDR': '#C8102E',
  'PACE':    '#ef4444',
  'SPIN':    '#a855f7',
}

// ─── Spin rarity ─────────────────────────────────────────────────────────

function spinRarity(entry) {
  if (!entry?.players?.length) return null
  const sorted = [...entry.players].map(p => scaleDisplay(p.overall)).sort((a, b) => b - a)
  const top5   = sorted.slice(0, Math.min(5, sorted.length))
  const avg    = top5.reduce((s, v) => s + v, 0) / top5.length
  if (avg >= 91) return { label: '⚡ GOD TIER',     color: '#f59e0b', bg: '#f59e0b18', border: '#f59e0b55' }
  if (avg >= 84) return { label: '🔥 Top 5% pick',  color: '#ef4444', bg: '#ef444418', border: '#ef444455' }
  if (avg >= 77) return { label: '✨ Rare squad',    color: '#a855f7', bg: '#a855f718', border: '#a855f755' }
  if (avg >= 70) return { label: '💫 Solid pull',   color: '#C8102E', bg: '#C8102E18', border: '#C8102E55' }
  return null
}

// ─── Auction budget ───────────────────────────────────────────────────────

export const STARTING_BUDGET = 110  // ₹110 cr

// Price in crores based on display overall rating (1–99).
// Quadratic curve: unknowns ≈ ₹0.5cr, stars ≈ ₹20-30cr.
export function calcPrice(rating) {
  const raw = 0.5 + Math.pow(Math.max(0, rating - 58) / 41, 2) * 29.5
  return Math.round(Math.min(30, raw) * 2) / 2   // round to nearest 0.5
}

function fmtCr(cr) {
  return cr >= 1 ? `₹${cr}cr` : `₹${Math.round(cr * 100)}L`
}

// ─── Rating scaling + prime ───────────────────────────────────────────────

function scaleDisplay(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }
// Prime shows the player's career peak — no inflation, raw historical best
function scalePrime(v)   { return Math.max(1, Math.min(99, v)) }

function displayRating(player, ratingType, mode) {
  if (ratingType === 'prime') {
    const primeMap = getPrimeRatings(mode)
    return {
      overall: scalePrime(primeMap[player.name] ?? player.overall),
      batting: scalePrime(player.primeBatting ?? player.batting),
      bowling: scalePrime(player.primeBowling ?? player.bowling),
    }
  }
  return { overall: scaleDisplay(player.overall), batting: scaleDisplay(player.batting), bowling: scaleDisplay(player.bowling) }
}

// ─── IPL overseas rule ────────────────────────────────────────────────────

// In IPL only India-nationality players count as domestic; all others are overseas
const isOverseas = (p) => p.nationality !== 'India'

// ─── Position enforcement ─────────────────────────────────────────────────

// With composition: returns which roles are over-quota (should be locked out)
// and which roles are strictly needed right now (must-pick)
function getPositionNeeds(team, composition) {
  const remaining = 11 - team.length
  const needs = []

  if (composition) {
    // Count how many of each role are already drafted
    const filled = {}
    for (const p of team) filled[p.role] = (filled[p.role] || 0) + 1
    // Find roles that still have quota and haven't been filled
    for (const [role, quota] of Object.entries(composition)) {
      const have = filled[role] || 0
      const still = quota - have
      if (still > 0) {
        // Is it a must-pick? Yes if remaining slots === total still needed across all roles
        const totalStillNeeded = Object.entries(composition)
          .reduce((s, [r, q]) => s + Math.max(0, q - (filled[r] || 0)), 0)
        needs.push({ role, label: roleName(role), must: remaining <= totalStillNeeded && still >= remaining })
      }
    }
  } else {
    // Fallback: original hard-coded rules
    const hasWK   = team.some(p => p.role === 'wicket-keeper')
    const openers = team.filter(p => p.role === 'opener').length
    const bowlers = team.filter(p => ['pace-bowler','spin-bowler'].includes(p.role)).length
    if (!hasWK)      needs.push({ role: 'wicket-keeper', label: 'WK',    must: remaining <= 1 })
    if (openers < 2) needs.push({ role: 'opener',        label: 'Opener', must: remaining <= (2 - openers) })
    if (bowlers < 3) needs.push({ role: 'bowler',        label: 'Bowler', must: remaining <= (3 - bowlers) })
  }
  return needs
}

// Cup-mode mandatory minimums: ≥1 WK, ≥1 opener, ≥1 bowler — enforced even when freePositions=true
function getCupMinimumNeeds(team) {
  const remaining = 11 - team.length
  const needs = []
  const hasWK     = team.some(p => p.role === 'wicket-keeper')
  const hasOpener = team.some(p => p.role === 'opener')
  const hasBowler = team.some(p => p.role === 'pace-bowler' || p.role === 'spin-bowler')
  const unmet = (!hasWK ? 1 : 0) + (!hasOpener ? 1 : 0) + (!hasBowler ? 1 : 0)
  if (!hasWK)     needs.push({ role: 'wicket-keeper', label: 'WK',    must: remaining <= unmet })
  if (!hasOpener) needs.push({ role: 'opener',        label: 'Opener', must: remaining <= unmet })
  if (!hasBowler) needs.push({ role: 'bowler',        label: 'Bowler', must: remaining <= unmet })
  return needs
}

// Is a player's role already full per the composition?
function isRoleFull(player, team, composition) {
  if (!composition) return false
  const quota = composition[player.role] || 0
  const have  = team.filter(p => p.role === player.role).length
  return have >= quota
}

function roleName(role) {
  const m = { 'opener': 'Opener', 'top-order': 'Top Order', 'middle-order': 'Mid Order',
    'wicket-keeper': 'WK', 'all-rounder': 'All-Rdr', 'pace-bowler': 'Pace', 'spin-bowler': 'Spin' }
  return m[role] || role
}

function isBowler(p) { return ['pace-bowler','spin-bowler'].includes(p.role) }
function satisfiesNeed(player, need) {
  if (need.role === 'bowler') return isBowler(player)
  return player.role === need.role
}

// Extract year from season string or number ("2024" → "2024", "2019 ODI WC" → "2019", 2019 → "2019")
function extractYear(season) {
  if (typeof season === 'number') return String(season)
  return season?.match(/\d{4}/)?.[0] ?? String(season ?? '')
}

// ─── Main ─────────────────────────────────────────────────────────────────

const MARQUEE_THRESHOLD = 86  // display overall at/above this triggers a bidding war

export default function WheelSpin({
  mode, settings, composition, slotIndex, totalSlots,
  draftedIds, releasedPlayerIds, team, rerollsLeft, onReroll, onResult,
  budget, onSpend, onRetryFromBeginning, onRetryBidding,
  biddingWarsUsed = 0, onBiddingWar,
  biddingWarsEnabled = true,
}) {
  const [phase, setPhase]             = useState('idle')
  const [landedEntry, setLandedEntry] = useState(null)
  const [cycleEntry, setCycleEntry]   = useState(null)
  const [activeBiddingPlayer, setActiveBiddingPlayer] = useState(null)  // triggers bidding war overlay
  const cycleRef = useRef(null)

  const entries             = settings.filteredEntries
  const hardMode            = settings.hardMode
  const ratingType          = settings.ratingType || 'season'
  const freePositions       = settings.freePositions ?? false
  const inCupDraft          = settings.inCupDraft ?? false
  const overseasLimitEnabled = settings.overseasLimit ?? true

  // Position needs — full composition enforcement unless freePositions.
  // In cup draft mode, even with freePositions=true, enforce the 3 mandatory minimums (WK/opener/bowler).
  const needs    = !freePositions ? getPositionNeeds(team, composition)
                 : inCupDraft     ? getCupMinimumNeeds(team)
                 : []
  const mustPick = needs.find(n => n.must) || null

  // IPL overseas rule — only enforced when overseasLimit is ON
  const isIPLMode            = mode === 'ipl'
  const overseasInTeam       = isIPLMode ? team.filter(p => isOverseas(p)).length : 0
  const overseasLimitReached = isIPLMode && overseasLimitEnabled && overseasInTeam >= 4

  useEffect(() => () => clearTimeout(cycleRef.current), [])

  function startSpin() {
    // playSpinSound removed — tick clicks now fire per-team in tick()
    setPhase('spinning')
    setLandedEntry(null)

    // ── Pre-filter entries so we NEVER land on an impossible squad ──────────
    // A squad is valid if it has at least one player we can actually pick:
    //   • not already drafted (by id or name)
    //   • satisfies the current mandatory role (if any)
    //   • role slot not yet full per composition
    //   • not overseas-blocked (IPL: max 4 overseas)

    const draftedNameSet  = new Set(team.map(p => p.name))
    const currentNeeds    = !freePositions ? getPositionNeeds(team, composition)
                          : inCupDraft     ? getCupMinimumNeeds(team)
                          : []
    const currentMust     = currentNeeds.find(n => n.must) || null
    const overseasInTeamNow = isIPLMode ? team.filter(p => isOverseas(p)).length : 0
    const overseasFull    = isIPLMode && overseasLimitEnabled && overseasInTeamNow >= 4

    const budgetExhausted = budget != null && budget < 0.5

    function playerIsPickable(p) {
      // Already drafted?
      if (draftedIds.has(p.id) || draftedNameSet.has(p.name)) return false
      // Released last season (impact sub out or not retained) — blocked by name for one auction
      if (releasedPlayerIds?.has(p.name)) return false
      // Pakistani players are barred from the IPL since 2009
      if (isIPLMode && p.nationality === 'Pakistan') return false
      // Role quota full? (skipped in freePositions mode)
      if (!freePositions && isRoleFull(p, team, composition)) return false
      // Mandatory role not satisfied? (skipped in freePositions mode)
      if (currentMust && !satisfiesNeed(p, currentMust)) return false
      // Overseas blocked? (skipped when overseasLimit is OFF)
      if (overseasFull && isOverseas(p)) return false
      // Over budget? (skip check if budget exhausted — must always be able to proceed)
      if (!budgetExhausted && budget != null) {
        const price = calcPrice(displayRating(p, ratingType, mode).overall)
        if (price > budget) return false
      }
      return true
    }

    const spinnable = entries.filter(entry =>
      entry.players.some(playerIsPickable)
    )

    // Released players are NEVER relaxable — always excluded regardless of fallback tier
    const notReleased = p => !releasedPlayerIds?.has(p.name)

    // Tiered fallbacks: relax constraints one at a time so we always spin somewhere
    let pool = spinnable
    if (pool.length === 0) {
      // Relax mustPick (keep overseas + budget + released block)
      pool = entries.filter(entry =>
        entry.players.some(p =>
          !draftedIds.has(p.id) && !draftedNameSet.has(p.name) &&
          notReleased(p) &&
          (freePositions || !isRoleFull(p, team, composition)) &&
          !(overseasFull && isOverseas(p)) &&
          (budgetExhausted || budget == null || calcPrice(displayRating(p, 'season').overall) <= budget)
        )
      )
    }
    if (pool.length === 0) {
      // Relax overseas too (keep budget + released block)
      pool = entries.filter(entry =>
        entry.players.some(p =>
          !draftedIds.has(p.id) && !draftedNameSet.has(p.name) &&
          notReleased(p) &&
          (freePositions || !isRoleFull(p, team, composition)) &&
          (budgetExhausted || budget == null || calcPrice(displayRating(p, 'season').overall) <= budget)
        )
      )
    }
    if (pool.length === 0) {
      // Relax budget too — still keep released block
      pool = entries.filter(entry =>
        entry.players.some(p =>
          !draftedIds.has(p.id) && !draftedNameSet.has(p.name) &&
          notReleased(p) &&
          (freePositions || !isRoleFull(p, team, composition))
        )
      )
    }
    if (pool.length === 0) pool = entries  // absolute last resort (budget exhausted + fully constrained)
    const shuffled = shuffle(pool)
    const chosen = shuffled[Math.floor(Math.random() * shuffled.length)]
    const TOTAL_TICKS = 18
    let i = 0

    // Cubic ease-out: starts at 30ms, smoothly decelerates to 220ms over TOTAL_TICKS
    function getInterval(tick) {
      const t = tick / TOTAL_TICKS
      return Math.round(30 + 190 * (t * t * t))
    }

    function tick() {
      i++
      const isLast = i >= TOTAL_TICKS
      import('../utils/audioEngine.js').then(m => m.playTickClick()).catch(() => {})
      // Use shuffled pool so years change throughout the animation
      setCycleEntry(isLast ? chosen : shuffled[i % shuffled.length])
      if (isLast) {
        // Linger on chosen team before opening the player list
        cycleRef.current = setTimeout(() => {
          setLandedEntry(chosen)
          setPhase('selecting')
        }, 350)
      } else {
        cycleRef.current = setTimeout(tick, getInterval(i))
      }
    }
    cycleRef.current = setTimeout(tick, getInterval(0))
  }

  function spin() {
    if (phase === 'spinning') return
    startSpin()
  }

  function spinAgain() {
    if (rerollsLeft <= 0) return
    clearTimeout(cycleRef.current)
    onReroll()
    setLandedEntry(null)
    setCycleEntry(null)
    // Auto-spin immediately on reroll
    startSpin()
  }

  function pickPlayer(player, overridePriceCr) {
    const price = overridePriceCr ?? (budget != null ? calcPrice(displayRating(player, 'season').overall) : null)
    if (onSpend && price != null) {
      onSpend(Math.min(price, budget))   // never go below 0
    }
    // Attach the IPL squad they came from so TeamSheet can display it
    const enriched = {
      ...player,
      iplTeam: landedEntry?.teamName ?? null,
      iplYear: landedEntry?.season   ?? null,
    }
    onResult(enriched)
    setPhase('idle')
    setLandedEntry(null)
    setCycleEntry(null)
  }

  function tryPickPlayer(player) {
    // Check if this is a marquee player that should trigger a bidding war
    const displayOvr = displayRating(player, ratingType, mode).overall
    const basePrice  = calcPrice(displayRating(player, 'season').overall)
    const isMarquee  = displayOvr >= MARQUEE_THRESHOLD && !player._budgetBlocked
    const canBid     = biddingWarsEnabled && budget != null && biddingWarsUsed < 4
    if (isMarquee && canBid && Math.random() < 0.6) {
      setActiveBiddingPlayer({ player, basePrice })
      onBiddingWar?.()
      return
    }
    pickPlayer(player)
  }

  // Build + sort player list — always descending overall, eligible first when mustPick
  const draftedNames = new Set(team.map(p => p.name))
  const rawPlayers = landedEntry
    ? landedEntry.players.filter(p =>
        !draftedIds.has(p.id) &&
        !draftedNames.has(p.name) &&
        !releasedPlayerIds?.has(p.name)   // released players never appear in the pick list
      )
    : []

  // Always sort by overall descending
  const sortByOvr = arr => [...arr].sort((a, b) =>
    displayRating(b, ratingType, mode).overall - displayRating(a, ratingType, mode).overall
  )

  const budgetExhaustedDisplay = budget != null && budget < 0.5

  function withBudget(p) {
    const price = budget != null ? calcPrice(displayRating(p, 'season').overall) : null
    const budgetBlocked = price != null && price > budget
    return { ...p, _price: price, _budgetBlocked: budgetBlocked }
  }

  let squadPlayers
  if (mustPick) {
    const eligible   = sortByOvr(rawPlayers.filter(p => satisfiesNeed(p, mustPick) && (freePositions || !isRoleFull(p, team, composition))))
    const ineligible = sortByOvr(rawPlayers.filter(p => !satisfiesNeed(p, mustPick) || (!freePositions && isRoleFull(p, team, composition))))
    if (eligible.length === 0) {
      squadPlayers = sortByOvr(rawPlayers).map(p => ({ ...withBudget(p), _eligible: false }))
    } else {
      squadPlayers = [
        ...eligible.map(p => ({ ...withBudget(p), _eligible: true })),
        ...ineligible.map(p => ({ ...withBudget(p), _eligible: false })),
      ]
    }
  } else {
    squadPlayers = sortByOvr(rawPlayers).map(p => ({
      ...withBudget(p),
      _eligible: freePositions || !isRoleFull(p, team, composition),
    }))
  }

  const allDrafted = landedEntry && rawPlayers.length === 0

  // Detect stuck state: all players ineligible (role-full per composition)
  const hasAnyEligible = squadPlayers.some(p => p._eligible)
  const isStuck = !allDrafted && squadPlayers.length > 0 && !hasAnyEligible

  // When stuck with no rerolls → unlock all so user can always proceed
  if (isStuck && rerollsLeft === 0) {
    squadPlayers = squadPlayers.map(p => ({ ...p, _eligible: true }))
  }

  // Auto-reroll when stuck but rerolls are available
  useEffect(() => {
    if (phase === 'selecting' && isStuck && rerollsLeft > 0) {
      spinAgain()
    }
  }, [phase, landedEntry])  // eslint-disable-line react-hooks/exhaustive-deps

  // Budget truly stuck: no rerolls AND no affordable eligible players
  const isBudgetStuck = rerollsLeft === 0 &&
    squadPlayers.filter(p => p._eligible && !p._budgetBlocked).length === 0

  return (
    <div style={{ width: '100%' }}>
      {/* Bidding War overlay */}
      {activeBiddingPlayer && (
        <BiddingWarOverlay
          player={activeBiddingPlayer.player}
          basePrice={activeBiddingPlayer.basePrice}
          ratingType={ratingType}
          onWin={(finalPriceCr) => {
            setActiveBiddingPlayer(null)
            pickPlayer(activeBiddingPlayer.player, finalPriceCr)
          }}
          onPass={() => {
            setActiveBiddingPlayer(null)
            // Free re-spin — rival won the player, no reroll used
            setLandedEntry(null)
            setCycleEntry(null)
            startSpin()
          }}
        />
      )}

      {phase !== 'selecting' ? (
        <SpinPhase
          phase={phase}
          cycleEntry={cycleEntry}
          slotIndex={slotIndex}
          totalSlots={totalSlots}
          needs={needs}
          mustPick={mustPick}
          rerollsLeft={rerollsLeft}
          budget={budget}
          isIPLMode={isIPLMode}
          overseasInTeam={overseasInTeam}
          overseasLimitReached={overseasLimitReached}
          overseasLimitEnabled={overseasLimitEnabled}
          onSpin={spin}
        />
      ) : (
        <SelectPhase
          entry={landedEntry}
          players={squadPlayers}
          allDrafted={allDrafted}
          compositionUnlocked={isStuck && rerollsLeft === 0}
          budgetExhausted={budgetExhaustedDisplay}
          budgetStuck={isBudgetStuck}
          hardMode={hardMode}
          ratingType={ratingType}
          mode={mode}
          needs={needs}
          mustPick={mustPick}
          slotIndex={slotIndex}
          totalSlots={totalSlots}
          rerollsLeft={rerollsLeft}
          overseasInTeam={overseasInTeam}
          overseasLimitReached={overseasLimitReached}
          overseasLimitEnabled={overseasLimitEnabled}
          isIPLMode={isIPLMode}
          budget={budget}
          onPick={tryPickPlayer}
          onSpinAgain={spinAgain}
          onRetryFromBeginning={onRetryFromBeginning}
          onRetryBidding={onRetryBidding}
        />
      )}
    </div>
  )
}

// ─── Spin phase ───────────────────────────────────────────────────────────

function BudgetBar({ budget }) {
  if (budget == null) return null
  const spent = STARTING_BUDGET - budget
  const pct   = Math.max(0, Math.min(100, (budget / STARTING_BUDGET) * 100))
  const color  = budget < 20 ? '#ef4444' : budget < 40 ? '#f59e0b' : '#22c55e'
  const label  = budget < 20 ? 'Low funds' : budget < 40 ? 'Spend wisely' : 'Healthy purse'
  return (
    <div style={{
      width: '100%', maxWidth: 360,
      background: 'var(--card2)',
      border: `1.5px solid ${color}44`,
      borderRadius: '0.75rem',
      padding: '0.75rem 1rem',
      boxShadow: `0 2px 12px ${color}18`,
      transition: 'border-color 0.3s, box-shadow 0.3s',
    }}>
      {/* Top row: icon + label + remaining amount */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '1rem' }}>💰</span>
          <div>
            <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Auction Purse</div>
            <div style={{ fontSize: '0.62rem', color, fontWeight: 700 }}>{label}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color, lineHeight: 1, transition: 'color 0.3s', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCr(budget)}
          </div>
          <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>of ₹{STARTING_BUDGET}cr · spent {fmtCr(spent)}</div>
        </div>
      </div>
      {/* Bar */}
      <div style={{ height: 7, background: 'var(--border2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 4,
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          transition: 'width 0.4s ease, background 0.3s',
        }} />
      </div>
    </div>
  )
}

function OverseasTracker({ overseasInTeam, limitReached }) {
  const slots = [0, 1, 2, 3]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      padding: '0.5rem 0.875rem',
      background: limitReached ? '#ef444410' : 'var(--card2)',
      border: `1.5px solid ${limitReached ? '#ef444455' : 'var(--card-border)'}`,
      borderRadius: '0.625rem',
    }}>
      <span style={{ fontSize: '0.75rem' }}>✈️</span>
      <div>
        <div style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>
          Overseas slots
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {slots.map(i => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: '50%',
              background: i < overseasInTeam ? '#C8102E' : 'transparent',
              border: `2px solid ${i < overseasInTeam ? '#C8102E' : 'var(--border)'}`,
              transition: 'background 0.2s, border-color 0.2s',
            }} />
          ))}
        </div>
      </div>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: limitReached ? '#ef4444' : 'var(--muted)', marginLeft: 'auto' }}>
        {overseasInTeam}/4
      </div>
      {limitReached && (
        <div style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 700 }}>FULL</div>
      )}
    </div>
  )
}

function SpinPhase({ phase, cycleEntry, slotIndex, totalSlots, needs, mustPick, rerollsLeft, budget, isIPLMode, overseasInTeam, overseasLimitReached, overseasLimitEnabled, onSpin }) {
  const isSpinning = phase === 'spinning'
  const year = cycleEntry ? extractYear(cycleEntry.season) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem 1rem', animation: 'fade-in 0.3s ease both' }}>
      {budget != null && <BudgetBar budget={budget} />}
      {isIPLMode && overseasLimitEnabled && <OverseasTracker overseasInTeam={overseasInTeam} limitReached={overseasLimitReached} />}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: '0.3rem' }}>
          Pick {slotIndex + 1} of {totalSlots}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.3rem' }}>
          {rerollsLeft} reroll{rerollsLeft !== 1 ? 's' : ''} remaining
        </div>
        {mustPick && (
          <div style={{ display: 'inline-block', padding: '0.2rem 0.75rem', background: '#f59e0b22', border: '1px solid #f59e0b55', borderRadius: '999px', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            ⚠ Must pick a {mustPick.label} this round
          </div>
        )}
      </div>

      {/* Ticker — now shows "Team Year" prominently */}
      <div className="wheel-ticker" style={{
        width: '100%', maxWidth: 360, minHeight: 110, borderRadius: '1rem',
        border: `2px solid ${cycleEntry ? cycleEntry.color + '88' : 'var(--card-border)'}`,
        background: cycleEntry ? cycleEntry.color + '14' : 'var(--card)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
        boxShadow: cycleEntry && isSpinning ? `0 0 30px ${cycleEntry.color}33` : 'none',
      }}>
        {cycleEntry ? (
          <>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: cycleEntry.color, marginBottom: '0.15rem' }}>{cycleEntry.badge}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>
              {cycleEntry.teamName}
            </div>
            {year && (
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', marginTop: '0.25rem' }}>
                {year}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600 }}>Spin to land on a team</div>
        )}
      </div>

      <button
        className="spin-btn"
        onClick={onSpin}
        disabled={isSpinning}
        style={{
          padding: '0.875rem 2.75rem',
          background: isSpinning ? 'transparent' : '#C8102E',
          color: isSpinning ? '#64748b' : '#fff',
          border: isSpinning ? '1px solid var(--border)' : 'none',
          borderRadius: '0.75rem', fontSize: '0.95rem', fontWeight: 800,
          cursor: isSpinning ? 'default' : 'pointer', minWidth: 180,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}
      >
        {isSpinning ? 'Spinning…' : 'Spin Wheel'}
      </button>
    </div>
  )
}

// ─── Select phase ─────────────────────────────────────────────────────────

function SelectPhase({ entry, players, allDrafted, compositionUnlocked, budgetExhausted, budgetStuck, hardMode, ratingType, mode, needs, mustPick, slotIndex, totalSlots, rerollsLeft, overseasInTeam, overseasLimitReached, overseasLimitEnabled, isIPLMode, budget, onPick, onSpinAgain, onRetryFromBeginning, onRetryBidding }) {
  const canReroll = rerollsLeft > 0
  const year      = extractYear(entry.season)
  const rarity    = spinRarity(entry)

  return (
    <div style={{ animation: 'fade-in 0.2s ease both', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Budget stuck overlay */}
      {budgetStuck && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'var(--card)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '2rem', textAlign: 'center', borderRadius: '0.5rem',
          animation: 'fade-in 0.3s ease both',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💸</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.6rem' }}>
            Full team cannot be made.
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.6, marginBottom: '1.75rem', maxWidth: 280 }}>
            Your remaining budget can't cover any available player. Pick a path forward.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', width: '100%', maxWidth: 260 }}>
            <button
              onClick={onRetryBidding}
              style={{
                padding: '0.875rem', background: '#C8102E',
                color: '#fff', border: 'none', borderRadius: '0.625rem',
                fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              🔄 Start team pick from scratch
            </button>
            <div style={{ fontSize: '0.65rem', color: '#475569', margin: '0.1rem 0' }}>
              Keeps your tournament & mode — resets squad & budget
            </div>
            <button
              onClick={onRetryFromBeginning}
              style={{
                background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E',
                borderRadius: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700,
                padding: '0.3rem 0.65rem', letterSpacing: '0.02em',
              }}
            >
              🏠 Home
            </button>
            <div style={{ fontSize: '0.65rem', color: '#475569', margin: '0.1rem 0' }}>
              Back to the beginning
            </div>
          </div>
        </div>
      )}
      {/* Header — shows "TeamName · YEAR" prominently */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: entry.color + '18', borderBottom: `1px solid ${entry.color}33` }}>
        <div>
          <div style={{ fontSize: '0.62rem', color: entry.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.15rem' }}>
            Pick {slotIndex + 1} of {totalSlots}
          </div>
          {/* Team + year as one combined prominent line */}
          <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {entry.teamName}
            <span style={{
              padding: '0.15rem 0.6rem',
              background: 'var(--border2)',
              border: '1.5px solid var(--card-border)',
              borderRadius: '999px',
              fontSize: '0.8rem', fontWeight: 900, color: 'var(--text)',
            }}>
              {year}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: entry.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, color: entry.textColor }}>
            {entry.badge}
          </div>
          {rarity && (
            <div style={{
              padding: '0.15rem 0.6rem',
              background: rarity.bg, border: `1px solid ${rarity.border}`,
              borderRadius: '999px', color: rarity.color,
              fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
            }}>
              {rarity.label}
            </div>
          )}
        </div>
      </div>

      {/* Budget bar */}
      {budget != null && (
        <div style={{ padding: '0.5rem 1.25rem', background: 'var(--card2)', borderBottom: '1px solid var(--border2)' }}>
          <BudgetBar budget={budget} />
          {budgetExhausted && (
            <div style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700, marginTop: '0.3rem', textAlign: 'center' }}>
              💸 Budget exhausted — only free agents available
            </div>
          )}
        </div>
      )}

      {/* Overseas tracker (IPL only, when limit is ON) */}
      {isIPLMode && overseasLimitEnabled && (
        <div style={{ padding: '0.4rem 1.25rem', background: 'var(--card2)', borderBottom: '1px solid var(--border2)' }}>
          <OverseasTracker overseasInTeam={overseasInTeam} limitReached={overseasLimitReached} />
        </div>
      )}

      {/* Info bar */}
      <div style={{ padding: '0.45rem 1.25rem', background: 'var(--card)', borderBottom: '1px solid var(--border2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: compositionUnlocked ? '#ef4444' : mustPick ? '#f59e0b' : '#64748b' }}>
          {compositionUnlocked
            ? '⚠ No matching players — pick anyone'
            : mustPick
            ? `⚠ Must pick a ${mustPick.label} — others shown below`
            : hardMode ? '🔒 Hard Mode'
            : budget != null
              ? `${players.filter(p => p._eligible && !p._budgetBlocked).length} affordable · ${ratingType === 'prime' ? '⚡ Prime' : '📅 Season'} ratings`
              : `${players.filter(p => p._eligible).length} available · ${ratingType === 'prime' ? '⚡ Prime' : '📅 Season'} ratings`
          }
        </span>
        {canReroll ? (
          <button onClick={onSpinAgain} style={{ background: 'none', border: 'none', color: '#C8102E', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            ↺ Different team ({rerollsLeft} left)
          </button>
        ) : (
          <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600 }}>No rerolls left</span>
        )}
      </div>

      {/* Player list */}
      <div style={{ background: 'var(--card)', overflowY: 'auto', maxHeight: '55vh' }}>
        {allDrafted ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>All players from this squad are already in your XI.</div>
            {canReroll && (
              <button onClick={onSpinAgain} style={{ padding: '0.75rem 1.5rem', background: 'var(--border2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700 }}>
                ↺ Spin again
              </button>
            )}
          </div>
        ) : (
          players.map((player, i) => {
            const isNeeded      = !mustPick && needs.some(n => satisfiesNeed(player, n))
            const isMustPick    = mustPick ? satisfiesNeed(player, mustPick) : false
            const isIneligible  = !player._eligible
            const overseas      = isIPLMode && isOverseas(player)
            const overseasBlock = overseasLimitReached && overseas
            const budgetBlock   = !!player._budgetBlocked

            // Divider between eligible+affordable and rest
            const showDivider = i > 0 && (
              (mustPick && !player._eligible && players[i-1]._eligible) ||
              (!mustPick && budgetBlock && !players[i-1]._budgetBlocked && players[i-1]._eligible)
            )

            return (
              <div key={player.id}>
                {showDivider && (
                  <div style={{ padding: '0.3rem 1.25rem', background: 'var(--bg)', fontSize: '0.6rem', color: 'var(--border)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', borderTop: '1px solid var(--border2)', borderBottom: '1px solid var(--border2)' }}>
                    {mustPick && !player._eligible ? 'Other players — wrong role' : 'Over budget'}
                  </div>
                )}
                <PlayerRow
                  player={player}
                  hardMode={hardMode}
                  ratingType={ratingType}
                  mode={mode}
                  teamColor={entry.color}
                  isLast={i === players.length - 1}
                  isNeeded={isNeeded}
                  isMustPick={isMustPick}
                  isIneligible={isIneligible || budgetBlock}
                  isOverseas={overseas}
                  isOverseasBlocked={overseasBlock}
                  isBudgetBlocked={budgetBlock}
                  onPick={isIneligible || overseasBlock || budgetBlock ? null : () => onPick(player)}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Player row ───────────────────────────────────────────────────────────

function PlayerRow({ player, hardMode, ratingType, mode, teamColor, isLast, isNeeded, isMustPick, isIneligible, isOverseas, isOverseasBlocked, isBudgetBlocked, onPick }) {
  const [hovered, setHovered] = useState(false)
  const cat     = roleCategory(player.role)
  const catClr  = CAT_COLOR[cat]
  const ratings = displayRating(player, ratingType, mode)
  const highlight = isMustPick ? '#f59e0b' : isNeeded ? '#C8102E' : null
  const blocked = isIneligible || isOverseasBlocked || isBudgetBlocked

  const opacity = blocked ? 0.38 : 1

  return (
    <div
      className="player-row"
      onClick={blocked ? undefined : onPick}
      onMouseEnter={() => !blocked && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.875rem',
        padding: '0.9rem 1.25rem',
        borderBottom: isLast ? 'none' : '1px solid var(--border2)',
        cursor: blocked ? 'not-allowed' : 'pointer',
        background: blocked ? 'transparent' : hovered ? (highlight ? highlight + '15' : teamColor + '10') : highlight ? highlight + '08' : 'transparent',
        transition: 'background 0.12s',
        borderLeft: highlight && !blocked ? `3px solid ${highlight}` : '3px solid transparent',
        opacity,
      }}
    >
      {/* Role category badge */}
      <div style={{
        padding: '0.2rem 0.5rem', borderRadius: '0.3rem', flexShrink: 0,
        background: catClr + '20', border: `1px solid ${catClr}44`,
        fontSize: '0.6rem', fontWeight: 900, color: catClr, letterSpacing: '0.06em',
        minWidth: 46, textAlign: 'center',
      }}>
        {cat}
      </div>

      {/* Name + nationality + indicators */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {player.name}
          {isOverseas && <span style={{ fontSize: '0.7rem' }} title="Overseas player">✈️</span>}
          {isMustPick && !blocked && <span style={{ marginLeft: '0.2rem', fontSize: '0.58rem', color: '#f59e0b', fontWeight: 800 }}>NEEDED</span>}
          {isNeeded && !isMustPick && !blocked && <span style={{ marginLeft: '0.2rem', fontSize: '0.58rem', color: '#C8102E', fontWeight: 800 }}>NEED</span>}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {player.nationality}
          {isOverseasBlocked && <span style={{ marginLeft: '0.4rem', color: '#ef444488', fontWeight: 700 }}>· Overseas limit reached</span>}
          {isBudgetBlocked && <span style={{ marginLeft: '0.4rem', color: '#ef444488', fontWeight: 700 }}>· Over budget</span>}
        </div>
      </div>

      {/* Ratings + Price */}
      {hardMode ? (
        <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--border)', letterSpacing: '0.1em' }}>???</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flexShrink: 0 }}>
          <MiniBar label="Bat"  value={ratings.batting} color="#4169E1" />
          <MiniBar label="Bowl" value={ratings.bowling} color="#3b82f6" />
          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f59e0b', minWidth: 30, textAlign: 'right' }}>
            {ratings.overall}
          </div>
          {player._price != null && (
            <div style={{
              padding: '0.15rem 0.4rem', borderRadius: '0.3rem',
              background: isBudgetBlocked ? '#ef444420' : '#22c55e18',
              border: `1px solid ${isBudgetBlocked ? '#ef444455' : '#22c55e44'}`,
              fontSize: '0.72rem', fontWeight: 800,
              color: isBudgetBlocked ? '#ef4444' : '#22c55e',
              whiteSpace: 'nowrap',
            }}>
              {fmtCr(player._price)}
            </div>
          )}
        </div>
      )}

      {!blocked && (
        <div style={{ color: hovered ? (highlight || teamColor) : 'var(--border)', fontSize: '1rem', transition: 'color 0.12s', flexShrink: 0 }}>→</div>
      )}
    </div>
  )
}

// ─── Bidding War ──────────────────────────────────────────────────────────────

const RIVAL_FRANCHISES = [
  { name: 'Mumbai Indians',        color: '#004C97', textColor: '#4d8fd4', icon: '🔵' },
  { name: 'Chennai Super Kings',   color: '#f5a623', textColor: '#f5a623', icon: '🟡' },
  { name: 'Royal Challengers',     color: '#c8102e', textColor: '#e84060', icon: '🔴' },
  { name: 'Kolkata Knight Riders', color: '#3a225d', textColor: '#9b6fd4', icon: '🟣' },
  { name: 'Delhi Capitals',        color: '#004c97', textColor: '#4d8fd4', icon: '🔷' },
  { name: 'Punjab Kings',          color: '#ed1b24', icon: '🟥' },
  { name: 'Rajasthan Royals',      color: '#ea1a8c', icon: '🌸' },
  { name: 'Sunrisers Hyderabad',   color: '#f7a721', icon: '🟠' },
]

// Probabilities per round: [lowerWins, higherWins, continues]
// Round 3 has no continues — 33/67 split and it ends
const ROUND_PROBS = [
  { lower: 0.22, higher: 0.39, continues: 0.39 },
  { lower: 0.30, higher: 0.60, continues: 0.10 },
  { lower: 0.33, higher: 0.67, continues: 0    },
]
const TIMER_SECS = 14

export function BiddingWarOverlay({ player, basePrice, ratingType, mode = 'ipl', onWin, onPass }) {
  const rival = useState(() => RIVAL_FRANCHISES[Math.floor(Math.random() * RIVAL_FRANCHISES.length)])[0]

  const [round, setRound]           = useState(1)
  const [rivalBid, setRivalBid]     = useState(basePrice)
  const [phase, setPhase]           = useState('bidding')  // 'bidding'|'won'|'lost'|'coinflip'
  const [timeLeft, setTimeLeft]     = useState(TIMER_SECS)
  const [resultMsg, setResultMsg]   = useState('')
  const [finalBid, setFinalBid]     = useState(null)
  const [coinFlipping, setCoinFlipping] = useState(false)

  const timerRef = useRef(null)

  // Timer — resets on each new round
  useEffect(() => {
    if (phase !== 'bidding') return
    setTimeLeft(TIMER_SECS)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setPhase('lost')
          setResultMsg("Time's up — you missed out!")
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [round, phase])

  function stopTimer() { clearInterval(timerRef.current) }

  function resolve(choice) {  // choice: 'lower' | 'higher'
    stopTimer()
    const probs = ROUND_PROBS[round - 1]
    const roll  = Math.random()

    if (roll < probs.lower) {
      // Lower was enough — both choices win; lower pays less
      const bid = rivalBid + (choice === 'lower' ? 3 : 6)
      setFinalBid(bid)
      setResultMsg(choice === 'lower' ? 'Your cautious raise was enough!' : 'Won! (the rival had already folded)')
      setPhase('won')
    } else if (roll < probs.lower + probs.higher) {
      // Higher was needed
      if (choice === 'higher') {
        const bid = rivalBid + 6
        setFinalBid(bid)
        setResultMsg('Your aggressive raise sealed it!')
        setPhase('won')
      } else {
        // Chose lower but higher was needed — rival wins this round
        setResultMsg(`${rival.name} outbid you! Not enough.`)
        setPhase('lost')
      }
    } else {
      // Continues — rival counter-raises by 1–3cr
      const counter = 1 + Math.floor(Math.random() * 3)
      setRivalBid(prev => Math.round((prev + counter) * 2) / 2)
      setRound(r => r + 1)
      // phase stays 'bidding'; useEffect fires on round change → resets timer
    }
  }

  function matchBid() {
    stopTimer()
    setCoinFlipping(true)
    setPhase('coinflip')
    setTimeout(() => {
      setCoinFlipping(false)
      if (Math.random() < 0.5) {
        setFinalBid(rivalBid)
        setResultMsg('Coin flip — heads! You win!')
        setPhase('won')
      } else {
        setResultMsg('Coin flip — tails. Rival wins.')
        setPhase('lost')
      }
    }, 1800)
  }

  const displayOvr = displayRating(player, ratingType, mode).overall
  const timerPct   = (timeLeft / TIMER_SECS) * 100
  const timerColor = timeLeft <= 4 ? '#ef4444' : timeLeft <= 8 ? '#f59e0b' : '#22c55e'
  const showMatchBid = phase === 'bidding' && round >= 2

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
      animation: 'fade-in 0.2s ease',
    }}>
      <div style={{
        maxWidth: 380, width: '100%',
        background: 'var(--card)',
        border: `2px solid ${rival.color}66`,
        borderRadius: '1.25rem',
        padding: '1.5rem',
        boxShadow: `0 0 40px ${rival.color}33`,
        textAlign: 'center',
        animation: 'fade-in-up 0.3s ease',
      }}>

        {/* Header + round indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            🔥 Bidding War
          </div>
          {phase === 'bidding' && (
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Round {round}{round === 3 ? ' (Final)' : ''}
            </div>
          )}
        </div>

        {/* Timer bar */}
        {phase === 'bidding' && (
          <div style={{ marginBottom: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Decide in</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 900, color: timerColor }}>{timeLeft}s</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${timerPct}%`, height: '100%',
                background: timerColor,
                borderRadius: 2,
                transition: 'width 1s linear, background 0.3s',
              }} />
            </div>
          </div>
        )}

        {/* Player */}
        <div style={{ marginBottom: '0.875rem' }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text)' }}>{player.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{player.nationality} · {player.role} · {displayOvr} OVR</div>
        </div>

        {/* Rival chip */}
        <div style={{
          padding: '0.5rem 0.875rem', marginBottom: '1rem',
          background: `${rival.color}18`, border: `1px solid ${rival.color}44`,
          borderRadius: '0.625rem', fontSize: '0.78rem', fontWeight: 800,
          color: rival.textColor ?? rival.color,
        }}>
          {phase === 'coinflip'
            ? (coinFlipping ? `${rival.icon} ${rival.name} — flipping coin…` : `${rival.icon} ${rival.name}`)
            : `${rival.icon} ${rival.name} ${phase === 'bidding' ? 'is bidding against you' : ''}`
          }
        </div>

        {/* Rival's current bid */}
        <div style={{ marginBottom: '1.1rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>
            {phase === 'won' ? 'You signed at' : phase === 'lost' ? 'Final bid' : `${rival.name}'s bid`}
          </div>
          <div style={{
            fontSize: '2.4rem', fontWeight: 900, lineHeight: 1,
            color: phase === 'won' ? '#22c55e' : phase === 'lost' ? '#ef4444' : '#f59e0b',
          }}>
            {phase === 'won' ? fmtCr(finalBid) : fmtCr(rivalBid)}
          </div>
          {phase === 'bidding' && (
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
              Base price: {fmtCr(basePrice)}
            </div>
          )}
          {(phase === 'won' || phase === 'lost') && resultMsg && (
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: phase === 'won' ? '#22c55e' : '#ef4444', marginTop: '0.35rem' }}>
              {resultMsg}
            </div>
          )}
          {phase === 'coinflip' && coinFlipping && (
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.35rem', animation: 'pulse-glow 0.6s ease infinite' }}>
              🪙 Flipping…
            </div>
          )}
        </div>

        {/* Action buttons */}
        {phase === 'bidding' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => resolve('lower')}
                style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' }}
              >
                Raise +₹3cr
              </button>
              <button
                onClick={() => resolve('higher')}
                style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg,#b45309,#d97706)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' }}
              >
                Raise +₹6cr
              </button>
            </div>

            {showMatchBid && (
              <button
                onClick={matchBid}
                style={{ width: '100%', padding: '0.65rem', background: 'linear-gradient(135deg,#4c1d95,#7c3aed)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}
              >
                🪙 Match Bid — Coin Flip (50/50)
              </button>
            )}

            <button
              onClick={onPass}
              style={{ width: '100%', padding: '0.65rem', background: 'transparent', color: '#94a3b8', border: '1px solid var(--border)', borderRadius: '0.625rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Let {rival.name} have it → spin again
            </button>
          </div>
        )}

        {phase === 'won' && finalBid != null && (
          <button
            onClick={() => onWin(finalBid)}
            style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg,#15803d,#22c55e)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 16px #22c55e33' }}
          >
            🎉 Sign {player.name} for {fmtCr(finalBid)}
          </button>
        )}

        {phase === 'lost' && (
          <button
            onClick={onPass}
            style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg,#7f1d1d,#dc2626)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.9rem', fontWeight: 900, cursor: 'pointer' }}
          >
            Back to auction →
          </button>
        )}
      </div>
    </div>
  )
}

function MiniBar({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', width: 42 }}>
      <div style={{ height: 4, background: 'var(--border2)', borderRadius: 2, marginBottom: 2 }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 600 }}>{label} {value}</div>
    </div>
  )
}
