// Season mode — season state: fixtures, points table, playoffs, stats.
import { MODE_CONFIG } from '../data/players.js'
import { pickReserves, battingOrder, quickScores, matchOutcome } from './engine.js'

export const USER_TEAM = 'Your XI'
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }

export function createSeason({ team, manager, settings }) {
  const opps = shuffle(MODE_CONFIG.ipl.opponents).slice(0, 9)
  const fixtures = [...opps, ...shuffle(opps).slice(0, 5)]
  const order = shuffle(fixtures).map(opp => ({ opp, stage: 'League' }))
  const squad = [...battingOrder(team), ...pickReserves(team)]
  const table = {}
  ;[USER_TEAM, ...opps].forEach(t => { table[t] = { p: 0, w: 0, l: 0, nr: 0, pts: 0, rf: 0, bf: 0, ra: 0, ba: 0 } })
  const playerState = {}
  squad.forEach(p => { playerState[p.id] = { form: 0, fatigue: 0, injured: 0 } })
  return {
    v: 1, mode: 'ipl', createdAt: Date.now(), updatedAt: Date.now(),
    manager: manager ? { name: manager.name, id: manager.id, emoji: manager.emoji } : null,
    ratingType: settings?.ratingType ?? 'season',
    squad, xi: battingOrder(team).map(p => p.id), impactLeft: 2,
    fixtures: order, round: 0, results: [], table, playerState,
    stats: {}, records: {}, milestones: [], phase: 'league', playoff: null, champion: null,
  }
}

export const currentFixture = s => s.fixtures[s.round] ?? null
export const xiPlayers = s => s.xi.map(id => s.squad.find(p => p.id === id)).filter(Boolean)
export const record = s => {
  const w = s.results.filter(r => r.won).length
  return { w, l: s.results.length - w, unbeaten: s.results.every(r => r.won) }
}

export function sortedTable(s) {
  return Object.entries(s.table).map(([team, t]) => ({ team, ...t, nrr: nrr(t) }))
    .sort((a, b) => b.pts - a.pts || b.nrr - a.nrr)
}
function nrr(t) { return t.bf && t.ba ? (t.rf / (t.bf / 6)) - (t.ra / (t.ba / 6)) : 0 }

function addToTable(t, runsFor, ballsFor, runsAg, ballsAg, res) {
  t.p++; t.rf += runsFor; t.bf += ballsFor; t.ra += runsAg; t.ba += ballsAg
  if (res === 'w') { t.w++; t.pts += 2 } else if (res === 'l') t.l++; else { t.nr++; t.pts += 1 }
}

// Innings balls for NRR: all-out sides count as the full 20 overs.
const nrrBalls = inn => (inn.wkts >= inn.wktLimit ? inn.maxBalls : inn.balls)

function addStats(s, inn, bowlInn) {
  inn.bat.forEach(b => {
    if (!b.in && b.balls === 0) return
    const k = `${b.name}|${inn.batTeam}`
    const st = s.stats[k] ??= { name: b.name, team: inn.batTeam, m: 0, inns: 0, runs: 0, balls: 0, no: 0, hs: 0, hsNo: false, f: 0, sx: 0, fifties: 0, hundreds: 0, wkts: 0, bb: null, rc: 0, bb_b: 0 }
    st.inns++; st.runs += b.runs; st.balls += b.balls; st.f += b.fours; st.sx += b.sixes
    if (!b.out) st.no++
    if (b.runs > st.hs || (b.runs === st.hs && !b.out)) { st.hs = b.runs; st.hsNo = !b.out }
    if (b.runs >= 100) st.hundreds++; else if (b.runs >= 50) st.fifties++
  })
  inn.bowl.forEach(w => {
    if (!w.balls) return
    const k = `${w.name}|${inn.bowlTeam}`
    const st = s.stats[k] ??= { name: w.name, team: inn.bowlTeam, m: 0, inns: 0, runs: 0, balls: 0, no: 0, hs: 0, hsNo: false, f: 0, sx: 0, fifties: 0, hundreds: 0, wkts: 0, bb: null, rc: 0, bb_b: 0 }
    st.wkts += w.wkts; st.rc += w.runs; st.bb_b += w.balls
    if (!st.bb || w.wkts > st.bb.w || (w.wkts === st.bb.w && w.runs < st.bb.r)) st.bb = { w: w.wkts, r: w.runs }
  })
}

// Fold a finished match into the season. Returns a new state object.
export function finishMatch(prev, match, extra = {}) {
  const s = structuredClone(prev)
  const fx = currentFixture(s)
  const out = matchOutcome(match)
  const won = !!out.won
  const { inn1, inn2, userBatsFirst } = match
  const u = userBatsFirst ? inn1 : inn2, o = userBatsFirst ? inn2 : inn1

  if (fx.stage === 'League') {
    addToTable(s.table[USER_TEAM], u.runs, nrrBalls(u), o.runs, nrrBalls(o), won ? 'w' : 'l')
    addToTable(s.table[fx.opp], o.runs, nrrBalls(o), u.runs, nrrBalls(u), won ? 'l' : 'w')
    simOtherFixtures(s, fx.opp)
  }
  addStats(s, inn1); addStats(s, inn2)

  s.results.push({
    n: s.results.length + 1, opp: fx.opp, stage: fx.stage, won, margin: out.margin,
    score: `${u.runs}/${u.wkts} (${oversOf(u)})`, oppScore: `${o.runs}/${o.wkts} (${oversOf(o)})`,
    moment: match.moment, superOver: !!match.superOver, top: topPerformers(inn1, inn2), ...extra,
  })
  s.round++
  advancePhase(s, won)
  s.updatedAt = Date.now()
  return s
}

const oversOf = inn => `${Math.floor(inn.balls / 6)}${inn.balls % 6 ? '.' + (inn.balls % 6) : ''}`

function topPerformers(...inns) {
  const bats = inns.flatMap(i => i.bat.map(b => ({ ...b, team: i.batTeam }))).sort((a, b) => b.runs - a.runs)[0]
  const bowls = inns.flatMap(i => i.bowl.map(b => ({ ...b, team: i.bowlTeam }))).sort((a, b) => b.wkts - a.wkts || a.runs - b.runs)[0]
  return { bat: bats && `${bats.name} ${bats.runs}${bats.out ? '' : '*'} (${bats.balls})`, bowl: bowls && `${bowls.name} ${bowls.wkts}/${bowls.runs}` }
}

// Every other team also plays one match a round.
function simOtherFixtures(s, busy) {
  const others = shuffle(Object.keys(s.table).filter(t => t !== USER_TEAM && t !== busy))
  for (let i = 0; i + 1 < others.length; i += 2) {
    const [a, b] = [others[i], others[i + 1]]
    const [ra, rb] = quickScores()
    const aWins = ra > rb
    const bb = 120 - Math.floor(Math.random() * 18)
    addToTable(s.table[a], ra, aWins ? 120 : 120, rb, aWins ? 120 : bb, aWins ? 'w' : 'l')
    addToTable(s.table[b], rb, aWins ? 120 : bb, ra, 120, aWins ? 'l' : 'w')
  }
}

// League → playoffs (Q1/Eliminator → Q2 → Final). 14 league + Q1 + Final = 16-0.
function advancePhase(s, wonLast) {
  if (s.phase === 'league') {
    if (s.round < s.fixtures.length) return
    const tbl = sortedTable(s)
    const pos = tbl.findIndex(r => r.team === USER_TEAM) + 1
    s.leaguePos = pos
    if (pos > 4) { s.phase = 'done'; s.champion = false; return }
    s.phase = 'playoffs'
    const top = tbl.slice(0, 4).map(r => r.team)
    s.playoff = { top, pos }
    if (pos <= 2) s.fixtures.push({ opp: pos === 1 ? top[1] : top[0], stage: 'Qualifier 1' })
    else s.fixtures.push({ opp: pos === 3 ? top[3] : top[2], stage: 'Eliminator' })
    return
  }
  if (s.phase !== 'playoffs') return
  const last = s.fixtures[s.round - 1]
  const { top } = s.playoff
  const coin = (a, b) => (Math.random() < 0.5 ? a : b)
  if (last.stage === 'Final') { s.phase = 'done'; s.champion = wonLast; return }
  if (last.stage === 'Qualifier 1') {
    if (wonLast) s.fixtures.push({ opp: coin(top[2], top[3]), stage: 'Final' })
    else s.fixtures.push({ opp: coin(top[2], top[3]), stage: 'Qualifier 2' })
    return
  }
  if (!wonLast) { s.phase = 'done'; s.champion = false; return }
  if (last.stage === 'Eliminator') s.fixtures.push({ opp: coin(top[0], top[1]), stage: 'Qualifier 2' })
  else if (last.stage === 'Qualifier 2') s.fixtures.push({ opp: coin(top[0], top[1]), stage: 'Final' })
}

// Orange / Purple Cap leaders.
export function capLeaders(s, n = 5) {
  const all = Object.values(s.stats)
  return {
    orange: [...all].filter(x => x.runs > 0).sort((a, b) => b.runs - a.runs).slice(0, n),
    purple: [...all].filter(x => x.wkts > 0).sort((a, b) => b.wkts - a.wkts || a.rc - b.rc).slice(0, n),
  }
}
