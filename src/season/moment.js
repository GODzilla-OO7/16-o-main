// Playable-moment rules: pure functions so they can be tuned and tested.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const pick = arr => arr[Math.floor(Math.random() * arr.length)]

export const LINES = ['off', 'stumps', 'leg']
export const LENGTHS = ['yorker', 'good', 'short', 'full']
const DIR_FOR_LINE = { off: 'off', stumps: 'straight', leg: 'leg' }

// ─── Batting ────────────────────────────────────────────────────────────
// Timing windows in ms either side of the perfect moment.
// Better batter → wider; better bowler → tighter.
export function timingWindows(batR, bowlR) {
  const perfect = clamp(14 + (batR - 50) * 0.8 - (bowlR - 60) * 0.35, 10, 55)
  return { perfect, good: perfect * 2.6, edge: 260 }
}

// AI delivery for the player to face.
export function aiDelivery(bowlR) {
  if (Math.random() < 0.04 + Math.max(0, 70 - bowlR) * 0.002) return { wide: true, line: pick(['off', 'leg']), length: 'good', travel: 900 }
  const line = Math.random() < 0.45 ? 'stumps' : pick(['off', 'leg'])
  const length = pick(['yorker', 'good', 'good', 'short', 'full'])
  // Faster for better bowlers and yorkers
  const travel = Math.round(clamp(1000 - (bowlR - 50) * 4 + (length === 'short' ? 60 : 0) - (length === 'yorker' ? 70 : 0) + (Math.random() * 120 - 60), 700, 1150))
  return { line, length, travel }
}

// `offset` = swing time − perfect time in ms (negative = early), null = no swing.
export function battingResult({ offset, dir, ball, batR, bowlR }) {
  const w = timingWindows(batR, bowlR)
  if (ball.wide) return { o: { extra: 'wd', runs: 0 }, text: 'WIDE', tone: 'x' }
  const match = dir === DIR_FOR_LINE[ball.line] || (ball.length === 'short' && dir === 'leg')
  const onStumps = ball.line === 'stumps' && ball.length !== 'short'
  const abs = offset == null ? Infinity : Math.abs(offset)

  if (abs <= w.perfect) {
    if (match) {
      const p6 = clamp(0.3 + (batR - 50) / 120, 0.25, 0.75)
      return Math.random() < p6 ? { o: { runs: 6, boundary: true }, text: 'PERFECT! SIX', tone: 'b6' } : { o: { runs: 4, boundary: true }, text: 'PERFECT! FOUR', tone: 'b4' }
    }
    return Math.random() < 0.5 ? { o: { runs: 4, boundary: true }, text: 'Timed — FOUR', tone: 'b4' } : { o: { runs: 2 }, text: 'Wrong side — 2 runs', tone: '' }
  }
  if (abs <= w.good) {
    if (Math.random() < 0.04) return { o: { runs: 1, wicket: 'runout' }, text: 'Run out going for the second!', tone: 'w' }
    if (match) return Math.random() < 0.4 ? { o: { runs: 2 }, text: 'Good shot — 2', tone: '' } : { o: { runs: 1 }, text: 'Good — 1 run', tone: '' }
    if (Math.random() < 0.08) return { o: { wicket: 'caught', runs: 0 }, text: 'Mistimed — CAUGHT!', tone: 'w' }
    return Math.random() < 0.5 ? { o: { runs: 1 }, text: 'Squeezed a single', tone: '' } : { o: { runs: 0 }, text: 'Straight to the fielder', tone: '' }
  }
  if (abs <= w.edge) {
    const early = offset < 0
    if (onStumps && !early && Math.random() < 0.35) return { o: { wicket: Math.random() < 0.6 ? 'bowled' : 'lbw', runs: 0 }, text: 'Too late — BOWLED!', tone: 'w' }
    const pCatch = clamp(0.3 + (bowlR - batR) / 200, 0.15, 0.5)
    if (Math.random() < pCatch) return { o: { wicket: 'caught', runs: 0 }, text: `${early ? 'Too early' : 'Too late'} — edged and CAUGHT!`, tone: 'w' }
    return Math.random() < 0.5 ? { o: { runs: 1 }, text: 'Edge! They scramble 1', tone: '' } : { o: { runs: 0 }, text: `${early ? 'Early' : 'Late'} — dot ball`, tone: '' }
  }
  if (onStumps && Math.random() < 0.85) return { o: { wicket: Math.random() < 0.7 ? 'bowled' : 'lbw', runs: 0 }, text: 'Missed — BOWLED!', tone: 'w' }
  return { o: { runs: 0 }, text: offset == null ? 'Left alone — dot' : 'Swing and a miss — dot', tone: '' }
}

// ─── Bowling ────────────────────────────────────────────────────────────
// Release meter: green zone half-width as a fraction of the bar.
// Better bowler → bigger zone (more reliable execution).
export function releaseZone(bowlR) {
  const perfect = clamp(0.04 + (bowlR - 50) * 0.0018, 0.025, 0.12)
  return { perfect, ok: perfect * 2.4 }
}

// Each batter has a favourite length they punish (stable per name).
export function hotLength(name) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return LENGTHS[h % LENGTHS.length]
}

const LEN_FX = {
  yorker: { W: 1.3, 6: 0.45, 4: 0.7, 0: 1.25, 1: 1.1 },
  good: { W: 1.1, 6: 0.8, 4: 0.9, 0: 1.2, 1: 1 },
  short: { W: 1.25, 6: 1.5, 4: 1.1, 0: 1, 1: 0.9 },
  full: { W: 0.8, 6: 1.6, 4: 1.5, 0: 0.7, 1: 1 },
}
const LINE_FX = {
  stumps: { W: 1.2, 6: 1, 4: 0.9, 0: 1, 1: 1 },
  off: { W: 1.05, 6: 0.85, 4: 1.1, 0: 1.1, 1: 1 },
  leg: { W: 0.8, 6: 1.3, 4: 1.2, 0: 0.9, 1: 1.1 },
}

// exec: 'perfect' | 'ok' | 'miss' from the release meter. history = previous [line,length] picks this over.
export function bowlingResult({ line, length, exec, batR, bowlR, batterName, history = [] }) {
  if (exec === 'miss') {
    if (Math.random() < 0.45) return { o: { extra: 'wd', runs: 0 }, text: 'Slipped out — WIDE', tone: 'x' }
    length = 'full'; line = 'leg'
  }
  const edge = (batR - bowlR) / 100
  const p = { 0: 0.3, 1: 0.32, 2: 0.07, 4: 0.13, 6: 0.08, W: 0.07 }
  p.W *= Math.exp(-edge * 1.8); p[4] *= Math.exp(edge * 1.3); p[6] *= Math.exp(edge * 1.5)
  for (const k of Object.keys(p)) p[k] *= (LEN_FX[length][k] ?? 1) * (LINE_FX[line][k] ?? 1)
  if (exec === 'perfect') { p.W *= 1.3; p[6] *= 0.7; p[4] *= 0.85; p[0] *= 1.15 }
  if (exec === 'miss') { p[6] *= 1.8; p[4] *= 1.4; p.W *= 0.5 }
  if (hotLength(batterName) === length) { p[6] *= 1.45; p[4] *= 1.25; p.W *= 0.8 }
  const repeats = history.filter(([l, n]) => l === line && n === length).length
  if (repeats) { const f = 1 + 0.35 * repeats; p[6] *= f; p[4] *= f; p.W /= f }

  const tot = Object.values(p).reduce((s, x) => s + x, 0)
  let r = Math.random() * tot, k = '0'
  for (const [key, v] of Object.entries(p)) { if ((r -= v) <= 0) { k = key; break } }
  if (k === 'W') {
    const how = line === 'stumps' && (length === 'yorker' || length === 'good') ? (Math.random() < 0.65 ? 'bowled' : 'lbw') : 'caught'
    return { o: { wicket: how, runs: 0 }, text: how === 'caught' ? 'Got him — CAUGHT!' : how === 'bowled' ? 'Timber! BOWLED!' : 'Plumb — LBW!', tone: 'w' }
  }
  const runs = +k
  const words = { 0: 'Dot ball!', 1: 'Single', 2: 'Two runs', 4: 'FOUR', 6: 'SIX' }
  const tag = exec === 'miss' ? 'Full toss — ' : ''
  return { o: { runs, boundary: runs >= 4 }, text: tag + words[runs], tone: runs === 6 ? 'b6' : runs === 4 ? 'b4' : '' }
}
