import { useEffect, useRef, useState } from 'react'
import { applyBall, startOverIfNeeded, prepareSuperOver, oversText } from './engine.js'
import { aiDelivery, battingResult, timingWindows, bowlingResult, releaseZone, LINES, LENGTHS } from './moment.js'
import { OverChips } from './SeasonMatch.jsx'
import { xiPlayers, USER_TEAM } from './season.js'

const LINE_X = { off: 32, stumps: 50, leg: 68 }
const LEN_Y = { yorker: 80, full: 66, good: 52, short: 34 }
const HIT_Y = 84 // % down the strip where the bat meets the ball

// The deciding moment: last over (chase or defend) or a Super Over.
export default function Moment({ match, mode, season, onFinish, onSuperDone, onCelebrate }) {
  const [so, setSo] = useState(null)
  const [, force] = useState(0)

  useEffect(() => {
    if (mode === 'super' && !so) setSo(prepareSuperOver(match, xiPlayers(season), match.oppXI, season.playerState))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const celebrate = (events, inn) => events.forEach(e => {
    const mine = (e.type === 'hattrick' ? inn.bowlTeam : inn.batTeam) === USER_TEAM
    if (mine) onCelebrate?.(e)
  })

  if (mode !== 'super') {
    const inn = match.inn2
    return mode === 'chase'
      ? <BatOver inn={inn} title="Chase it down" onBall={celebrate} onDone={onFinish} />
      : <BowlOver inn={inn} title="Defend the total" onBall={celebrate} onDone={onFinish} />
  }
  if (!so) return null
  const live = so.second ?? so.first
  const userBatting = live.batTeam === USER_TEAM
  const done = () => {
    if (!so.second) { so.second = so.mk(so.userFirst ? 'opp' : 'user', so.first.runs + 1); force(x => x + 1) }
    else onSuperDone(so)
  }
  const title = `Super Over · ${so.second ? `target ${so.second.target}` : 'innings 1'}`
  return userBatting
    ? <BatOver key={so.second ? 2 : 1} inn={live} title={title} onBall={celebrate} onDone={done} />
    : <BowlOver key={so.second ? 2 : 1} inn={live} title={title} onBall={celebrate} onDone={done} />
}

function Equation({ inn, title }) {
  const over = inn.overs[inn.overs.length - 1]
  const thisOver = over && (inn.curBowler != null || inn.done) ? over.balls : []
  const left = inn.maxBalls - inn.balls
  return (
    <div className="sn-card" style={{ marginBottom: '0.5rem' }}>
      <div className="sn-h" style={{ marginBottom: '0.2rem' }}>{title}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700, color: inn.batTeam === USER_TEAM ? 'var(--gold)' : 'var(--text)' }}>{inn.batTeam}</span>
        <span className="sn-big">{inn.runs}/{inn.wkts} <span className="sn-muted">({oversText(inn.balls)})</span></span>
      </div>
      {inn.target != null && (
        <div style={{ fontWeight: 800, color: 'var(--gold)', marginTop: '0.15rem' }}>
          {inn.runs >= inn.target ? 'Target reached!' : `Need ${inn.target - inn.runs} off ${left} ball${left === 1 ? '' : 's'}`}
          <span className="sn-muted"> · {inn.wktLimit - inn.wkts} wkt{inn.wktLimit - inn.wkts === 1 ? '' : 's'} left</span>
        </div>
      )}
      <div style={{ marginTop: '0.4rem', minHeight: '1.6rem' }}><span className="sn-muted" style={{ marginRight: 6 }}>This over</span><OverChips balls={thisOver} /></div>
    </div>
  )
}

function Feedback({ fb }) {
  if (!fb) return <div style={{ height: '2.2rem' }} />
  const color = fb.tone === 'w' ? 'var(--red)' : fb.tone === 'b6' ? '#a78bfa' : fb.tone === 'b4' ? '#60a5fa' : 'var(--text)'
  return <div className="sn-big" style={{ height: '2.2rem', textAlign: 'center', color, fontSize: '1.3rem' }}>{fb.text}</div>
}

// ─── Batting ─────────────────────────────────────────────────────────────
function BatOver({ inn, title, onBall, onDone }) {
  const [ball, setBall] = useState(null)
  const [fb, setFb] = useState(null)
  const [phase, setPhase] = useState('wait') // wait → live → fb
  const ballRef = useRef(null)
  const t0 = useRef(0), raf = useRef(0), timers = useRef([])
  const resolved = useRef(false)
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  useEffect(() => () => { cancelAnimationFrame(raf.current); timers.current.forEach(clearTimeout) }, [])

  startOverIfNeeded(inn)
  const striker = inn.bat[inn.striker], bowler = inn.bowl[inn.curBowler]
  const win = timingWindows(striker.r, bowler.r)

  function deliver() {
    if (inn.done) return
    const d = aiDelivery(bowler.r)
    resolved.current = false
    setFb(null); setBall(d); setPhase('live')
    t0.current = performance.now()
    const endT = d.travel * 1.2
    const tick = now => {
      const t = now - t0.current
      const y = Math.min(100, (t / d.travel) * HIT_Y)
      if (ballRef.current) ballRef.current.style.top = `${y}%`
      if (t > d.travel + win.edge + 60) { resolve(null, d); return }
      if (t < endT + 400) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  useEffect(() => { later(deliver, 1300) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function swing(dir) {
    if (phase !== 'live' || resolved.current) return
    resolve(performance.now() - t0.current - ball.travel, ball, dir)
  }

  function resolve(offset, d, dir = null) {
    if (resolved.current) return
    resolved.current = true
    cancelAnimationFrame(raf.current)
    const res = battingResult({ offset, dir, ball: d, batR: striker.r, bowlR: bowler.r })
    const r = applyBall(inn, res.o)
    if (r?.events?.length) onBall(r.events, inn)
    const timing = offset == null ? '' : Math.abs(offset) <= win.perfect ? 'perfect' : Math.abs(offset) <= win.good ? 'good' : offset < 0 ? 'early' : 'late'
    setFb({ ...res, timing }); setPhase('fb')
    later(() => (inn.done ? onDone() : deliver()), 1500)
  }

  return (
    <div>
      <Equation inn={inn} title={title} />
      <div className="sn-row" style={{ fontSize: '0.8rem' }}>
        <span className="grow">🏏 <b>{striker.name}</b> {striker.runs}{striker.out ? '' : '*'} ({striker.balls}) <span className="sn-pill">BAT {Math.round(striker.r)}</span></span>
        <span className="sn-muted">vs {bowler.name} <span className="sn-pill">{Math.round(bowler.r)}</span></span>
      </div>

      <div style={{ position: 'relative', height: '38vh', minHeight: 230, margin: '0.5rem auto', width: '62%', maxWidth: 260,
        background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 18px, transparent 18px 36px), linear-gradient(180deg, #8a6d48 0%, #c9a979 70%, #d8bc8e 100%)', borderRadius: '0.8rem', overflow: 'hidden', boxShadow: '0 0 0 6px rgba(34,120,60,0.55), 0 10px 30px rgba(0,0,0,0.5)', touchAction: 'manipulation' }}
        onPointerDown={() => swing('straight')}>
        {LINES.map(l => <div key={l} style={{ position: 'absolute', top: 4, left: `${LINE_X[l]}%`, transform: 'translateX(-50%)', fontSize: '0.6rem', fontWeight: 800, color: 'rgba(0,0,0,0.45)' }}>{l.toUpperCase()}</div>)}
        <div style={{ position: 'absolute', left: 0, right: 0, top: `${HIT_Y - 6}%`, height: '12%', background: phase === 'live' ? 'rgba(34,197,94,0.28)' : 'rgba(255,255,255,0.12)', borderTop: '2px solid rgba(255,255,255,0.55)' }} />
        <div style={{ position: 'absolute', bottom: '3%', left: '50%', transform: 'translateX(-50%)', width: 26, height: 10, borderLeft: '3px solid #fff', borderRight: '3px solid #fff', boxShadow: 'inset 3px 0 0 transparent' }}>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 3, background: '#fff', transform: 'translateX(-50%)' }} />
        </div>
        {ball && !ball.wide && phase === 'live' && <div style={{ position: 'absolute', left: `${LINE_X[ball.line]}%`, top: `${LEN_Y[ball.length]}%`, width: 18, height: 6, borderRadius: '50%', background: 'rgba(0,0,0,0.25)', transform: 'translate(-50%,-50%)' }} />}
        {ball && (
          <div ref={ballRef} style={{ position: 'absolute', top: '0%', left: `${ball.wide ? (ball.line === 'off' ? 8 : 92) : LINE_X[ball.line]}%`, width: 16, height: 16, marginLeft: -8, marginTop: -8, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #ff6b6b, #b91c1c)', boxShadow: '0 2px 6px rgba(0,0,0,0.5)', opacity: phase === 'wait' ? 0 : 1 }} />
        )}
        {phase === 'wait' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'rgba(0,0,0,0.55)' }}>Get ready…</div>}
      </div>

      <Feedback fb={fb} />
      {fb?.timing && <div className="sn-muted" style={{ textAlign: 'center' }}>Timing: {fb.timing}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginTop: '0.5rem' }}>
        {[['off', '⬅ OFF'], ['straight', '⬆ STRAIGHT'], ['leg', 'LEG ➡']].map(([d, l]) => (
          <button key={d} className="sn-cta" style={{ padding: '1rem 0.2rem', fontSize: '0.85rem', borderRadius: '0.7rem', opacity: phase === 'live' ? 1 : 0.5 }}
            onPointerDown={e => { e.preventDefault(); swing(d) }}>{l}</button>
        ))}
      </div>
      <p className="sn-muted" style={{ textAlign: 'center', marginTop: '0.4rem' }}>Swing when the ball hits the green zone. Match the line: off → OFF, stumps → STRAIGHT, leg (or short) → LEG.</p>
    </div>
  )
}

// ─── Bowling ─────────────────────────────────────────────────────────────
function BowlOver({ inn, title, onBall, onDone }) {
  const perOver = inn.maxBalls <= 6 ? 1 : 4
  const options = inn.bowl.map((b, i) => ({ b, i })).filter(({ b, i }) => b.overs < perOver && i !== inn.lastBowler && b.r >= 20).sort((a, z) => z.b.r - a.b.r).slice(0, 5)
  const [bowlerIdx, setBowlerIdx] = useState(inn.curBowler)
  const [line, setLine] = useState('stumps')
  const [length, setLength] = useState('yorker')
  const [phase, setPhase] = useState('pick') // pick → meter → fb
  const [fb, setFb] = useState(null)
  const history = useRef([])
  const needleRef = useRef(null), raf = useRef(0), t0 = useRef(0), pos = useRef(0), timers = useRef([])
  useEffect(() => () => { cancelAnimationFrame(raf.current); timers.current.forEach(clearTimeout) }, [])

  if (bowlerIdx == null) return (
    <div>
      <Equation inn={inn} title={title} />
      <div className="sn-card">
        <div className="sn-h">Who bowls the over?</div>
        {options.map(({ b, i }) => (
          <button key={i} className="sn-btn" style={{ display: 'flex', width: '100%', justifyContent: 'space-between', marginBottom: '0.35rem', padding: '0.7rem' }}
            onClick={() => { startOverIfNeeded(inn, i); setBowlerIdx(i) }}>
            <span>{b.name}</span><span className="sn-muted">{b.overs}/{perOver} ov · {b.wkts}-{b.runs} · <b style={{ color: 'var(--gold)' }}>{Math.round(b.r)}</b></span>
          </button>
        ))}
      </div>
    </div>
  )

  const bowler = inn.bowl[bowlerIdx], striker = inn.bat[inn.striker]
  const zone = releaseZone(bowler.r)

  function startMeter() {
    setPhase('meter'); setFb(null)
    t0.current = performance.now()
    const period = 1050
    const tick = now => {
      const t = ((now - t0.current) % period) / period
      pos.current = t < 0.5 ? t * 2 : 2 - t * 2 // 0→1→0
      if (needleRef.current) needleRef.current.style.left = `${pos.current * 100}%`
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  function release() {
    if (phase !== 'meter') return
    cancelAnimationFrame(raf.current)
    const d = Math.abs(pos.current - 0.5)
    const exec = d <= zone.perfect ? 'perfect' : d <= zone.ok ? 'ok' : 'miss'
    const res = bowlingResult({ line, length, exec, batR: striker.r, bowlR: bowler.r, batterName: striker.name, history: history.current })
    history.current.push([line, length])
    const r = applyBall(inn, res.o, bowlerIdx)
    if (r?.events?.length) onBall(r.events, inn)
    setFb({ ...res, exec }); setPhase('fb')
    timers.current.push(setTimeout(() => (inn.done ? onDone() : setPhase('pick')), 1500))
  }

  const seg = (arr, val, set) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${arr.length}, 1fr)`, gap: '0.3rem', marginBottom: '0.45rem' }}>
      {arr.map(x => <button key={x} className={`sn-tab ${val === x ? 'on' : ''}`} style={{ padding: '0.6rem 0.2rem' }} disabled={phase !== 'pick'} onClick={() => set(x)}>{x.toUpperCase()}</button>)}
    </div>
  )

  return (
    <div>
      <Equation inn={inn} title={title} />
      <div className="sn-row" style={{ fontSize: '0.8rem' }}>
        <span className="grow">🎯 <b>{bowler.name}</b> <span className="sn-pill">BOWL {Math.round(bowler.r)}</span></span>
        <span className="sn-muted">to {striker.name} <span className="sn-pill">{Math.round(striker.r)}</span> {striker.runs}*</span>
      </div>
      <div className="sn-card" style={{ marginTop: '0.5rem' }}>
        <div className="sn-muted" style={{ marginBottom: '0.25rem' }}>Line</div>
        {seg(LINES, line, setLine)}
        <div className="sn-muted" style={{ marginBottom: '0.25rem' }}>Length</div>
        {seg(LENGTHS, length, setLength)}
        <div style={{ position: 'relative', height: 30, borderRadius: 999, background: 'rgba(239,68,68,0.35)', overflow: 'hidden', margin: '0.6rem 0' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(0.5 - zone.ok) * 100}%`, width: `${zone.ok * 200}%`, background: 'rgba(245,158,11,0.55)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(0.5 - zone.perfect) * 100}%`, width: `${zone.perfect * 200}%`, background: 'rgba(34,197,94,0.9)' }} />
          <div ref={needleRef} style={{ position: 'absolute', top: -2, bottom: -2, width: 4, marginLeft: -2, background: '#fff', left: '0%', boxShadow: '0 0 6px #fff' }} />
        </div>
        {phase === 'pick' && <button className="sn-cta" onClick={startMeter}>RUN IN</button>}
        {phase === 'meter' && <button className="sn-cta" style={{ background: 'var(--green)' }} onPointerDown={e => { e.preventDefault(); release() }}>RELEASE!</button>}
        {phase === 'fb' && <Feedback fb={fb} />}
        {phase === 'fb' && <div className="sn-muted" style={{ textAlign: 'center' }}>Release: {fb.exec === 'perfect' ? 'perfect' : fb.exec === 'ok' ? 'decent' : 'missed your spot'}</div>}
      </div>
      <p className="sn-muted" style={{ textAlign: 'center' }}>Stop the needle in the green. Mix it up — batters read repeated balls, and each has a favourite length.</p>
    </div>
  )
}
