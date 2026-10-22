import { useEffect, useState, lazy, Suspense } from 'react'
import './season.css'
import { createSeason, currentFixture, xiPlayers, record, sortedTable, capLeaders, finishMatch, USER_TEAM } from './season.js'
import { loadSeason, saveSeason } from './store.js'
import SeasonMatch from './SeasonMatch.jsx'
import * as extras from './extras.js'

const ImpactSub = lazy(() => import('../components/ImpactSub.jsx'))
const ROLE_SHORT = { opener: 'OPN', 'top-order': 'TOP', 'middle-order': 'MID', 'wicket-keeper': 'WK', 'all-rounder': 'AR', 'pace-bowler': 'PACE', 'spin-bowler': 'SPIN' }

// Season mode home: next fixture, XI picker, table, caps, results.
// `draft` = { team, manager, settings } when a new season was just drafted.
export default function SeasonHub({ user, draft, onHome, onNewSeason }) {
  const [season, setSeason] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('next')
  const [playing, setPlaying] = useState(false)
  const [impact, setImpact] = useState(false)
  const [celebration, setCelebration] = useState(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      let s
      if (draft) { s = createSeason(draft); await saveSeason(s, user) }
      else s = await loadSeason(user)
      if (live) { setSeason(s); setLoading(false) }
    })()
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function commit(s) { setSeason(s); saveSeason(s, user) }

  function celebrate(e) {
    const c = extras.celebrationFor?.(e)
    if (!c) return
    setCelebration(c)
    setTimeout(() => setCelebration(null), 1800)
  }

  if (loading) return <div className="sn"><p className="sn-muted">Loading season…</p></div>
  if (!season) return (
    <div className="sn"><div className="sn-card"><p>No season in progress.</p>
      <button className="sn-cta" onClick={onNewSeason}>START A SEASON</button>
      <button className="sn-btn" style={{ marginTop: '0.5rem' }} onClick={onHome}>🏠 Home</button></div></div>
  )

  const celebrationEl = celebration && (
    <div className="sn-celebrate"><div><div style={{ fontSize: '2.4rem' }}>{celebration.icon}</div>
      <div className="sn-big" style={{ color: 'var(--gold)' }}>{celebration.title}</div>
      <div className="sn-muted">{celebration.sub}</div></div></div>
  )

  if (playing) return (
    <>
      <SeasonMatch
        season={season}
        Moment={extras.Moment}
        onCelebrate={celebrate}
        onQuit={() => setPlaying(false)}
        onDone={(match) => {
          let s = finishMatch(season, match)
          if (extras.afterMatch) s = extras.afterMatch(season, s, match)
          commit(s); setPlaying(false); setTab('next')
        }}
      />
      {celebrationEl}
    </>
  )

  if (impact) return (
    <Suspense fallback={<div className="sn sn-muted">Loading…</div>}>
      <ImpactSub
        team={xiPlayers(season)} mode="ipl" ratingType={season.ratingType}
        onSkip={() => setImpact(false)}
        onComplete={(newTeam, outgoing) => {
          const s = structuredClone(season)
          const oldIds = new Set(s.xi)
          const incoming = newTeam.find(p => !oldIds.has(p.id))
          if (incoming && outgoing) {
            const inc = { ...incoming, id: s.squad.some(p => p.id === incoming.id) ? `imp-${incoming.id}-${Date.now()}` : incoming.id }
            s.squad = s.squad.map(p => (p.id === outgoing.id ? inc : p))
            s.xi = s.xi.map(id => (id === outgoing.id ? inc.id : id))
            s.playerState[inc.id] = { form: 0, fatigue: 0, injured: 0 }
            s.impactLeft = Math.max(0, s.impactLeft - 1)
            s.updatedAt = Date.now()
            commit(s)
          }
          setImpact(false)
        }}
      />
    </Suspense>
  )

  const rec = record(season)
  const fx = currentFixture(season)
  const xi = xiPlayers(season)
  const injuredInXI = xi.some(p => season.playerState[p.id]?.injured > 0)
  const bowlOptions = xi.filter(p => (p.bowling ?? 0) >= 50).length
  const canPlay = fx && season.phase !== 'done' && xi.length === 11 && !injuredInXI

  return (
    <div className="sn">
      <div className="sn-top">
        <button className="sn-btn" onClick={onHome}>🏠 Home</button>
        <div style={{ textAlign: 'center' }}>
          <div className="sn-big">{rec.w}–{rec.l}</div>
          <div className="sn-muted">IPL Season{season.manager ? ` · ${season.manager.name}` : ''}</div>
        </div>
        <span className={`sn-badge ${rec.unbeaten ? '' : 'off'}`}>{rec.unbeaten ? '16-0 ALIVE' : '16-0 GONE'}</span>
      </div>

      <div className="sn-tabs">
        {[['next', 'Next'], ['table', 'Table'], ['caps', 'Caps'], ['results', 'Results'], ...(extras.RecordBook ? [['records', 'Records']] : [])].map(([k, l]) => (
          <button key={k} className={`sn-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'next' && (season.phase === 'done' ? <SeasonOver season={season} rec={rec} onNewSeason={() => { saveSeason(null, user); onNewSeason() }} /> : (
        <>
          <div className="sn-card">
            <div className="sn-h">{fx.stage === 'League' ? `Match ${season.round + 1} of 14` : fx.stage}</div>
            <div className="sn-big">vs {fx.opp}</div>
            {season.results.length > 0 && <div className="sn-muted" style={{ marginTop: '0.2rem' }}>Last: {lastLine(season.results.at(-1))}</div>}
            <button className="sn-cta" style={{ marginTop: '0.75rem' }} disabled={!canPlay} onClick={() => setPlaying(true)}>▶ PLAY MATCH</button>
            {xi.length !== 11 && <p className="sn-muted" style={{ color: 'var(--red)' }}>Pick exactly 11 players ({xi.length} selected).</p>}
            {injuredInXI && <p className="sn-muted" style={{ color: 'var(--red)' }}>An injured player is in your XI — swap them out.</p>}
            {bowlOptions < 5 && xi.length === 11 && <p className="sn-muted" style={{ color: 'var(--gold)' }}>Only {bowlOptions} proper bowlers — someone will have to bowl part-time.</p>}
          </div>
          <XIPicker season={season} onChange={commit} onImpact={() => setImpact(true)} />
        </>
      ))}
      {tab === 'table' && <TableView season={season} />}
      {tab === 'caps' && <CapsView season={season} />}
      {tab === 'results' && <ResultsView season={season} />}
      {tab === 'records' && extras.RecordBook && <extras.RecordBook season={season} />}
    </div>
  )
}

const lastLine = r => `${r.won ? 'Won' : 'Lost'} vs ${r.opp} ${r.margin === 'Super Over' ? 'in Super Over' : `by ${r.margin}`}`

function XIPicker({ season, onChange, onImpact }) {
  const inXI = new Set(season.xi)
  const bench = season.squad.filter(p => !inXI.has(p.id))
  function edit(fn) { const s = structuredClone(season); fn(s); s.updatedAt = Date.now(); onChange(s) }
  const move = (i, d) => edit(s => { const j = i + d; [s.xi[i], s.xi[j]] = [s.xi[j], s.xi[i]] })
  const drop = id => edit(s => { s.xi = s.xi.filter(x => x !== id) })
  const add = id => edit(s => { if (s.xi.length < 11) s.xi.push(id) })
  const status = p => extras.statusIcons ? extras.statusIcons(season.playerState[p.id]) : (season.playerState[p.id]?.injured ? '🚑' : '')

  return (
    <div className="sn-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="sn-h" style={{ margin: 0 }}>Playing XI · batting order</div>
        <button className="sn-btn" disabled={season.impactLeft <= 0} onClick={onImpact}>⚡ Impact Sub ({season.impactLeft})</button>
      </div>
      {season.xi.map((id, i) => {
        const p = season.squad.find(x => x.id === id)
        return (
          <div key={id} className="sn-row">
            <span className="sn-muted" style={{ width: 18 }}>{i + 1}</span>
            <span className="grow">{p.name} <span className="sn-pill">{ROLE_SHORT[p.role]}</span> {status(p)}</span>
            <button className="sn-mini" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="sn-mini" aria-label="Move down" disabled={i === season.xi.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="sn-mini" aria-label="Drop" onClick={() => drop(id)}>✕</button>
          </div>
        )
      })}
      <div className="sn-h" style={{ marginTop: '0.75rem' }}>Bench</div>
      {bench.length === 0 && <p className="sn-muted">Nobody on the bench.</p>}
      {bench.map(p => (
        <div key={p.id} className="sn-row">
          <span className="grow">{p.name} <span className="sn-pill">{ROLE_SHORT[p.role]}</span> <span className="sn-muted">{p.batting}/{p.bowling}</span> {status(p)}</span>
          <button className="sn-btn" disabled={season.xi.length >= 11} onClick={() => add(p.id)}>+ Add</button>
        </div>
      ))}
    </div>
  )
}

function TableView({ season }) {
  const rows = sortedTable(season)
  return (
    <div className="sn-card">
      <table className="sn-tbl"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>NRR</th><th>Pts</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.team} className={`${r.team === USER_TEAM ? 'me' : ''} ${i === 3 ? 'cut' : ''}`}>
            <td>{i + 1}</td><td>{r.team}</td><td>{r.p}</td><td>{r.w}</td><td>{r.l}</td><td>{r.nrr >= 0 ? '+' : ''}{r.nrr.toFixed(2)}</td><td><b>{r.pts}</b></td>
          </tr>))}</tbody></table>
      <p className="sn-muted" style={{ marginTop: '0.4rem' }}>Top 4 make the playoffs. 14 league wins + Qualifier 1 + Final = 16-0.</p>
    </div>
  )
}

function CapsView({ season }) {
  const { orange, purple } = capLeaders(season)
  const row = (x, i, val) => (
    <div key={x.name + x.team} className="sn-row">
      <span className="sn-muted" style={{ width: 18 }}>{i + 1}</span>
      <span className="grow" style={{ color: x.team === USER_TEAM ? 'var(--gold)' : undefined }}>{x.name} <span className="sn-muted">{x.team === USER_TEAM ? '' : x.team}</span></span>
      <b>{val}</b>
    </div>
  )
  return (
    <>
      <div className="sn-card"><div className="sn-h" style={{ color: '#fb923c' }}>🟧 Orange Cap — runs</div>
        {orange.length ? orange.map((x, i) => row(x, i, x.runs)) : <p className="sn-muted">No matches yet.</p>}</div>
      <div className="sn-card"><div className="sn-h" style={{ color: '#a78bfa' }}>🟪 Purple Cap — wickets</div>
        {purple.length ? purple.map((x, i) => row(x, i, x.wkts)) : <p className="sn-muted">No matches yet.</p>}</div>
    </>
  )
}

function ResultsView({ season }) {
  if (!season.results.length) return <div className="sn-card"><p className="sn-muted">No matches played yet.</p></div>
  return (
    <div className="sn-card">
      {[...season.results].reverse().map(r => (
        <div key={r.n} className="sn-row" style={{ alignItems: 'flex-start' }}>
          <span className={`sn-badge ${r.won ? '' : 'off'}`}>{r.won ? 'W' : 'L'}</span>
          <span className="grow" style={{ whiteSpace: 'normal' }}>
            <b>{r.stage === 'League' ? `M${r.n}` : r.stage}</b> vs {r.opp} — {r.margin === 'Super Over' ? 'Super Over' : `by ${r.margin}`}
            <div className="sn-muted">{r.score} v {r.oppScore} · {r.top.bat} · {r.top.bowl}</div>
          </span>
        </div>
      ))}
    </div>
  )
}

function SeasonOver({ season, rec, onNewSeason }) {
  const perfect = season.champion && rec.l === 0
  return (
    <div className="sn-card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '3rem' }}>{perfect ? '👑' : season.champion ? '🏆' : '🏏'}</div>
      <div className="sn-big" style={{ color: 'var(--gold)' }}>{perfect ? `${rec.w}-0 · PERFECT SEASON` : season.champion ? 'IPL CHAMPIONS' : 'Season over'}</div>
      <p className="sn-muted">{rec.w} won, {rec.l} lost{season.leaguePos ? ` · finished ${season.leaguePos}${['st', 'nd', 'rd'][season.leaguePos - 1] ?? 'th'} in the league` : ''}</p>
      <button className="sn-cta" onClick={onNewSeason}>NEW SEASON</button>
    </div>
  )
}
