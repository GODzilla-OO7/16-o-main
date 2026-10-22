import { useEffect, useMemo, useRef, useState } from 'react'
import { prepareMatch, opponentXI, simInnings, applyBall, aiOutcome, prepareSuperOver, matchOutcome, oversText } from './engine.js'
import { currentFixture, xiPlayers, USER_TEAM } from './season.js'

const OVER_MS = 650
const chipCls = l => (l === '4' ? 'b4' : l === '6' ? 'b6' : l.includes('W') && l !== 'Wd' ? 'w' : l === 'Wd' ? 'x' : '')

export function OverChips({ balls }) {
  return <span>{balls.map((l, i) => <span key={i} className={`sn-chip ${chipCls(l)}`}>{l}</span>)}</span>
}

// Plays one season match: quick over-by-over sim, then the deciding moment.
// `Moment` (optional) is the playable mini-game; without it the moment is simulated.
export default function SeasonMatch({ season, onDone, onQuit, Moment, onCelebrate }) {
  const fx = currentFixture(season)
  const [match] = useState(() => {
    const opp = opponentXI(fx.opp)
    const m = prepareMatch({ userXI: xiPlayers(season), userName: USER_TEAM, oppName: fx.opp, oppXI: opp.xi, ratingType: season.ratingType, mods: season.playerState })
    m.oppXI = opp.xi; m.oppSeason = opp.season
    return m
  })
  // Timeline of overs to reveal before the moment.
  const timeline = useMemo(() => {
    const t = []
    ;[match.inn1, match.inn2].forEach((inn, k) => {
      let r = 0, w = 0
      inn.overs.forEach((o, i) => { r += o.runs; w += o.wkts; t.push({ inn: k, n: i + 1, ...o, total: `${r}/${w}` }) })
    })
    return t
  }, [match])
  const [shown, setShown] = useState(0)
  const [stage, setStage] = useState('sim') // sim → moment → super → result
  const [, force] = useState(0)
  const rerender = () => force(x => x + 1)
  const feedRef = useRef(null)

  useEffect(() => {
    if (stage !== 'sim') return
    if (shown >= timeline.length) { const t = setTimeout(() => setStage(match.moment ? 'moment' : 'result'), 600); return () => clearTimeout(t) }
    const t = setTimeout(() => setShown(s => s + 1), OVER_MS)
    return () => clearTimeout(t)
  }, [shown, stage, timeline.length, match.moment])
  useEffect(() => { feedRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }) }, [shown])

  // Milestones reached during the simulated part (shown as they're revealed).
  useEffect(() => {
    if (!onCelebrate || stage !== 'sim' || !shown) return
    const ov = timeline[shown - 1]; const inn = ov.inn === 0 ? match.inn1 : match.inn2
    inn.events.filter(e => e.over && Math.ceil(+e.over.split('.')[0] + (+e.over.split('.')[1] ? 1 : 0)) === ov.n && isUserSide(e, inn))
      .forEach(e => onCelebrate(e))
  }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps

  function isUserSide(e, inn) { return (e.type === 'hattrick' ? inn.bowlTeam : inn.batTeam) === USER_TEAM }

  function afterMoment() {
    const { inn1, inn2 } = match
    if (inn2.runs === inn1.runs) setStage('super')
    else setStage('result')
  }

  // Simulated moment (used until the playable moment is plugged in, and for "auto")
  function simMoment() {
    let i = 0
    const step = () => {
      if (match.inn2.done) { afterMoment(); return }
      applyBall(match.inn2, aiOutcome(match.inn2)); rerender()
      if (++i < 12) setTimeout(step, 450); else { simInnings(match.inn2); afterMoment() }
    }
    step()
  }

  function simSuper() {
    const so = prepareSuperOver(match, xiPlayers(season), match.oppXI, season.playerState)
    simInnings(so.first)
    so.second = so.mk(so.userFirst ? 'opp' : 'user', so.first.runs + 1)
    simInnings(so.second)
    finishSuper(so)
  }
  function finishSuper(so) {
    const u = so.userFirst ? so.first : so.second, o = so.userFirst ? so.second : so.first
    let userWon = u.runs > o.runs
    if (u.runs === o.runs) { // still level: most boundaries in the super over
      const b = inn => inn.bat.reduce((s, x) => s + x.fours + x.sixes, 0)
      userWon = b(u) === b(o) ? Math.random() < 0.5 : b(u) > b(o)
    }
    match.superOver = { decided: true, userWon, u: `${u.runs}/${u.wkts}`, o: `${o.runs}/${o.wkts}` }
    setStage('result')
  }

  const cur = stage === 'sim' ? timeline[Math.max(0, shown - 1)] : null
  const inn = stage === 'sim' ? (cur?.inn === 1 ? match.inn2 : match.inn1) : match.inn2
  const outcome = stage === 'result' ? matchOutcome(match) : null
  const userChasing = !match.userBatsFirst

  return (
    <div className="sn">
      <div className="sn-top">
        <button className="sn-btn" onClick={onQuit}>✕ Leave</button>
        <div className="sn-muted">{fx.stage === 'League' ? `Match ${season.round + 1} of ${season.fixtures.length}` : fx.stage}</div>
        {stage === 'sim'
          ? <button className="sn-btn" onClick={() => setShown(timeline.length)}>Skip ▶▶</button>
          : <span style={{ width: 60 }} />}
      </div>

      <div className="sn-card">
        <div className="sn-muted">{USER_TEAM} vs {fx.opp} <span className="sn-pill">{match.oppSeason}</span></div>
        <Score label={match.inn1.batTeam} inn={match.inn1} upto={stage === 'sim' && cur?.inn === 0 ? cur : null} hidden={false} />
        {(stage !== 'sim' || cur?.inn === 1) && <Score label={match.inn2.batTeam} inn={match.inn2} upto={stage === 'sim' ? cur : null} target={match.inn2.target} />}
        {stage !== 'sim' && !match.inn2.done && (
          <div style={{ marginTop: '0.4rem', fontWeight: 800, color: 'var(--gold)' }}>
            {match.inn2.batTeam} need {match.inn2.target - match.inn2.runs} off {match.inn2.maxBalls - match.inn2.balls}
          </div>
        )}
      </div>

      {stage === 'sim' && (
        <div className="sn-card sn-feed" ref={feedRef}>
          {timeline.slice(0, shown).map((o, i) => (
            <div key={i}>
              {(i === 0 || timeline[i - 1].inn !== o.inn) && <div className="sn-h" style={{ marginTop: i ? '0.5rem' : 0 }}>{o.inn === 0 ? match.inn1.batTeam : match.inn2.batTeam} batting</div>}
              <div className="sn-row">
                <span className="sn-muted" style={{ width: 22 }}>{o.n}</span>
                <span className="grow"><OverChips balls={o.balls} /></span>
                <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>{o.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {stage === 'moment' && (
        Moment
          ? <Moment match={match} mode={userChasing ? 'chase' : 'defend'} inn={match.inn2} season={season} onCelebrate={onCelebrate} onFinish={afterMoment} />
          : <div className="sn-card">
              <div className="sn-h">The deciding over</div>
              <p className="sn-muted">{userChasing ? 'You need' : 'Defend'} {match.inn2.target - match.inn2.runs - (userChasing ? 0 : 1)} {userChasing ? 'to win' : 'runs'} off the last over.</p>
              <OverChips balls={match.inn2.overs[match.inn2.overs.length - 1]?.balls ?? []} />
              <button className="sn-cta" style={{ marginTop: '0.75rem' }} onClick={simMoment}>SIM THE LAST OVER</button>
            </div>
      )}

      {stage === 'super' && (
        Moment
          ? <Moment match={match} mode="super" season={season} onCelebrate={onCelebrate} onSuperDone={finishSuper} />
          : <div className="sn-card">
              <div className="sn-h">Scores level — Super Over!</div>
              <p className="sn-muted">6 balls, 2 wickets each.</p>
              <button className="sn-cta" onClick={simSuper}>SIM SUPER OVER</button>
            </div>
      )}

      {stage === 'result' && outcome && (
        <div className="sn-card" style={{ textAlign: 'center' }}>
          <div className="sn-big" style={{ color: outcome.won ? 'var(--green)' : 'var(--red)' }}>{outcome.won ? 'YOU WIN' : 'YOU LOSE'}</div>
          <div className="sn-muted" style={{ marginBottom: '0.75rem' }}>
            {match.superOver ? `Super Over ${match.superOver.u} v ${match.superOver.o}` : `by ${outcome.margin}`}
          </div>
          <MiniCard inn={match.inn1} /><MiniCard inn={match.inn2} />
          <button className="sn-cta" style={{ marginTop: '0.75rem' }} onClick={() => onDone(match)}>CONTINUE</button>
        </div>
      )}
    </div>
  )
}

function Score({ label, inn, upto, target }) {
  const runs = upto ? upto.total : `${inn.runs}/${inn.wkts}`
  const overs = upto ? `${upto.n}` : oversText(inn.balls)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.3rem' }}>
      <span style={{ fontWeight: 700, color: label === USER_TEAM ? 'var(--gold)' : 'var(--text)' }}>{label}</span>
      <span><span className="sn-big">{runs}</span> <span className="sn-muted">({overs}{target ? ` · T ${target}` : ''})</span></span>
    </div>
  )
}

export function MiniCard({ inn }) {
  const bats = inn.bat.filter(b => b.in || b.balls).sort((a, b) => b.runs - a.runs).slice(0, 3)
  const bowls = inn.bowl.filter(b => b.balls).sort((a, b) => b.wkts - a.wkts || a.runs - b.runs).slice(0, 2)
  return (
    <div style={{ textAlign: 'left', marginTop: '0.5rem' }}>
      <div className="sn-h">{inn.batTeam} {inn.runs}/{inn.wkts} ({oversText(inn.balls)})</div>
      {bats.map(b => <div key={b.name} className="sn-row"><span className="grow">{b.name}</span><b>{b.runs}{b.out ? '' : '*'}</b><span className="sn-muted">({b.balls})</span></div>)}
      {bowls.map(b => <div key={b.name} className="sn-row"><span className="grow sn-muted">{b.name}</span><span>{b.wkts}/{b.runs}</span><span className="sn-muted">({oversText(b.balls)})</span></div>)}
    </div>
  )
}
