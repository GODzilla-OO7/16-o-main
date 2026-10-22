/**
 * useStreak — daily login streak tracking.
 * Increments once per calendar day on first app visit.
 * Bonus budget milestones granted when completing a season.
 * Stored in localStorage; no server needed.
 */

const STREAK_KEY    = 'cricket16_playStreak'
const LAST_DAY_KEY  = 'cricket16_lastPlayDay'
const BONUS_KEY     = 'cricket16_streakBonusPending'

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayStr()     { return new Date().toDateString() }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toDateString() }

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Read current streak data without mutating anything.
 * Returns { streak, playedToday, bonusPending }
 */
export function getStreakData() {
  try {
    const raw       = parseInt(localStorage.getItem(STREAK_KEY)  || '0', 10)
    const lastDay   = localStorage.getItem(LAST_DAY_KEY) || null
    const today     = todayStr()
    const yesterday = yesterdayStr()

    // Streak is dead if last play wasn't today or yesterday
    const alive     = lastDay === today || lastDay === yesterday
    const streak    = alive ? raw : 0

    return {
      streak,
      playedToday:  lastDay === today,
      bonusPending: parseInt(localStorage.getItem(BONUS_KEY) || '0', 10),
    }
  } catch {
    return { streak: 0, playedToday: false, bonusPending: 0 }
  }
}

/**
 * Called on app load (first visit of the day).
 * Increments the streak counter — no bonus granted here.
 * Returns the new streak count.
 */
export function recordDailyLogin() {
  try {
    const today   = todayStr()
    const lastDay = localStorage.getItem(LAST_DAY_KEY)
    if (lastDay === today) {
      // Already recorded today — just return current streak
      return parseInt(localStorage.getItem(STREAK_KEY) || '0', 10)
    }
    const current   = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10)
    const newStreak = lastDay === yesterdayStr() ? current + 1 : 1
    localStorage.setItem(STREAK_KEY,   String(newStreak))
    localStorage.setItem(LAST_DAY_KEY, today)
    return newStreak
  } catch {
    return 1
  }
}

/**
 * Called when the user finishes a season.
 * Does NOT increment streak (login already did that).
 * Checks milestone bonuses and queues them if crossed.
 * Returns the current streak count.
 */
export function recordPlayStreak() {
  try {
    // Login already incremented the streak — just check bonus milestones
    const streak  = parseInt(localStorage.getItem(STREAK_KEY) || '1', 10)
    const prev    = Math.max(0, streak - 1)
    const bonus    = getStreakBonus(streak)
    const prevBonus = getStreakBonus(prev)
    if (bonus > prevBonus) {
      localStorage.setItem(BONUS_KEY, String(bonus))
    }
    return streak
  } catch {
    return 0
  }
}

/**
 * Consume the pending bonus budget (call when a draft starts).
 * Returns the bonus amount (0 if none) and clears it.
 */
export function consumeStreakBonus() {
  try {
    const bonus = parseInt(localStorage.getItem(BONUS_KEY) || '0', 10)
    if (bonus > 0) localStorage.removeItem(BONUS_KEY)
    return bonus
  } catch {
    return 0
  }
}

/**
 * Returns the bonus budget (₹cr) unlocked at a given streak length.
 * 3 days → +₹5cr, 7 days → +₹10cr, 14 days → +₹15cr
 */
export function getStreakBonus(streak) {
  if (streak >= 14) return 15
  if (streak >= 7)  return 10
  if (streak >= 3)  return 5
  return 0
}
