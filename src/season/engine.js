// Season mode — ball-by-ball T20 engine.
// Innings are plain serialisable objects so a match can pause at the deciding
// over (the "moment"), be handed to the player, and resume.
import { WHEEL_ENTRIES } from '../data/players.js'

const BAT_ROLES = ['opener', 'top-order', 'middle-order', 'wicket-keeper', 'all-rounder']
const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15

// ─── Player ratings (form + fatigue applied in stage 3 via `mods`) ─────────
export function batRating(p, ratingType, mods) {
  const base = ratingType === 'prime' && p.primeBatting ? p.primeBatting : (p.batting ?? 40)
  return clamp(base + modBonus(p, mods), 5, 99)
}
export function bowlRating(p, ratingType, mods) {
  const base = ratingType === 'prime' && p.primeBowling ? p.primeBowling : (p.bowling ?? 0)
  return clamp(base + modBonus(p, mods), 0, 99)
}
function modBonus(p, mods) {
  const m = mods?.[p.id]
  if (!m) return 0
  return (m.form ?? 0) * 3 - Math.max(0, (m.fatigue ?? 0) - 50) * 0.15
}

export function teamStrength(xi, ratingType, mods) {
  const bats = xi.slice(0, 7).map(p => batRating(p, ratingType, mods))
  const bowls = xi.map(p => bowlRating(p, ratingType, mods)).sort((a, b) => b - a).slice(0, 5)
  const avg = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
  return avg(bats) * 0.5 + avg(bowls) * 0.5
}

// ─── Opponents ────────────────────────────────────────────────────────────
const IPL_ENTRIES = WHEEL_ENTRIES.filter(e => (e.competition || []).includes('ipl'))
const strip = p => ({ id: p.id, name: p.name, role: p.role, batting: p.batting, bowling: p.bowling,
  primeBatting: p.primeBatting, primeBowling: p.primeBowling, overall: p.overall })

export function opponentXI(teamName) {
  const pool = IPL_ENTRIES.filter(e => e.teamName === teamName && e.players?.length >= 11)
  const entry = pool[Math.floor(Math.random() * pool.length)] || IPL_ENTRIES[0]
  return { season: entry.season, badge: entry.badge, color: entry.color, xi: battingOrder(entry.players.slice(0, 11).map(strip)) }
}

const ORDER_W = { opener: 0, 'top-order': 1, 'wicket-keeper': 2, 'middle-order': 2, 'all-rounder': 3, 'pace-bowler': 4, 'spin-bowler': 4 }
export function battingOrder(xi) {
  return [...xi].sort((a, b) => (ORDER_W[a.role] ?? 3) - (ORDER_W[b.role] ?? 3) || (b.batting ?? 0) - (a.batting ?? 0))
}

export function pickReserves(team, count = 4) {
  const taken = new Set(team.map(p => p.name))
  const want = ['top-order', 'all-rounder', 'pace-bowler', 'spin-bowler', 'middle-order']
  const out = []
  const all = IPL_ENTRIES.flatMap(e => e.players).filter(p => p.overall <= 86 && p.overall >= 74)
  for (const role of want) {
    if (out.length >= count) break
    const c = all.filter(p => p.role === role && !taken.has(p.name))
    if (!c.length) continue
    const p = c[Math.floor(Math.random() * c.length)]
    taken.add(p.name)
    out.push({ ...p, id: `res-${p.id}` })
  }
  return out
}

// ─── Innings state ────────────────────────────────────────────────────────
export function newInnings({ batTeam, bowlTeam, batXI, bowlXI, target = null, maxBalls = 120, maxWkts = 10, ratingType, mods }) {
  const wktLimit = Math.min(maxWkts, batXI.length - 1)
  return {
    batTeam, bowlTeam, target, maxBalls, wktLimit, ratingType: ratingType || 'season',
    runs: 0, wkts: 0, balls: 0, extras: 0,
    bat: batXI.map(p => ({ id: p.id, name: p.name, r: batRating(p, ratingType, mods), runs: 0, balls: 0, fours: 0, sixes: 0, out: null, in: false, hit50: false, hit100: false })),
    bowl: bowlXI.map(p => ({ id: p.id, name: p.name, r: bowlRating(p, ratingType, mods), role: p.role, balls: 0, runs: 0, wkts: 0, streak: 0, overs: 0 })),
    striker: 0, nonStriker: 1, nextIn: 2,
    overs: [], // [{ bowler, balls: [label], runs, wkts }]
    curBowler: null, lastBowler: null,
    events: [], // milestones: { type, name, over }
    done: false,
  }
}

export const legalBallsInOver = inn => inn.balls % 6
export const oversText = balls => `${Math.floor(balls / 6)}.${balls % 6}`

// Pick the bowler for the next over: max 4 overs (1 in a super over), never two in a row.
export function chooseBowler(inn, forceIdx = null) {
  const perBowler = inn.maxBalls <= 6 ? 1 : 4
  if (forceIdx != null) return forceIdx
  const overNo = Math.floor(inn.balls / 6)
  const death = overNo >= 16 || inn.maxBalls <= 6
  const cands = inn.bowl
    .map((b, i) => ({ b, i }))
    .filter(({ b, i }) => b.overs < perBowler && i !== inn.lastBowler && b.r >= 25)
    .sort((x, y) => y.b.r - x.b.r)
  const top = cands.slice(0, 5)
  if (!top.length) {
    const any = inn.bowl.map((b, i) => i).filter(i => i !== inn.lastBowler)
    return any[0]
  }
  // Save the best for the death: early on, skip the best bowler sometimes.
  if (!death && top.length > 2 && top[0].b.overs >= 2 && Math.random() < 0.6) return top[1 + Math.floor(Math.random() * (top.length - 1))].i
  return Math.random() < 0.7 ? top[0].i : top[Math.floor(Math.random() * top.length)].i
}

function startOverIfNeeded(inn, forceBowler) {
  if (inn.curBowler == null) {
    inn.curBowler = chooseBowler(inn, forceBowler)
    inn.overs.push({ bowler: inn.bowl[inn.curBowler].name, bowlerIdx: inn.curBowler, balls: [], runs: 0, wkts: 0, sixesBy: {} })
  }
}

// AI outcome for one delivery. `pace` > 1 scores faster (used to steer chases to a close finish).
export function aiOutcome(inn, pace = 1) {
  startOverIfNeeded(inn)
  const b = inn.bat[inn.striker], w = inn.bowl[inn.curBowler]
  const edge = (b.r - w.r) / 100
  const overNo = Math.floor(inn.balls / 6)
  const pp = overNo < 6, death = overNo >= 16 || inn.maxBalls <= 6
  let p = { 0: 0.36, 1: 0.34, 2: 0.075, 3: 0.01, 4: 0.11, 6: 0.045, W: 0.05, wd: 0.03 }
  p.W *= Math.exp(-edge * 1.8) * (b.r < 40 ? 1.7 : 1)
  p[4] *= Math.exp(edge * 1.4) * (pp ? 1.25 : 1)
  p[6] *= Math.exp(edge * 1.6) * (death ? 1.7 : 1) * (b.r < 40 ? 0.5 : 1)
  if (death) { p[4] *= 1.15; p.W *= 1.3; p[0] *= 0.85 }
  for (const k of [1, 2, 4, 6]) p[k] *= pace
  p[0] /= pace
  const tot = Object.values(p).reduce((s, x) => s + x, 0)
  let roll = Math.random() * tot
  let pick = '0'
  for (const [k, v] of Object.entries(p)) { if ((roll -= v) <= 0) { pick = k; break } }
  if (pick === 'wd') return { extra: 'wd', runs: 0 }
  if (pick === 'W') {
    const spinner = w.role === 'spin-bowler'
    const r = Math.random()
    const how = r < 0.22 ? 'bowled' : r < 0.74 ? 'caught' : r < 0.86 ? 'lbw' : r < 0.95 ? 'runout' : spinner ? 'stumped' : 'caught'
    return { wicket: how, runs: how === 'runout' ? (Math.random() < 0.55 ? 1 : 0) : 0 }
  }
  const runs = +pick
  // Rare all-run four (max 4 by running — never more)
  if (runs === 4 && Math.random() < 0.02) return { runs: 4, boundary: false }
  return { runs, boundary: runs === 4 || runs === 6 }
}

export function ballLabel(o) {
  if (o.extra === 'wd') return 'Wd'
  if (o.wicket) return o.runs > 0 ? `${o.runs}+W` : 'W'
  return String(o.runs)
}

// Apply a delivery outcome. Returns { label, over: completedOver|null, events: [] }.
export function applyBall(inn, o, forceBowler = null) {
  if (inn.done) return null
  startOverIfNeeded(inn, forceBowler)
  const over = inn.overs[inn.overs.length - 1]
  const bw = inn.bowl[inn.curBowler]
  const label = ballLabel(o)
  const events = []
  over.balls.push(label)

  if (o.extra === 'wd') {
    inn.runs += 1; inn.extras += 1; bw.runs += 1; over.runs += 1
    checkEnd(inn)
    return { label, events, overDone: false }
  }

  const st = inn.bat[inn.striker]
  st.in = true; inn.bat[inn.nonStriker].in = true
  st.balls += 1; bw.balls += 1; inn.balls += 1
  const runs = Math.min(o.runs || 0, o.boundary ? 6 : 4)
  st.runs += runs; inn.runs += runs; bw.runs += runs; over.runs += runs
  if (o.boundary && runs === 4) st.fours++
  if (o.boundary && runs === 6) { st.sixes++; over.sixesBy[st.name] = (over.sixesBy[st.name] || 0) + 1 }

  if (!st.hit50 && st.runs >= 50) { st.hit50 = true; events.push({ type: '50', name: st.name }) }
  if (!st.hit100 && st.runs >= 100) { st.hit100 = true; events.push({ type: '100', name: st.name }) }

  if (o.wicket) {
    let outIdx = inn.striker
    if (o.wicket === 'runout') {
      // Runs completed first; then the batter at the danger end is out.
      if (runs % 2 === 1) swapStrike(inn)
      outIdx = Math.random() < 0.5 ? inn.striker : inn.nonStriker
      bw.streak = 0
    } else {
      bw.wkts++; bw.streak++
      if (bw.streak === 3) events.push({ type: 'hattrick', name: bw.name })
    }
    inn.wkts++; over.wkts++
    inn.bat[outIdx].out = o.wicket === 'runout' ? 'run out' : `${o.wicket} b ${bw.name}`
    if (inn.wkts < inn.wktLimit && inn.nextIn < inn.bat.length) {
      if (outIdx === inn.striker) inn.striker = inn.nextIn
      else inn.nonStriker = inn.nextIn
      inn.bat[inn.nextIn].in = true
      inn.nextIn++
    }
  } else {
    bw.streak = 0
    if (runs % 2 === 1) swapStrike(inn)
  }

  let overDone = false
  if (inn.balls % 6 === 0) {
    overDone = true
    bw.overs++
    if (over.balls.filter(l => l === '6').length === 6) {
      const hitter = Object.keys(over.sixesBy).find(n => over.sixesBy[n] === 6)
      if (hitter) events.push({ type: 'sixsixes', name: hitter })
    }
    inn.lastBowler = inn.curBowler
    inn.curBowler = null
    swapStrike(inn)
  }
  events.forEach(e => inn.events.push({ ...e, over: oversText(inn.balls) }))
  checkEnd(inn)
  return { label, events, overDone }
}

function swapStrike(inn) { const t = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = t }
function checkEnd(inn) {
  if (inn.balls >= inn.maxBalls || inn.wkts >= inn.wktLimit || (inn.target != null && inn.runs >= inn.target)) {
    inn.done = true
    if (inn.curBowler != null && inn.balls % 6 !== 0) { inn.bowl[inn.curBowler].overs += 0 }
  }
}

// Simulate until the innings ends or `stopAt` legal balls have been bowled.
export function simInnings(inn, { stopAt = Infinity, steer = null } = {}) {
  while (!inn.done && inn.balls < stopAt) {
    let pace = 1
    if (steer) {
      // Keep the chase alive so the deciding over is close: aim to need `need` off the last over.
      const want = (inn.target - 1 - steer.need) * (inn.balls / steer.at)
      pace = clamp(1 + (want - inn.runs) / Math.max(5, (steer.at - inn.balls) / 2.5), 0.35, 3.5)
    }
    const o = aiOutcome(inn, pace)
    if (steer && o.wicket && inn.wkts >= 5 && inn.balls < steer.at - 2 && Math.random() < 0.85) { o.wicket = null; o.runs = 0 }
    if (steer && inn.runs + (o.runs || 0) >= inn.target && inn.balls < steer.at - 1) { o.runs = 0; o.boundary = false }
    applyBall(inn, o)
  }
  return inn
}

// ─── Full match ───────────────────────────────────────────────────────────
// Plays the match up to the deciding moment. The moment is the last over of the
// chase: the player bats it if chasing, bowls it if defending.
export function prepareMatch({ userXI, userName, oppName, oppXI, ratingType, mods }) {
  const userBatsFirst = Math.random() < 0.5
  const uStr = teamStrength(userXI, ratingType, mods), oStr = teamStrength(oppXI, ratingType)
  const side = (bat) => bat === 'user'
    ? { batTeam: userName, batXI: userXI, bowlTeam: oppName, bowlXI: oppXI }
    : { batTeam: oppName, batXI: oppXI, bowlTeam: userName, bowlXI: userXI }
  const first = userBatsFirst ? 'user' : 'opp'
  const second = userBatsFirst ? 'opp' : 'user'
  // mods are keyed by user player ids, so passing them for both sides is safe
  const inn1 = newInnings({ ...side(first), ratingType, mods })
  simInnings(inn1)
  const target = inn1.runs + 1

  const inn2 = newInnings({ ...side(second), target, ratingType, mods })
  // Stronger user side → easier last over (smaller ask when chasing, bigger when defending).
  const diff = uStr - oStr
  const need = Math.round(clamp(second === 'user' ? 10 - diff * 0.35 + gauss() * 4 : 10 + diff * 0.35 + gauss() * 4, 3, 21))
  simInnings(inn2, { stopAt: 114, steer: { need, at: 114 } })

  const live = !inn2.done && inn2.balls === 114
  return {
    userName, oppName, userBatsFirst, inn1, inn2,
    moment: live ? (second === 'user' ? 'chase' : 'defend') : null,
    superOver: null, ratingType, uStr, oStr,
  }
}

// Super Over: 6 balls, 2 wickets. Team batting second in the match bats first.
export function prepareSuperOver(match, userXI, oppXI, mods) {
  const pickBat = xi => [...xi].sort((a, b) => (b.batting ?? 0) - (a.batting ?? 0)).slice(0, 3)
  const pickBowl = xi => [...xi].sort((a, b) => (b.bowling ?? 0) - (a.bowling ?? 0)).slice(0, 1)
  const userFirst = match.userBatsFirst === false
  const mk = (bat, target) => bat === 'user'
    ? newInnings({ batTeam: match.userName, bowlTeam: match.oppName, batXI: pickBat(userXI), bowlXI: pickBowl(oppXI), maxBalls: 6, maxWkts: 2, target, ratingType: match.ratingType, mods })
    : newInnings({ batTeam: match.oppName, bowlTeam: match.userName, batXI: pickBat(oppXI), bowlXI: pickBowl(userXI), maxBalls: 6, maxWkts: 2, target, ratingType: match.ratingType, mods })
  return { userFirst, first: mk(userFirst ? 'user' : 'opp'), second: null, mk }
}

export function matchOutcome(match) {
  const { inn1, inn2, userBatsFirst, superOver } = match
  const u = userBatsFirst ? inn1 : inn2, o = userBatsFirst ? inn2 : inn1
  if (superOver?.decided) return { won: superOver.userWon, tie: true, margin: 'Super Over' }
  if (u.runs === o.runs) return { won: null, tie: true, margin: 'Tie' }
  const won = u.runs > o.runs
  const chaser = inn2, chaserIsWinner = (userBatsFirst ? !won : won)
  const margin = chaserIsWinner ? `${chaser.wktLimit - chaser.wkts} wkts` : `${Math.abs(u.runs - o.runs)} runs`
  return { won, tie: false, margin }
}

// Fast whole-match sim used for other teams in the table (just scores).
export function quickScores(aStr = 50, bStr = 50) {
  const a = Math.round(clamp(165 + gauss() * 22 + (aStr - bStr) * 0.6, 95, 245))
  const b = Math.round(clamp(165 + gauss() * 22 + (bStr - aStr) * 0.6, 95, 245))
  return b === a ? [a + 1, b] : [a, b]
}
