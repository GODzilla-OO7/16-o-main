import { useState, useEffect, useRef } from 'react'
import { MODE_CONFIG } from '../data/players.js'
import { loadProfile } from '../hooks/useProfile.js'
import { createShortUrl } from '../lib/shortUrl.js'
import AuthModal from './AuthModal.jsx'

// ─── Best-finish helpers ──────────────────────────────────────────────────────

const FINISH_RANK = {
  champion: 0,
  'runner-up': 1,
  'semi-final': 2,
  'final': 3,
  'quarter-final': 4,
}

function rankFinish(h) {
  const key = (h.iplOutcome ?? h.stageReached ?? '').toLowerCase()
  return FINISH_RANK[key] ?? 99
}

function finishLabel(h) {
  if (h.iplOutcome === 'champion')    return 'IPL Champion'
  if (h.iplOutcome === 'runner-up')   return 'IPL Runner-up'
  if (h.stageReached === 'Champion')  return 'World Cup Champion'
  if (h.stageReached === 'Runner-up') return 'World Cup Runner-up'
  if (h.stageReached === 'Semi-Final') return 'Semi-Finalist'
  if (h.stageReached === 'Quarter-Final') return 'Quarter-Finalist'
  return `${h.wins}W–${h.losses}L`
}

function getBestPreviousFinish(history) {
  // history[0] is the just-finished season — skip it
  const prev = history.slice(1)
  if (!prev.length) return null
  return prev.reduce((best, h) => {
    const rb = rankFinish(best), rh = rankFinish(h)
    if (rh < rb) return h
    if (rh === rb && h.wins > best.wins) return h
    return best
  })
}

function getHookLine(currentLabel, bestLabel, isNewBest) {
  if (isNewBest) {
    return `New personal best! Can you do it again?`
  }
  return `You can do better. Your best is ${bestLabel} — go get it.`
}

// ─── Share card generator (Canvas) — 38-0.app style ──────────────────────────

function generateShareCard({ wins, losses, total, ratingLabel, ratingColor, modeLabel, mode, matchResults, potm, topScorer, topScorerRuns, topWicketTaker, topWicketTakerWkts, bestWinStreak, stageReached, iplOutcome, team, myStr, iconPlayer, awards = [], pastSeasons = [], impactSubPlayer = null }) {
  const MEDAL_ROWS = awards.length > 0 ? Math.ceil(awards.length / 3) : 0
  const MEDALS_H   = awards.length > 0 ? (MEDAL_ROWS * 28 + 30) : 86  // 86 = 2-row placeholder height, prevents footer overlap when no medals
  const W = 630
  // Pre-compute layout to set canvas height dynamically (no fixed empty space)
  const _players  = (team || []).slice(0, 11)
  const _maxRows  = Math.max(Math.min(_players.length, 6), _players.length - 6, 0) || _players.length
  const _STATS_Y  = 340 + 5 + _maxRows * 34 + 18
  let   _capY     = _STATS_Y + 22
  if (topScorer)      _capY += 54
  if (topWicketTaker) _capY += 54
  const _MY       = awards.length > 0 ? _capY + 16 : _capY
  const _footY    = _MY + MEDALS_H + 28
  // Past seasons section height
  const _psSeasons   = pastSeasons.length > 0 ? [...pastSeasons].sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0)) : []
  const _psRowCount  = _psSeasons.length === 0 ? 0 : _psSeasons.length <= 3 ? 1 : 2
  const PAST_H       = _psSeasons.length > 0 ? (42 + _psRowCount * 90) : 0
  const H            = Math.max(_footY + PAST_H + 74, 700)
  const DPR = Math.max(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  canvas.width  = W * DPR
  canvas.height = H * DPR
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)

  // ── Role definitions ──────────────────────────────────────────────────────
  const ROLE_TAGS = {
    'opener':        ['OPN',  '#C8102E'],
    'top-order':     ['TOP',  '#C8102E'],
    'middle-order':  ['MID',  '#60a5fa'],
    'wicket-keeper': ['WK',   '#93c5fd'],
    'all-rounder':   ['AR',   '#bfdbfe'],
    'pace-bowler':   ['PACE', '#ffffff'],
    'spin-bowler':   ['SPIN', '#dbeafe'],
  }
  function scaleDisp(v) { return Math.max(1, Math.min(99, Math.round(v * 0.88 + 8))) }

  // ── Theme: golden when champion, dark otherwise ───────────────────────────
  const isChampionTheme = iplOutcome === 'champion' || stageReached === 'Champion'
  const ACCENT   = isChampionTheme ? '#b45309' : '#C8102E'
  const ACCENT2  = isChampionTheme ? '#f59e0b' : '#60a5fa'
  const BG_BASE  = isChampionTheme ? '#1a1000' : '#060d1a'
  const GLOW_CLR = isChampionTheme ? 'rgba(245,158,11,0.22)' : 'rgba(200,16,46,0.18)'
  const GLOW2    = isChampionTheme ? 'rgba(245,158,11,0.10)' : 'rgba(200,16,46,0.08)'

  // ── Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = BG_BASE
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 380)
  glow.addColorStop(0, GLOW_CLR)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const glow2 = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, 300)
  glow2.addColorStop(0, GLOW2)
  glow2.addColorStop(1, 'transparent')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)

  // ── HEADER ────────────────────────────────────────────────────────────────
  // App logo
  ctx.font = '900 30px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.fillText('Cricket 16-0', 28, 52)

  // Badges — right side: single pill showing "IPL · OVR 88"
  const badgeH = 28, badgeY = 23, badgeR = 14
  const isIPL  = (modeLabel || '').toLowerCase().includes('ipl')
  const modeShort = isIPL ? 'IPL' : (modeLabel || 'SEASON').toUpperCase().slice(0, 6)
  ctx.font = '700 12px system-ui, sans-serif'
  const ovrLabel  = myStr ? `OVR  ${myStr}` : 'OVR –'
  const combined  = `${modeShort}   ${ovrLabel}`
  const pillW     = ctx.measureText(combined).width + 26
  const pillX     = W - 28 - pillW
  ctx.fillStyle = isChampionTheme ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.08)'
  roundRect(ctx, pillX, badgeY, pillW, badgeH, badgeR)
  ctx.fill()
  ctx.strokeStyle = isChampionTheme ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.stroke()
  // mode part
  ctx.fillStyle = isChampionTheme ? '#f59e0b' : '#93c5fd'
  ctx.textAlign = 'left'
  ctx.fillText(modeShort, pillX + 13, badgeY + 19)
  // divider dot
  const modeW2 = ctx.measureText(modeShort).width
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillText('·', pillX + 13 + modeW2 + 6, badgeY + 19)
  const dotW = ctx.measureText('·').width
  // ovr part
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(ovrLabel, pillX + 13 + modeW2 + 6 + dotW + 6, badgeY + 19)
  ctx.textAlign = 'left'

  // Separator
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(28, 70); ctx.lineTo(W - 28, 70); ctx.stroke()

  // ── BIG RECORD ────────────────────────────────────────────────────────────
  ctx.textAlign = 'center'

  // Rating label
  if (ratingLabel) {
    ctx.font = '800 12px system-ui, sans-serif'
    ctx.fillStyle = ratingColor || '#C8102E'
    ctx.letterSpacing = '3px'
    ctx.fillText(ratingLabel.toUpperCase(), W / 2, 108)
    ctx.letterSpacing = '0px'
  }

  // Big W-L (app blue glow)
  ctx.save()
  ctx.shadowColor = isChampionTheme ? '#f59e0b' : '#C8102E'
  ctx.shadowBlur = 32
  ctx.font = '900 92px system-ui, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${wins}-${losses}`, W / 2, 208)
  ctx.restore()

  // WON · LOST subtitle
  ctx.font = '700 11px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(147,197,253,0.6)'
  ctx.letterSpacing = '2.5px'
  ctx.fillText('WON · LOST', W / 2, 232)
  ctx.letterSpacing = '0px'

  // Matches + stage
  const isChampion = stageReached === 'Champion' || iplOutcome === 'champion'
  const isRunnerUp = stageReached === 'Runner-up' || iplOutcome === 'runner-up'
  const stageStr = isChampion ? `${total} matches · 1st place`
    : isRunnerUp ? `${total} matches · 2nd place`
    : stageReached ? `${total} matches · ${stageReached}`
    : `${total} matches`
  ctx.font = '500 12px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(148,163,184,0.55)'
  ctx.fillText(stageStr, W / 2, 254)

  // Champion / Result badge
  if (isChampion || isRunnerUp) {
    const badgeTxt = isChampion ? '🏆 CHAMPIONS' : '🥈 RUNNERS-UP'
    ctx.font = '800 12px system-ui, sans-serif'
    const bw = ctx.measureText(badgeTxt).width + 26
    const bx = W / 2 - bw / 2
    ctx.fillStyle = isChampionTheme ? 'rgba(245,158,11,0.2)' : isChampion ? 'rgba(200,16,46,0.2)' : 'rgba(148,163,184,0.1)'
    roundRect(ctx, bx, 268, bw, 28, 14)
    ctx.fill()
    ctx.strokeStyle = isChampionTheme ? 'rgba(245,158,11,0.5)' : isChampion ? 'rgba(200,16,46,0.5)' : 'rgba(148,163,184,0.25)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = isChampionTheme ? '#f59e0b' : isChampion ? '#60a5fa' : '#94a3b8'
    ctx.fillText(badgeTxt, W / 2, 288)
  }

  // Match result blocks (mini row)
  if (matchResults?.length) {
    const BLOCK = 14, GAP = 3, BRAD = 3
    const totalBW = matchResults.length * (BLOCK + GAP) - GAP
    let bx = W / 2 - totalBW / 2
    const by = 310
    matchResults.forEach(r => {
      ctx.fillStyle = r.won ? '#22c55e' : '#ef4444'
      roundRect(ctx, bx, by, BLOCK, BLOCK, BRAD)
      ctx.fill()
      bx += BLOCK + GAP
    })
  }

  // ── PLAYER GRID ───────────────────────────────────────────────────────────
  const GRID_Y   = 340
  const ROW_H    = 34
  const PAD_X    = 24
  const COL_W    = (W - PAD_X * 2 - 12) / 2
  const DIV_X    = PAD_X + COL_W + 6
  const players  = (team || []).slice(0, 11)
  const leftCol  = players.slice(0, 6)
  const rightCol = players.slice(6, 11)
  const maxRows  = Math.max(leftCol.length, rightCol.length)

  // Grid background — sized to visible content rows only (no empty space)
  ctx.fillStyle = 'rgba(255,255,255,0.025)'
  roundRect(ctx, PAD_X, GRID_Y, W - PAD_X * 2, maxRows * ROW_H + 10, 10)
  ctx.fill()

  // Vertical divider
  ctx.strokeStyle = 'rgba(200,16,46,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(DIV_X, GRID_Y + 8); ctx.lineTo(DIV_X, GRID_Y + maxRows * ROW_H + 2); ctx.stroke()

  function drawPlayer(p, col, row) {
    const x = col === 0 ? PAD_X + 6 : DIV_X + 6
    const y = GRID_Y + 5 + row * ROW_H
    const [tag, tagClr] = ROLE_TAGS[p.role] || ['BAT', '#C8102E']
    const rating = scaleDisp(p.overall)

    // Row hover stripe (alternating)
    if (row % 2 === 0) {
      ctx.fillStyle = 'rgba(200,16,46,0.04)'
      ctx.fillRect(col === 0 ? PAD_X : DIV_X, y - 2, COL_W, ROW_H)
    }

    // Role tag pill
    const tagW = 38
    ctx.fillStyle = 'rgba(200,16,46,0.22)'
    roundRect(ctx, x, y + 7, tagW, 19, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,16,46,0.35)'
    ctx.lineWidth = 0.5
    ctx.stroke()
    ctx.font = '700 10px system-ui, sans-serif'
    ctx.fillStyle = tagClr
    ctx.textAlign = 'center'
    ctx.fillText(tag.slice(0, 4), x + tagW / 2, y + 19)

    // Name (last name + initial)
    ctx.textAlign = 'left'
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = '#f1f5f9'
    const parts = p.name.trim().split(/\s+/)
    let displayName = parts.length > 1
      ? parts.slice(0, -1).map(n => n[0] + '.').join(' ') + ' ' + parts[parts.length - 1]
      : p.name
    const maxW = COL_W - tagW - 10 - 28
    while (ctx.measureText(displayName).width > maxW && displayName.length > 4) {
      displayName = displayName.slice(0, -2) + '…'
    }
    ctx.fillText(displayName, x + tagW + 7, y + 20)

    // Rating — right-aligned in column
    const ratingX = (col === 0 ? DIV_X : W - PAD_X) - 7
    ctx.textAlign = 'right'
    ctx.font = '800 14px system-ui, sans-serif'
    ctx.fillStyle = rating >= 88 ? '#60a5fa' : rating >= 78 ? '#ffffff' : 'rgba(255,255,255,0.55)'
    ctx.fillText(String(rating), ratingX, y + 20)
    ctx.textAlign = 'left'
  }

  leftCol.forEach((p, i)  => drawPlayer(p, 0, i))
  rightCol.forEach((p, i) => drawPlayer(p, 1, i))

  // ── IMPACT SUB row (right col, row 5) ────────────────────────────────────
  if (impactSubPlayer) {
    const subRow = leftCol.length - 1  // sits at same row as last left col player
    const x   = DIV_X + 6
    const y   = GRID_Y + 5 + subRow * ROW_H
    const [tag, tagClr] = ROLE_TAGS[impactSubPlayer.role] || ['BAT', '#C8102E']
    const rating = scaleDisp(impactSubPlayer.overall)

    if (subRow % 2 === 0) {
      ctx.fillStyle = 'rgba(200,16,46,0.04)'
      ctx.fillRect(DIV_X, y - 2, COL_W, ROW_H)
    }

    // Role tag
    const tagW = 38
    ctx.fillStyle = 'rgba(200,16,46,0.22)'
    roundRect(ctx, x, y + 7, tagW, 19, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,16,46,0.35)'
    ctx.lineWidth = 0.5
    ctx.stroke()
    ctx.font = '700 10px system-ui, sans-serif'
    ctx.fillStyle = tagClr
    ctx.textAlign = 'center'
    ctx.fillText(tag.slice(0, 4), x + tagW / 2, y + 19)

    // Name + (Impact Sub) — abbreviated to fit
    ctx.textAlign = 'left'
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = '#f1f5f9'
    const parts = impactSubPlayer.name.trim().split(/\s+/)
    let displayName = parts.length > 1
      ? parts.slice(0, -1).map(n => n[0] + '.').join(' ') + ' ' + parts[parts.length - 1]
      : impactSubPlayer.name
    const ratingX2 = W - PAD_X - 7
    const subLabel = ' (Sub)'
    const maxNameW = COL_W - tagW - 10 - 28 - ctx.measureText(subLabel).width - 4
    while (ctx.measureText(displayName).width > maxNameW && displayName.length > 4) {
      displayName = displayName.slice(0, -2) + '…'
    }
    ctx.fillText(displayName, x + tagW + 7, y + 20)
    const nameW = ctx.measureText(displayName).width  // capture at 14px before switching font
    ctx.font = '500 11px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(148,163,184,1.0)'
    ctx.fillText(subLabel, x + tagW + 7 + nameW + 4, y + 20)

    // Rating
    ctx.textAlign = 'right'
    ctx.font = '800 14px system-ui, sans-serif'
    ctx.fillStyle = rating >= 88 ? '#60a5fa' : rating >= 78 ? '#ffffff' : 'rgba(255,255,255,0.55)'
    ctx.fillText(String(rating), ratingX2, y + 20)
    ctx.textAlign = 'left'
  }

  // ── SEASON AWARDS: Orange Cap + Purple Cap rows ───────────────────────────
  const STATS_Y = GRID_Y + 5 + maxRows * ROW_H + 18

  ctx.strokeStyle = isChampionTheme ? 'rgba(245,158,11,0.2)' : 'rgba(200,16,46,0.2)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD_X, STATS_Y); ctx.lineTo(W - PAD_X, STATS_Y); ctx.stroke()

  // Section label
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.fillStyle = isChampionTheme ? 'rgba(245,158,11,0.7)' : 'rgba(147,197,253,0.7)'
  ctx.textAlign = 'left'
  ctx.letterSpacing = '1.5px'
  ctx.fillText('SEASON AWARDS', PAD_X, STATS_Y + 14)
  ctx.letterSpacing = '0px'

  function drawCapRow(y, name, stat, capLabel, capBg, capBorder, capTxt, initials) {
    const ROW_H2 = 46, RX = PAD_X, RW = W - PAD_X * 2
    // Row background
    ctx.fillStyle = capBg + '18'
    roundRect(ctx, RX, y, RW, ROW_H2, 10)
    ctx.fill()
    ctx.strokeStyle = capBorder
    ctx.lineWidth = 1
    roundRect(ctx, RX, y, RW, ROW_H2, 10)
    ctx.stroke()
    // Avatar circle
    ctx.fillStyle = capBg
    ctx.beginPath(); ctx.arc(RX + 24, y + ROW_H2 / 2, 16, 0, Math.PI * 2); ctx.fill()
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.fillStyle = '#000'
    ctx.textAlign = 'center'
    ctx.fillText(initials, RX + 24, y + ROW_H2 / 2 + 4)
    // Name + stat
    ctx.textAlign = 'left'
    ctx.font = '700 14px system-ui, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(name || '–', RX + 48, y + 18)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = capBg
    ctx.fillText(stat || '', RX + 48, y + 34)
    // Cap label on right
    ctx.textAlign = 'right'
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.fillStyle = capBg
    ctx.letterSpacing = '0.5px'
    ctx.fillText(capLabel, W - PAD_X - 10, y + ROW_H2 / 2 + 4)
    ctx.letterSpacing = '0px'
    ctx.textAlign = 'left'
  }

  function initials(name) {
    if (!name) return '?'
    const p = name.trim().split(/\s+/)
    return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length-1][0]).toUpperCase()
  }

  let capY = STATS_Y + 22
  if (topScorer) {
    const isIPL = mode === 'ipl'
    const scorerStat = topScorerRuns ? `${topScorerRuns} runs · ${isIPL ? 'Orange Cap 🧢' : 'Top Scorer ⭐'}` : (isIPL ? 'Orange Cap 🧢' : 'Top Scorer ⭐')
    drawCapRow(capY, topScorer, scorerStat, isIPL ? 'ORANGE CAP' : 'TOP SCORER', '#f97316', 'rgba(249,115,22,0.3)', '#fff', initials(topScorer))
    capY += 54
  }
  if (topWicketTaker) {
    const isIPL = mode === 'ipl'
    const wktStat = topWicketTakerWkts ? `${topWicketTakerWkts} wickets · ${isIPL ? 'Purple Cap' : 'Top Wicket Taker 🎯'}` : (isIPL ? 'Purple Cap' : 'Top Wicket Taker 🎯')
    drawCapRow(capY, topWicketTaker, wktStat, isIPL ? 'PURPLE CAP' : 'TOP WICKET TAKER', '#a855f7', 'rgba(168,85,247,0.3)', '#fff', initials(topWicketTaker))
    capY += 54
  }

  // Win streak line
  if (bestWinStreak >= 3) {
    ctx.textAlign = 'right'
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = isChampionTheme ? 'rgba(245,158,11,0.7)' : 'rgba(147,197,253,0.6)'
    ctx.fillText(`🔥 ${bestWinStreak}-match win streak`, W - PAD_X, capY + 4)
    ctx.textAlign = 'left'
  }

  // ── MEDALS SECTION ────────────────────────────────────────────────────────
  {
    const MY = capY + 16

    ctx.strokeStyle = 'rgba(245,158,11,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(28, MY); ctx.lineTo(W - 28, MY); ctx.stroke()

    ctx.textAlign = 'left'
    ctx.font = '700 12px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(245,158,11,0.8)'
    ctx.letterSpacing = '1.5px'
    ctx.fillText('🏅 MEDALS', 28, MY + 13)
    ctx.letterSpacing = '0px'

    if (awards.length === 0) {
      // Placeholder chip so layout remains consistent
      const CHIP_W = 181, CHIP_H = 20
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      roundRect(ctx, 28, MY + 20, CHIP_W, CHIP_H, 5)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.font = '700 11px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(148,163,184,0.4)'
      ctx.textAlign = 'left'
      ctx.fillText('No medals won', 28 + 8, MY + 20 + 14)
    } else {
      const CHIP_W = 181, CHIP_H = 20
      awards.slice(0, 9).forEach((award, i) => {
        const col = i % 3
        const row = Math.floor(i / 3)
        const cx = 28 + col * (CHIP_W + 8)
        const cy = MY + 20 + row * (CHIP_H + 8)

        ctx.fillStyle = 'rgba(245,158,11,0.1)'
        roundRect(ctx, cx, cy, CHIP_W, CHIP_H, 5)
        ctx.fill()
        ctx.strokeStyle = 'rgba(245,158,11,0.28)'
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.font = '11px system-ui, sans-serif'
        ctx.fillStyle = '#f59e0b'
        ctx.textAlign = 'left'
        ctx.fillText(award.icon, cx + 5, cy + 14)

        ctx.font = '700 11px system-ui, sans-serif'
        ctx.fillStyle = '#fde68a'
        let name = award.name
        while (ctx.measureText(name).width > CHIP_W - 30 && name.length > 2) {
          name = name.slice(0, -1) + '…'
        }
        ctx.fillText(name, cx + 23, cy + 14)
      })
    }
  }

  // ── PAST SEASONS ──────────────────────────────────────────────────────────
  if (_psSeasons.length > 0) {
    const PS_Y  = H - 74 - PAST_H
    const CW2   = W - PAD_X * 2
    const SLOT_H = 90

    // Divider + label
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD_X, PS_Y); ctx.lineTo(W - PAD_X, PS_Y); ctx.stroke()

    ctx.textAlign = 'left'
    ctx.font = '700 12px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(148,163,184,0.65)'
    ctx.letterSpacing = '1.5px'
    ctx.fillText('PAST SEASONS', PAD_X, PS_Y + 16)
    ctx.letterSpacing = '0px'

    // Container
    const contY   = PS_Y + 26
    const row1Ps  = _psSeasons.slice(0, 3)
    const row2Ps  = _psSeasons.slice(3, 6)
    const psRows  = row2Ps.length > 0 ? [row1Ps, row2Ps] : [row1Ps]
    const contH   = psRows.length * SLOT_H

    ctx.fillStyle = 'rgba(255,255,255,0.018)'
    roundRect(ctx, PAD_X, contY, CW2, contH, 10)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    roundRect(ctx, PAD_X, contY, CW2, contH, 10)
    ctx.stroke()

    psRows.forEach((row, rowIdx) => {
      const rowY   = contY + rowIdx * SLOT_H
      const slotW  = CW2 / row.length

      // Horizontal divider between rows
      if (rowIdx > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(PAD_X, rowY); ctx.lineTo(PAD_X + CW2, rowY); ctx.stroke()
      }

      row.forEach((h, si) => {
        const slotX = PAD_X + si * slotW
        const cx2   = slotX + slotW / 2

        // Vertical divider
        if (si > 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.07)'
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(slotX, rowY + 10); ctx.lineTo(slotX, rowY + SLOT_H - 10); ctx.stroke()
        }

        const sNum    = h.seasonNumber ?? (si + 1)
        const outcome = h.iplOutcome
        const stage   = h.stageReached

        let emoji = '\u{1F4CB}', outLabel = 'Played', outColor = 'rgba(148,163,184,0.6)'
        if (outcome === 'champion' || stage === 'Champions') {
          emoji = '\u{1F3C6}'; outLabel = 'Champions'; outColor = '#f59e0b'
        } else if (outcome === 'runner-up' || stage === 'Runner-up') {
          emoji = '\u{1F948}'; outLabel = 'Runners-Up'; outColor = '#94a3b8'
        } else if (outcome === 'eliminated') {
          emoji = '⚡'; outLabel = 'Playoff Run'; outColor = '#ef4444'
        } else if (outcome === 'not_qualified') {
          const pct = h.wins / (h.total || 1)
          outLabel = pct >= 0.60 ? 'Solid Season' : 'Tough Season'
          outColor = '#64748b'
          emoji = '\u{1F4CB}'
        }

        ctx.textAlign = 'center'

        // Season label
        ctx.font = '700 11px system-ui, sans-serif'
        ctx.fillStyle = 'rgba(148,163,184,0.6)'
        ctx.letterSpacing = '0.5px'
        ctx.fillText(`SEASON ${sNum}`, cx2, rowY + 16)
        ctx.letterSpacing = '0px'

        // Emoji
        ctx.font = '22px system-ui, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(emoji, cx2, rowY + 44)

        // Outcome
        ctx.font = '800 14px system-ui, sans-serif'
        ctx.fillStyle = outColor
        ctx.fillText(outLabel, cx2, rowY + 64)

        // Record
        ctx.font = '600 12px system-ui, sans-serif'
        ctx.fillStyle = 'rgba(148,163,184,0.6)'
        ctx.fillText(`${h.wins}-${h.losses}`, cx2, rowY + 79)

        ctx.textAlign = 'left'
      })
    })
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const FOOT_Y = H - 74

  ctx.fillStyle = isChampionTheme ? 'rgba(245,158,11,0.06)' : 'rgba(200,16,46,0.08)'
  ctx.fillRect(0, FOOT_Y, W, H - FOOT_Y)
  ctx.strokeStyle = isChampionTheme ? 'rgba(245,158,11,0.2)' : 'rgba(200,16,46,0.18)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, FOOT_Y); ctx.lineTo(W, FOOT_Y); ctx.stroke()

  // Verified
  ctx.textAlign = 'left'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = isChampionTheme ? 'rgba(245,158,11,0.5)' : 'rgba(147,197,253,0.5)'
  ctx.fillText('✓ Verified result', PAD_X, FOOT_Y + 26)

  // CTA
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(241,245,249,0.5)'
  ctx.fillText('Think you can beat this?', PAD_X, FOOT_Y + 50)
  ctx.font = '800 12px system-ui, sans-serif'
  ctx.fillStyle = isChampionTheme ? '#f59e0b' : '#60a5fa'
  ctx.fillText(' 16zero.in', PAD_X + ctx.measureText('Think you can beat this?').width, FOOT_Y + 50)

  // Win-loss tally right
  ctx.textAlign = 'right'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.fillStyle = isChampionTheme ? 'rgba(245,158,11,0.55)' : 'rgba(147,197,253,0.55)'
  ctx.fillText(`${wins}W · ${losses}L · ${total} matches`, W - PAD_X, FOOT_Y + 50)

  // ── Return as a Promise<Blob> so callers can download or copy ────────────
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png')
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function getPredictedRank(str, mode) {
  if (mode === 'ipl') {
    if (str >= 85) return { pos: '1st–2nd', short: 'Champions contender' }
    if (str >= 80) return { pos: 'Top 4',   short: 'Playoff favourite' }
    if (str >= 75) return { pos: '5th–6th', short: 'On the bubble' }
    if (str >= 68) return { pos: '7th–8th', short: 'Mid-table' }
    return               { pos: 'Bottom 3', short: 'Uphill battle' }
  }
  if (str >= 84) return { pos: 'Champions',     short: 'Tournament favourite' }
  if (str >= 78) return { pos: 'Semi-final',    short: 'Deep run expected' }
  if (str >= 70) return { pos: 'Quarter-final', short: 'Competitive side' }
  return               { pos: 'Group stage',    short: 'Underdog story' }
}

// Returns [{text, tone: 'positive'|'negative'|'neutral'}]
function getPerformanceWriteup(wins, losses, total, iplOutcome, iplPosition, predictedPos, potm, stageReached, mode) {
  const pct  = total > 0 ? wins / total : 0
  const star = potm ?? null
  const p    = (t) => ({ text: t, tone: 'positive' })
  const n    = (t) => ({ text: t, tone: 'negative' })
  const neu  = (t) => ({ text: t, tone: 'neutral'  })

  // ─── IPL ─────────────────────────────────────────────────────────────────
  if (iplOutcome === 'champion') {
    return [
      star ? p(`Night after night, ${star} lit up the tournament — and when the final ball was bowled, it was your XI holding the trophy.`)
           : p(`From the first ball of the season to the last, this team played with a belief that never wavered.`),
      neu(`They came in predicted to finish ${predictedPos}, and they`),
      p(`silenced every doubter along the way.`),
      p(`Champions of the IPL.`),
    ]
  }
  if (iplOutcome === 'runner-up') {
    return [
      neu(`Predicted ${predictedPos}, this team wrote their own story deep into the competition.`),
      star ? n(`${star} gave everything, and so did the rest of the XI — but the Final belongs to someone else this year.`)
           : p(`They pushed all the way to the Final — further than most believed they could go.`),
      p(`There is no shame in this — only pride.`),
    ]
  }
  if (iplOutcome === 'eliminated') {
    const ploff = iplPosition ? `a ${ordinal(iplPosition)}-place finish` : 'a playoff berth'
    return [
      p(`They earned ${ploff} in the league, and the knockouts gave them a stage they rose to — for a while.`),
      star ? p(`${star} was at the heart of everything good this side did.`)
           : neu(`The effort was real, even when the breaks didn't go their way.`),
      neu(`A campaign to build on.`),
    ]
  }
  if (iplOutcome === 'not_qualified') {
    const pos = iplPosition ? `finished ${ordinal(iplPosition)}` : 'fell short of the top four'
    return [
      n(`They ${pos} — and the playoff spots that seemed within reach slipped away, one tight game at a time.`),
      star ? p(`${star} gave them hope on more occasions than most.`)
           : n(`The gaps were small, the margins painful.`),
      neu(`This group will be better for the experience.`),
    ]
  }

  // ─── World Cup modes ──────────────────────────────────────────────────────
  const stage = stageReached || ''
  if (stage === 'Champion') {
    return [
      neu(`Predicted ${predictedPos}, few gave this team a chance when the tournament began.`),
      star ? p(`${star} stood tallest when the tournament needed a hero, and the rest of the XI answered every call.`)
           : p(`They played every stage with composure — and when the final was done, they stood alone at the top.`),
      p(`World Cup winners.`),
    ]
  }
  if (stage === 'Runner-up') {
    return [
      p(`They were predicted to finish ${predictedPos} — and yet here they were, in the Final, one win from the ultimate prize.`),
      star ? p(`${star} carried this side through its toughest moments.`)
           : p(`It was a journey that exceeded every expectation.`),
      n(`The game of inches found them on the wrong side today,`),
      neu(`but the story of this campaign will be told long after.`),
    ]
  }
  if (stage === 'Semi-Final') {
    return [
      n(`A semi-final exit stings, but there is no disgrace in falling at this stage of a World Cup.`),
      star ? p(`${star} was exceptional throughout.`)
           : neu(`There were performances across the XI worth remembering.`),
      p(`Predicted ${predictedPos}, they went further — and for stretches of the tournament, looked capable of going all the way.`),
    ]
  }
  if (stage === 'Super 8') {
    return [
      p(`They survived the group stage and battled into the Super 8s — which is more than many can say.`),
      star ? p(`${star} was the bright light of a tournament that eventually ran out of road.`)
           : neu(`The quality was there in bursts, just not consistently enough.`),
      neu(`Predicted ${predictedPos} — the gap between ambition and result is smaller than it seems.`),
    ]
  }
  if (pct <= 0.3) {
    return [
      n(`It was a brutal group stage — the kind that leaves questions hanging in the air long after.`),
      star ? p(`${star} tried to drag this team forward alone, and nearly did.`)
           : n(`The margins were fine, the results weren't.`),
      n(`Predicted ${predictedPos}, they never quite found their footing when it mattered most.`),
      neu(`Rebuild starts now.`),
    ]
  }
  return [
    n(`They pushed hard through the group stage but ultimately couldn't find the wins to advance.`),
    star ? p(`${star} showed flashes of brilliance.`)
         : neu(`There were moments of real quality.`),
    neu(`Predicted ${predictedPos} — this wasn't the ending they deserved, but the cricket told its own story.`),
  ]
}

function ordinal(n) {
  if (!n) return ''
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

const ROLE_LABEL = {
  'opener': 'OPN', 'top-order': 'BAT', 'middle-order': 'BAT',
  'wicket-keeper': 'WK', 'all-rounder': 'ALL',
  'pace-bowler': 'PACE', 'spin-bowler': 'SPIN',
}
const ROLE_COLOR = {
  'opener': '#C8102E', 'top-order': '#C8102E', 'middle-order': '#a50d24',
  'wicket-keeper': '#f59e0b', 'all-rounder': '#C8102E',
  'pace-bowler': '#ef4444', 'spin-bowler': '#a855f7',
}

function getRating(wins, losses, total, perfect, targetWins, iplOutcome, stageReached) {
  if (!total) return { label: 'COMPLETE', color: '#94a3b8', emoji: '\u{1F3CF}', desc: 'Season complete.' }
  if (iplOutcome === 'champion')     return { label: 'IPL CHAMPIONS', color: '#f59e0b', emoji: '\u{1F3C6}', desc: 'You lifted the trophy. An all-time great team.' }
  if (iplOutcome === 'runner-up')    return { label: 'RUNNERS-UP',    color: '#94a3b8', emoji: '\u{1F948}', desc: 'So close — you made the Final and pushed hard.' }
  if (iplOutcome === 'eliminated')   return { label: 'PLAYOFF RUN',   color: '#C8102E', emoji: '⚡',    desc: 'You made the playoffs but fell short of the Final.' }
  if (iplOutcome === 'not_qualified') {
    const pct = wins / total
    if (pct >= 0.60) return { label: 'SOLID SEASON',  color: '#94a3b8', emoji: '\u{1F4CB}', desc: 'Good league form but just missed the top 4.' }
    return { label: 'TOUGH SEASON', color: '#ef4444', emoji: '\u{1F62C}', desc: 'A difficult campaign — couldn\'t break into playoffs.' }
  }
  if (stageReached === 'Champion')   return { label: 'WORLD CHAMPIONS', color: '#f59e0b', emoji: '\u{1F3C6}', desc: 'You lifted the trophy. World Cup winners.' }
  if (stageReached === 'Runner-up')  return { label: 'RUNNERS-UP',      color: '#94a3b8', emoji: '\u{1F948}', desc: 'So close — you made the Final and pushed hard.' }
  if (stageReached === 'Semi-Final') return { label: 'SEMI-FINAL EXIT', color: '#C8102E', emoji: '⚡',    desc: 'You reached the semis but couldn\'t make the Final.' }
  if (stageReached === 'Super 8')    return { label: 'SUPER 8 EXIT',    color: '#94a3b8', emoji: '\u{1F4CB}', desc: 'Made it through the group stage but fell in the Super 8s.' }
  if (stageReached === 'Group Stage') return { label: 'GROUP STAGE EXIT', color: '#ef4444', emoji: '\u{1F62C}', desc: 'A tough group stage — couldn\'t make it through.' }
  if (perfect) return { label: 'LEGENDARY', color: '#f59e0b', emoji: '\u{1F3C6}', desc: `You achieved the impossible — ${targetWins}-0!` }
  if (losses === 0) return { label: 'DOMINANT', color: '#C8102E', emoji: '\u{1F451}', desc: 'Unbeaten all season — extraordinary.' }
  const pct = wins / total
  if (pct >= 0.85) return { label: 'ELITE', color: '#C8102E', emoji: '⭐',    desc: 'One of the all-time great sides.' }
  if (pct >= 0.70) return { label: 'QUALITY', color: '#C8102E', emoji: '\u{1F535}', desc: 'A strong side that fell just short.' }
  if (pct >= 0.55) return { label: 'DECENT', color: '#94a3b8', emoji: '⚪',    desc: 'Competitive but not quite elite.' }
  return { label: 'TOUGH RUN', color: '#ef4444', emoji: '\u{1F62C}', desc: 'Even legends have bad seasons.' }
}

export default function Results({ team, mode, manager, summary, matchResults, onPlayAgain, onNextSeason, seasonNumber = 1, newAwards = [], prevSeasons = [], challengerResult = null, h2hContext = null, user = null, onGoogleSignIn, onShowAuth, restoredAfterAuth = false, cupCtx = null }) {
  const [tab, setTab] = useState('overview') // overview | playerstats | matches
  const [h2hOppStats, setH2hOppStats] = useState(null) // { wins, losses, oppName }
  const [waSharing2, setWaSharing2]   = useState(false)
  const h2hResultWritten = useRef(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [resultJustSaved, setResultJustSaved] = useState(false)
  const [cupStandings, setCupStandings] = useState(null) // [{playerId, displayName, played, wins, losses, pts}]

  // Show "saved" confirmation when user logs in while on results screen
  const prevUserRef2 = useRef(user)
  useEffect(() => {
    if (user && !prevUserRef2.current) setResultJustSaved(true)
    prevUserRef2.current = user
  }, [user])

  // Also show "saved" when restored after Safari OAuth redirect
  useEffect(() => {
    if (restoredAfterAuth) setResultJustSaved(true)
  }, [restoredAfterAuth])

  // Fetch H2H opponent's results from Supabase when in H2H mode
  useEffect(() => {
    if (!h2hContext?.roomId) return
    import('../lib/supabase.js').then(({ getSupabase }) => getSupabase()).then(async sb => {
      if (!sb) return
      const { data } = await sb
        .from('h2h_live_results')
        .select('won')
        .eq('room_id', h2hContext.roomId)
        .neq('player_id', h2hContext.myUserId)
      if (!data) return
      const oppWins   = data.filter(r => r.won).length
      const oppLosses = data.filter(r => !r.won).length
      setH2hOppStats({ wins: oppWins, losses: oppLosses, oppName: h2hContext.opponentName })
    })
  }, [h2hContext?.roomId])

  // Write final H2H result to h2h_results once opponent stats load (winner writes the row)
  useEffect(() => {
    if (!h2hOppStats || !h2hContext || h2hResultWritten.current) return
    if (!h2hContext.opponentUserId || !h2hContext.myUserId) return
    const myWins  = summary?.wins ?? 0
    const iWon    = myWins > h2hOppStats.wins
    const tied    = myWins === h2hOppStats.wins
    if (!iWon || tied) return // only the winner writes to avoid duplicate rows
    h2hResultWritten.current = true
    import('../lib/supabase.js').then(({ getSupabase }) => getSupabase()).then(async sb => {
      if (!sb) return
      try {
        await sb.from('h2h_results').insert({
          room_id:     h2hContext.roomId,
          winner_id:   h2hContext.myUserId,
          loser_id:    h2hContext.opponentUserId,
          winner_name: h2hContext.myName ?? (user?.user_metadata?.full_name ?? user?.email ?? 'Player'),
          loser_name:  h2hContext.opponentName,
        })
      } catch { /* ignore — best effort */ }
    })
  }, [h2hOppStats])

  // Fetch cup standings when coming from a friends cup or live cup
  useEffect(() => {
    if (!cupCtx?.roomId) return
    import('../lib/supabase.js').then(({ getSupabase }) => getSupabase()).then(async sb => {
      if (!sb) return
      if (cupCtx.type === 'friends') {
        const { data } = await sb.from('friends_cup_results')
          .select('player_id,display_name,wins,losses')
          .eq('room_id', cupCtx.roomId)
        if (!data) return
        const rows = data.map(r => ({
          playerId: r.player_id,
          displayName: r.display_name,
          played: (r.wins ?? 0) + (r.losses ?? 0),
          wins: r.wins ?? 0,
          losses: r.losses ?? 0,
          pts: (r.wins ?? 0) * 2,
        })).sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.losses - b.losses)
        setCupStandings(rows)
      } else if (cupCtx.type === 'live') {
        // Aggregate per-match rows
        const { data } = await sb.from('live_cup_results')
          .select('player_id,won')
          .eq('room_id', cupCtx.roomId)
        // Get display names from players table
        const { data: players } = await sb.from('live_cup_players')
          .select('player_id,display_name')
          .eq('room_id', cupCtx.roomId)
        if (!data) return
        const nameMap = {}
        for (const p of (players ?? [])) nameMap[p.player_id] = p.display_name
        const map = {}
        for (const r of data) {
          if (!map[r.player_id]) map[r.player_id] = { wins: 0, losses: 0 }
          if (r.won) map[r.player_id].wins++
          else map[r.player_id].losses++
        }
        const rows = Object.entries(map).map(([pid, stats]) => ({
          playerId: pid,
          displayName: nameMap[pid] ?? pid,
          played: stats.wins + stats.losses,
          wins: stats.wins,
          losses: stats.losses,
          pts: stats.wins * 2,
        })).sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.losses - b.losses)
        setCupStandings(rows)
      }
    })
  }, [cupCtx?.roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Null-safe destructure
  const cfg     = MODE_CONFIG[mode] || {}
  const wins    = summary?.wins    ?? 0   // league-only (used for rating/writeup)
  const losses  = summary?.losses  ?? 0
  const total   = summary?.total   ?? matchResults?.length ?? 0
  const perfect = summary?.perfect ?? false
  const myStr   = summary?.myStrength ?? 0
  const ts      = summary?.tournamentStats || {}

  const topScorers        = ts.topScorers       || []
  const topWicketTakers   = ts.topWicketTakers  || []
  const potm              = ts.potm             || null
  const bestXI            = ts.bestXI           || []
  const tournamentBestXIRaw = ts.tournamentBestXI || []
  const playerStats         = ts.playerStats      || []

  const iplOutcome   = summary?.iplOutcome   ?? null
  const iplPosition  = summary?.iplPosition  ?? null
  const stageReached = summary?.stageReached ?? null
  const actualWinner = summary?.actualWinner ?? null
  const iconPlayer    = summary?.iconPlayer   ?? null
  const impactSubLog  = summary?.impactSubLog ?? null

  // ── Playoff-aware display record (IPL only) ──────────────────────────────
  // league always = 14 matches; playoffs add 1-3 more; cap final display at 16
  const isIPLMode      = mode === 'ipl'
  const didntQualify   = isIPLMode && iplOutcome === 'not_qualified'

  // IPL: cap user players in Tournament Best XI based on how far they went
  // bottom 3 in league → 1, not_qualified (top 4-8) → 2, eliminated → 3, runner-up/champion → 4
  const tournamentBestXI = (() => {
    if (!isIPLMode) return tournamentBestXIRaw

    const tablePos = summary?.iplPosition ?? null
    const tableSize = summary?.iplTable?.table?.length ?? 10

    const cap = (iplOutcome === 'champion' || iplOutcome === 'runner-up') ? 4
              : iplOutcome === 'eliminated' ? 3
              : (tablePos != null && tablePos > tableSize - 3) ? 1  // bottom 3
              : 2  // not_qualified (finished 5th-7th)

    // Identify the user's top scorer and top wicket-taker across all matches
    const userNames = new Set((team ?? []).map(p => p.name))

    // Accumulate from matchResults (includes playoffs)
    const myRunsMap = {}, myWktsMap = {}
    for (const r of matchResults ?? []) {
      const ts2 = r.stats
      if (!ts2) continue
      if (ts2.topScorer?.name  && userNames.has(ts2.topScorer.name))  myRunsMap[ts2.topScorer.name]  = (myRunsMap[ts2.topScorer.name]  || 0) + (ts2.topScorer.runs  || 0)
      if (ts2.topScorer2?.name && userNames.has(ts2.topScorer2.name)) myRunsMap[ts2.topScorer2.name] = (myRunsMap[ts2.topScorer2.name] || 0) + (ts2.topScorer2.runs || 0)
      if (ts2.topBowler?.name  && userNames.has(ts2.topBowler.name))  myWktsMap[ts2.topBowler.name]  = (myWktsMap[ts2.topBowler.name]  || 0) + (ts2.topBowler.wickets || 0)
    }
    const myTopScorer  = Object.entries(myRunsMap).sort((a,b) => b[1]-a[1])[0]?.[0] ?? null
    const myTopWickets = Object.entries(myWktsMap).sort((a,b) => b[1]-a[1])[0]?.[0] ?? null

    // Priority names to always include (within cap)
    const priority = new Set([myTopScorer, myTopWickets].filter(Boolean))

    if (cap === 1) {
      // Bottom 3: pick one randomly between orange/purple cap holder (or whichever exists)
      const candidates = [...priority]
      const chosen = candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null
      const filtered = chosen
        ? tournamentBestXIRaw.filter(p => !p.isUser || p.name === chosen)
        : (() => { let hit = false; return tournamentBestXIRaw.filter(p => { if (!p.isUser) return true; if (!hit) { hit = true; return true } return false }) })()
      return filtered.slice(0, 11)
    }

    // For cap >= 2: always include priority names first, then fill remaining slots by impact
    const result = []
    const usedNames = new Set()
    // First pass: priority user players
    for (const p of tournamentBestXIRaw) {
      if (p.isUser && priority.has(p.name) && !usedNames.has(p.name)) {
        result.push(p)
        usedNames.add(p.name)
      }
    }
    // Second pass: remaining user players up to cap
    for (const p of tournamentBestXIRaw) {
      if (p.isUser && !usedNames.has(p.name) && result.filter(x => x.isUser).length < cap) {
        result.push(p)
        usedNames.add(p.name)
      }
    }
    // Third pass: opposition players to fill to 11
    for (const p of tournamentBestXIRaw) {
      if (!p.isUser && !usedNames.has(p.name)) {
        result.push(p)
        usedNames.add(p.name)
      }
    }
    return result.sort((a, b) => b.impact - a.impact).slice(0, 11)
  })()
  const playoffMatches = (matchResults ?? []).filter(r => r.stage != null && r.stage !== 'League' && r.stage !== 'Group Stage')
  const madePlayoffs   = isIPLMode && !didntQualify && playoffMatches.length > 0
  let dispWins, dispLosses, dispTotal
  if (madePlayoffs) {
    const pw = playoffMatches.filter(r => r.won).length
    const pl = playoffMatches.filter(r => !r.won).length
    dispWins   = wins + pw
    dispLosses = losses + pl
    dispTotal  = total + playoffMatches.length
  } else {
    dispWins   = wins
    dispLosses = losses
    dispTotal  = total
  }

  // Derive impact sub performance: did the sub help?
  // "performed well" = team reached Final or won; player rating >= player they replaced
  const impactSubPerf = (() => {
    if (!impactSubLog) return null
    const inOvr  = impactSubLog.in?.overall  ?? 0
    const outOvr = impactSubLog.out?.overall ?? 0
    const goodOutcome = iplOutcome === 'champion' || iplOutcome === 'runner-up'
    const ratingUpgrade = inOvr >= outOvr
    const performed = goodOutcome || ratingUpgrade
    return performed ? 'good' : 'bad'
  })()

  // Show heartbreak for: IPL runner-up, WC Final loss, WC Semi-Final exit
  const isHeartbreak = iplOutcome === 'runner-up' || stageReached === 'Runner-up' || stageReached === 'Semi-Final'

  const predicted    = getPredictedRank(myStr, mode)
  const perfWriteup = getPerformanceWriteup(wins, losses, total, iplOutcome, iplPosition, predicted.pos, potm, stageReached, mode)
  const rating = getRating(wins, losses, total, perfect, cfg.targetWins, iplOutcome, stageReached)

  const buildShareUrl = () => {
    try {
      // Compact keys to keep the base64 URL short; skip null/undefined fields
      const raw = {
        w:  dispWins,
        l:  dispLosses,
        r:  rating.label,
        m:  cfg.label || undefined,
        p:  potm || undefined,
        ts: topScorers[0]?.name || undefined,
        sr: topScorers[0]?.runs || undefined,
        tw: topWicketTakers[0]?.name || undefined,
        wk: topWicketTakers[0]?.wickets || undefined,
        mg: manager?.name || undefined,
        st: stageReached ?? iplOutcome ?? undefined,
        tm: (team ?? []).map(p => p.name),
        aw: newAwards.length > 0 ? newAwards.map(a => `${a.icon}|${a.name}`) : undefined,
        // Prior seasons in same run (compact: wins, losses, outcome/stage)
        ps: prevSeasons.length > 0 ? prevSeasons.map(h => `${h.wins}W-${h.losses}L|${h.iplOutcome ?? h.stageReached ?? '?'}`) : undefined,
      }
      const payload = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== null))
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      return `https://16zero.in/#share=${encoded}`
    } catch {
      return 'https://16zero.in'
    }
  }

  const buildShareText = (url, plain = false) => {
    const seasonLabel = seasonNumber > 1 ? ` — Season ${seasonNumber}` : ''
    if (plain) {
      // Desktop: no emojis — WhatsApp Web may render them poorly
      const scorerLine = topScorers[0]      ? `\nTop bat: ${topScorers[0].name} — ${topScorers[0].runs} runs`          : ''
      const wktrLine   = topWicketTakers[0] ? `\nTop bowl: ${topWicketTakers[0].name} — ${topWicketTakers[0].wickets} wkts` : ''
      let prevLine = ''
      if (prevSeasons.length > 0) {
        const summaries = prevSeasons.slice(0, 3).map((h, i) => {
          const sNum = seasonNumber - 1 - i
          return `S${sNum}: ${h.wins}W–${h.losses}L`
        })
        prevLine = `\nPrev: ${summaries.join(' · ')}`
      }
      return `Cricket 16-0${seasonLabel}\n\n${rating.label} | ${dispWins}W – ${dispLosses}L${scorerLine}${wktrLine}${prevLine}\n\nBeat my XI: ${url}`
    }
    // Mobile: full emoji version
    const scorerLine  = topScorers[0]      ? `\n\u{1F3C5} Top bat: ${topScorers[0].name} — ${topScorers[0].runs} runs`           : ''
    const wktrLine    = topWicketTakers[0] ? `\n\u26A1 Top bowl: ${topWicketTakers[0].name} \u2014 ${topWicketTakers[0].wickets} wkts` : ''
    let prevLine = ''
    if (prevSeasons.length > 0) {
      const summaries = prevSeasons.slice(0, 3).map((h, i) => {
        const sNum    = seasonNumber - 1 - i
        const outcome = h.iplOutcome === 'champion' ? '\u{1F3C6}' : h.iplOutcome === 'runner-up' ? '\u{1F948}' : h.stageReached === 'Champion' ? '\u{1F3C6}' : ''
        return `S${sNum}: ${h.wins}W–${h.losses}L ${outcome}`.trim()
      })
      prevLine = `\nPrev: ${summaries.join(' · ')}`
    }
    return `\u{1F3CF} Cricket 16-0${seasonLabel}\n\n${rating.emoji} ${rating.label} | ${dispWins}W – ${dispLosses}L${scorerLine}${wktrLine}${prevLine}\n\nBeat my XI \u{1F447}\n${url}`
  }

  const buildChallengeUrl = async () => {
    try {
      // Encode minimal player data needed for simulation + the challenger's result
      const squadData = (team ?? []).map(p => ({
        r:   p.role,
        o:   p.overall,
        bt:  p.batting,
        bw:  p.bowling,
        f:   p.fielding,
        n:   p.name,
        nat: p.nationality,
        id:  p.id,
        it:  p.iplTeam  ?? null,
        iy:  p.iplYear  ?? null,
        // prime fields so prime mode works
        po:  p.primeOverall  ?? null,
        pb:  p.primeBatting  ?? null,
        pbw: p.primeBowling  ?? null,
      }))
      const raw = {
        sq: squadData,
        m:  mode,
        w:  dispWins,
        l:  dispLosses,
        rl: rating.label,
        st: stageReached ?? iplOutcome ?? undefined,
      }
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(raw))))
      const long = `https://16zero.in/#challenge=${encoded}`
      return createShortUrl(long)  // returns 16zero.in/abcdef on success, long URL as fallback
    } catch {
      return 'https://16zero.in'
    }
  }

  function cardParams() {
    return {
      wins: dispWins, losses: dispLosses, total: dispTotal,
      ratingLabel: rating.label,
      ratingColor: rating.color,
      modeLabel:   cfg.label,
      mode,
      matchResults,
      potm,
      topScorer:          topScorers[0]?.name    ?? null,
      topScorerRuns:      topScorers[0]?.runs    ?? null,
      topWicketTaker:     topWicketTakers[0]?.name    ?? null,
      topWicketTakerWkts: topWicketTakers[0]?.wickets ?? null,
      bestWinStreak,
      stageReached,
      iplOutcome,
      team:       team       ?? [],
      myStr:      myStr      ?? 0,
      iconPlayer: iconPlayer ?? null,
      awards:          newAwards  ?? [],
      pastSeasons:     prevSeasons ?? [],
      impactSubPlayer: impactSubLog?.in ?? null,
    }
  }

  const downloadCard = async () => {
    const blob = await generateShareCard(cardParams())
    const isMobile = /Mobi|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1
    if (isMobile && navigator.share) {
      try {
        const file = new File([blob], `cricket16-0-${dispWins}w-${dispLosses}l.png`, { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] })
          return
        }
      } catch { /* fall through to download */ }
    }
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href     = url
    link.download = `cricket16-0-${dispWins}w-${dispLosses}l.png`
    link.click()
    URL.revokeObjectURL(url)
  }

  const copyImage = async () => {
    try {
      const blob = await generateShareCard(cardParams())
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      // Fallback to download if clipboard write not supported
      downloadCard()
    }
  }

  const [waSharing,     setWaSharing]     = useState(false)
  const [waTeamSharing, setWaTeamSharing] = useState(false)
  const [expandedMatch, setExpandedMatch] = useState(null)

  // Pre-generate share card blob on mount so it's ready instantly when user taps share.
  // This avoids user-gesture token expiry caused by async canvas rendering inside the handler.
  const shareBlobRef = useRef(null)
  useEffect(() => {
    generateShareCard(cardParams()).then(blob => { shareBlobRef.current = blob }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const shareWhatsApp = async () => {
    setWaSharing(true)
    const isMobile = /Mobi|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1

    // Open a blank window synchronously while still in the user gesture so popup
    // blockers don't intervene — we'll navigate it to wa.me after the async work.
    const desktopWin = !isMobile ? window.open('', '_blank') : null

    try {
      const long = buildShareUrl()
      const url  = await createShortUrl(long)
      const text = buildShareText(url, !isMobile)  // plain (no emojis) on desktop

      // ── Mobile: use Web Share API so user can pick WhatsApp from the sheet ──
      if (isMobile && navigator.share) {
        // Use pre-generated blob if available; otherwise generate now
        const blob = shareBlobRef.current ?? await generateShareCard(cardParams())
        shareBlobRef.current = blob

        // Try with image first
        try {
          const file = new File([blob], 'cricket16-0.png', { type: 'image/png' })
          await navigator.share({ title: 'Cricket 16-0', files: [file], text })
          return
        } catch (e) {
          if (e?.name === 'AbortError') return  // user cancelled — don't fall through
          // image share not supported — fall through to text-only
        }

        // Text-only share fallback
        try {
          await navigator.share({ title: 'Cricket 16-0', text })
          return
        } catch (e) {
          if (e?.name === 'AbortError') return
          // fall through to wa.me
        }
      }

      // ── Desktop: navigate the pre-opened blank window to WhatsApp Web ─────
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
      if (desktopWin) {
        desktopWin.location.href = waUrl
      } else {
        window.open(waUrl, '_blank')
      }
    } catch {
      desktopWin?.close()  // close the blank tab if something went wrong
    } finally {
      setWaSharing(false)
    }
  }

  // Best win streak from matchResults
  const bestWinStreak = (() => {
    let best = 0, cur = 0
    for (const r of (matchResults || [])) {
      if (r.won) { cur++; best = Math.max(best, cur) } else cur = 0
    }
    return best
  })()

  return (
    <>
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      padding: '2rem 1rem 4rem',
      position: 'relative',
    }}>
      {/* Stadium background — far behind, very subtle */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'url(/stadium.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        opacity: 0.06,
        pointerEvents: 'none',
      }} />
      <div style={{ maxWidth: 700, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Heartbreak overlay — shown when losing a Final */}
        {isHeartbreak && (
          <div style={{
            textAlign: 'center',
            marginBottom: '0.5rem',
            animation: 'fade-in-up 0.6s ease both',
          }}>
            <style>{`
              @keyframes heartbeat {
                0%,100%{transform:scale(1)} 25%{transform:scale(1.25)} 50%{transform:scale(0.95)} 75%{transform:scale(1.15)}
              }
            `}</style>
            <div style={{
              fontSize: '4rem',
              animation: 'heartbeat 1.2s ease 0.4s 2',
              display: 'inline-block',
            }}>💔</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f87171', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '0.25rem' }}>
              So close — but not this time
            </div>
            {actualWinner && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
                🏆 <span style={{ color: 'var(--text)', fontWeight: 800 }}>{actualWinner}</span> won the tournament
              </div>
            )}
          </div>
        )}

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '2rem', animation: 'fade-in-up 0.5s ease both' }}>
          <div style={{ fontSize: '4rem', marginBottom: '0.75rem' }}>{rating.emoji}</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: rating.color, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            {rating.label}
          </div>
          <div style={{ fontSize: 'clamp(3rem,10vw,5rem)', fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1 }}>
            {dispWins}-{dispLosses}
          </div>
          <div style={{ fontSize: '0.95rem', color: '#64748b', marginTop: '0.35rem', marginBottom: '0.75rem' }}>
            {cfg.label} · {dispTotal} match{dispTotal !== 1 ? 'es' : ''}{madePlayoffs ? ' incl. playoffs' : ''}{didntQualify ? ' · Didn\'t make playoffs' : ''}
          </div>
          <div style={{ fontSize: '1rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: (iplOutcome === 'eliminated' || (stageReached && stageReached !== 'Champion' && stageReached !== 'Runner-up')) ? '0.5rem' : '1.5rem' }}>
            {rating.desc}
          </div>
          {iplOutcome === 'eliminated' && (() => {
            const topBat  = topScorers[0]
            const topBowl = topWicketTakers[0]
            const playoffWins   = playoffMatches.filter(r => r.won).length
            const playoffLosses = playoffMatches.filter(r => !r.won).length
            const winPct = total > 0 ? wins / total : 0

            // Positive line — pick the best thing that happened
            let greenLine = null
            if (topBat?.runs >= 400)
              greenLine = `${topBat.name} was exceptional — ${topBat.runs} runs across the season.`
            else if (topBowl?.wickets >= 15)
              greenLine = `${topBowl.name} was devastating with the ball — ${topBowl.wickets} wickets.`
            else if (winPct >= 0.6)
              greenLine = `The league stage was strong — ${wins} wins from ${total} games.`
            else if (playoffWins > 0)
              greenLine = `You won ${playoffWins} playoff match${playoffWins > 1 ? 'es' : ''} — the team showed up when it mattered.`
            else if (topBat)
              greenLine = `${topBat.name} carried the batting — ${topBat.runs} runs all season.`

            // Negative line — pick the biggest weakness
            let redLine = null
            if (playoffLosses >= 2)
              redLine = `But the playoffs exposed the squad — ${playoffLosses} losses on the big stage.`
            else if (winPct < 0.5)
              redLine = `The league record told the story — never fully consistent enough.`
            else if (topBowl?.wickets < 10)
              redLine = `The bowling attack lacked a real match-winner when it counted.`
            else if (!topBat || topBat.runs < 250)
              redLine = `The batting never found a reliable anchor to build around.`
            else
              redLine = `One more win in the knockouts would have changed everything.`

            return (
              <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {greenLine && <div style={{ fontSize: '0.82rem', color: '#4ade80', fontWeight: 600 }}>✦ {greenLine}</div>}
                {redLine   && <div style={{ fontSize: '0.82rem', color: '#f87171', fontWeight: 600 }}>✦ {redLine}</div>}
              </div>
            )
          })()}
          {stageReached && stageReached !== 'Champion' && stageReached !== 'Runner-up' && (() => {
            const topBat  = topScorers[0]
            const topBowl = topWicketTakers[0]
            const winPct  = total > 0 ? wins / total : 0

            // Positive line
            let greenLine = null
            if (stageReached === 'Semi-Final')
              greenLine = topBat?.runs >= 300
                ? `${topBat.name} was outstanding — ${topBat.runs} runs in the tournament.`
                : topBowl?.wickets >= 10
                ? `${topBowl.name} was exceptional with the ball — ${topBowl.wickets} wickets.`
                : `You made it to the semi-finals — further than most dared to hope.`
            else if (stageReached === 'Super 8')
              greenLine = winPct >= 0.6
                ? `Strong through the groups — ${wins} wins from ${total} games was impressive.`
                : topBat
                ? `${topBat.name} gave this side something to build around — ${topBat.runs} runs.`
                : `Getting out of the group stage is an achievement in itself.`
            else
              greenLine = topBat
                ? `${topBat.name} gave everything — ${topBat.runs} runs in a tough tournament.`
                : winPct >= 0.4
                ? `The team showed fight — ${wins} wins despite a difficult group.`
                : null

            // Negative line
            let redLine = null
            if (stageReached === 'Semi-Final')
              redLine = `One more win would have made history. The Final just slipped away.`
            else if (stageReached === 'Super 8')
              redLine = topBowl && topBowl.wickets < 8
                ? `The bowling couldn't maintain the consistency needed in the knockout phase.`
                : `Couldn't find the wins in the Super 8s when the pressure peaked.`
            else
              redLine = winPct < 0.3
                ? `A brutal group stage — the results never came together when it mattered.`
                : `So close to advancing — the margins were fine, the results weren't.`

            return (
              <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {greenLine && <div style={{ fontSize: '0.82rem', color: '#4ade80', fontWeight: 600 }}>✦ {greenLine}</div>}
                {redLine   && <div style={{ fontSize: '0.82rem', color: '#f87171', fontWeight: 600 }}>✦ {redLine}</div>}
              </div>
            )
          })()}

          {/* Match blocks — click to expand */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 3, marginBottom: '0.5rem' }}>
            {(matchResults || []).map((r, i) => (
              <div
                key={i}
                title={`Match ${i+1} vs ${r.opponent}`}
                onClick={() => setExpandedMatch(expandedMatch === i ? null : i)}
                style={{
                  width: 26, height: 26, borderRadius: 4,
                  background: r.won ? '#16a34a' : '#dc2626',
                  cursor: 'pointer',
                  outline: expandedMatch === i ? '2px solid #f59e0b' : 'none',
                  outlineOffset: 2,
                  transition: 'outline 0.1s, transform 0.1s',
                  transform: expandedMatch === i ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.875rem' }}>
            Tap a result to see match details
          </div>

          {/* Expanded match detail */}
          {expandedMatch !== null && matchResults?.[expandedMatch] && (() => {
            const r = matchResults[expandedMatch]
            const scorer  = r.stats?.topScorer  || r.stats?.topScorer2
            const bowler  = r.stats?.topBowler
            const mvp     = r.won
              ? (scorer?.name || bowler?.name)
              : (bowler?.name || scorer?.name)
            const commentary = r.summary || (r.won
              ? `A strong performance against ${r.opponent}.`
              : `${r.opponent} edged this one.`)
            return (
              <div style={{
                margin: '0 0 1rem',
                padding: '1rem 1.25rem',
                background: r.won ? 'rgba(165,13,36,0.12)' : 'rgba(58,58,74,0.18)',
                border: `1.5px solid ${r.won ? '#C8102E55' : '#3a3a5a'}`,
                borderRadius: '0.875rem',
                textAlign: 'left',
                animation: 'fade-in-up 0.2s ease both',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: r.won ? '#22c55e' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>
                      Match {expandedMatch + 1}{r.stage ? ` · ${r.stage}` : ''}
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text)' }}>
                      vs {r.opponent}
                    </div>
                  </div>
                  <div style={{
                    padding: '0.3rem 0.75rem', borderRadius: '999px',
                    background: r.won ? '#22c55e22' : 'var(--border2)',
                    border: `1px solid ${r.won ? '#22c55e55' : 'var(--border)'}`,
                    fontSize: '0.75rem', fontWeight: 800,
                    color: r.won ? '#22c55e' : '#64748b',
                  }}>
                    {r.won ? 'WIN' : 'LOSS'}
                  </div>
                </div>

                {(r.myScore != null || r.oppScore != null) && (
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.625rem' }}>
                    {r.myScore ?? '–'} <span style={{ color: '#475569' }}>vs</span> {r.oppScore ?? '–'}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.625rem' }}>
                  {scorer?.name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
                      <span>🏏</span>
                      <span style={{ color: 'var(--text)', fontWeight: 700 }}>{scorer.name}</span>
                      {scorer.runs != null && <span style={{ color: '#f97316', fontWeight: 800 }}>{scorer.runs} runs</span>}
                    </div>
                  )}
                  {bowler?.name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
                      <span>🎯</span>
                      <span style={{ color: 'var(--text)', fontWeight: 700 }}>{bowler.name}</span>
                      {bowler.wickets != null && <span style={{ color: '#a855f7', fontWeight: 800 }}>{bowler.wickets} wkts</span>}
                    </div>
                  )}
                </div>

                {mvp && (
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.5rem' }}>
                    ⭐ MVP: {mvp}
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{commentary}"
                </div>
              </div>
            )
          })()}

          {/* Season-best streak */}
          {bestWinStreak >= 2 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.3rem 0.875rem',
              background: '#C8102E18', border: '1px solid #C8102E33',
              borderRadius: '999px', marginBottom: '1.25rem',
              fontSize: '0.78rem', fontWeight: 800, color: '#C8102E',
            }}>
              🔥 Season-best streak: {bestWinStreak} wins in a row
            </div>
          )}

          {/* ── Challenge comparison card ── */}
          {challengerResult && (() => {
            const cw = challengerResult.wins ?? 0
            const cl = challengerResult.losses ?? 0
            const youWon = wins > cw || (wins === cw && losses < cl)
            const tied   = wins === cw && losses === cl
            return (
              <div style={{
                marginBottom: '1.25rem',
                padding: '0.875rem 1.25rem',
                background: youWon ? 'linear-gradient(135deg,#14532d18,#15803d18)' : tied ? 'linear-gradient(135deg,#1e3a8a18,#1e40af18)' : 'linear-gradient(135deg,#7f1d1d18,#b91c1c18)',
                border: `2px solid ${youWon ? '#22c55e55' : tied ? '#60a5fa55' : '#ef444455'}`,
                borderRadius: '0.875rem',
                animation: 'fade-in-up 0.4s ease both',
              }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.6rem' }}>⚔️ Challenge Result</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.75rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700, marginBottom: '0.2rem' }}>THEM</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#94a3b8' }}>{cw}–{cl}</div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{challengerResult.ratingLabel}</div>
                  </div>
                  <div style={{ fontSize: '1.2rem', color: youWon ? '#4ade80' : tied ? '#60a5fa' : '#f87171' }}>
                    {youWon ? '🏆' : tied ? '🤝' : '💔'}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.6rem', color: youWon ? '#4ade80' : '#f87171', fontWeight: 700, marginBottom: '0.2rem' }}>YOU</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)' }}>{wins}–{losses}</div>
                    <div style={{ fontSize: '0.65rem', color: youWon ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {youWon ? 'You beat the challenge! 🎉' : tied ? 'Exactly matched!' : 'Better luck next time'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}


          {/* ── Orange Cap / Purple Cap / Best Player ── */}
          {(topScorers.length > 0 || topWicketTakers.length > 0 || potm) && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.6rem' }}>
                Season Award Winners
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {topScorers.length > 0 && (
                  <div style={{
                    flex: 1, minWidth: 100,
                    background: 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(234,88,12,0.08))',
                    border: '1px solid rgba(249,115,22,0.4)',
                    borderRadius: '0.875rem', padding: '0.875rem 0.75rem', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>{mode === 'ipl' ? '🟠 Orange Cap' : '⭐ Top Scorer'}</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.2 }}>{topScorers[0].name}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f97316', marginTop: '0.15rem' }}>
                      {topScorers[0].runs} <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600 }}>runs</span>
                    </div>
                  </div>
                )}
                {topWicketTakers.length > 0 && (
                  <div style={{
                    flex: 1, minWidth: 100,
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(126,34,206,0.08))',
                    border: '1px solid rgba(168,85,247,0.4)',
                    borderRadius: '0.875rem', padding: '0.875rem 0.75rem', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>{mode === 'ipl' ? '🟣 Purple Cap' : '🎯 Top Wicket Taker'}</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.2 }}>{topWicketTakers[0].name}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#a855f7', marginTop: '0.15rem' }}>
                      {topWicketTakers[0].wickets} <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600 }}>wkts</span>
                    </div>
                  </div>
                )}
                {potm && (
                  <div style={{
                    flex: 1, minWidth: 100,
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(180,120,0,0.08))',
                    border: '1px solid rgba(245,158,11,0.4)',
                    borderRadius: '0.875rem', padding: '0.875rem 0.75rem', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>⭐ Best Player</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.2 }}>{potm}</div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, marginTop: '0.15rem' }}>Player of Season</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Medals earned this season ── */}
          {newAwards.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{
                fontSize: '0.6rem', fontWeight: 800, color: '#f59e0b',
                textTransform: 'uppercase', letterSpacing: '0.12em',
                marginBottom: '0.6rem',
              }}>
                🏅 Medals Unlocked This Season
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                {newAwards.map(award => (
                  <div key={award.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                    padding: '0.45rem 0.875rem',
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.06))',
                    border: '1.5px solid rgba(245,158,11,0.35)',
                    borderRadius: '0.625rem',
                    animation: 'fade-in-up 0.4s ease both',
                  }}>
                    <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>{award.icon}</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1.1 }}>
                        {award.name}
                      </div>
                      <div style={{ fontSize: '0.58rem', color: '#94a3b8', lineHeight: 1.3, maxWidth: 140 }}>
                        {award.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team strength bar */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--card-border)',
            borderRadius: '0.75rem', padding: '1rem 1.25rem', marginBottom: '1.25rem',
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                Team Rating{manager ? ` · ${manager.icon} ${manager.name}` : ''}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#f59e0b' }}>{myStr}</span>
            </div>
            <div style={{ height: 8, background: 'var(--border2)', borderRadius: 4 }}>
              <div style={{ width: `${myStr}%`, height: '100%', background: 'linear-gradient(90deg, #C8102E, #f59e0b)', borderRadius: 4, transition: 'width 1s ease' }} />
            </div>
          </div>

          {/* Icon in team — shown only if a legend appeared via Impact Sub */}
          {iconPlayer && (
            <div style={{
              marginBottom: '1.25rem',
              padding: '0.875rem 1.25rem',
              background: 'linear-gradient(135deg, #78350f18, #92400e18)',
              border: '2px solid #f59e0b55',
              borderRadius: '0.875rem',
              display: 'flex', alignItems: 'center', gap: '1rem',
              animation: 'fade-in-up 0.4s ease both',
            }}>
              <div style={{ fontSize: '2rem', flexShrink: 0 }}>⭐</div>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.2rem' }}>
                  Icon in Team
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {iconPlayer.name}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  {iconPlayer.nationality} · {iconPlayer.role} · Legend signing via Impact Sub
                </div>
                {impactSubPerf && (() => {
                  const inP  = impactSubLog.in
                  const outP = impactSubLog.out
                  const inRuns  = topScorers.find(s => s.name === inP?.name)?.runs ?? null
                  const inWkts  = topWicketTakers.find(w => w.name === inP?.name)?.wickets ?? null
                  const inOvr   = inP?.overall ?? 0
                  const outOvr  = outP?.overall ?? 0
                  const upgrade = inOvr >= outOvr
                  let sentence
                  if (impactSubPerf === 'good') {
                    if (inRuns && inRuns >= 150) sentence = `${inP.name} justified the move — ${inRuns} runs in the playoffs.`
                    else if (inWkts && inWkts >= 5) sentence = `${inP.name} was worth every bit — ${inWkts} wickets in the playoffs.`
                    else if (upgrade) sentence = `A ${inOvr - outOvr > 0 ? Math.round((inOvr - outOvr) * 0.88) + '-point' : 'smart'} upgrade on ${outP?.name ?? 'the outgoing player'} — paid off.`
                    else sentence = `${inP?.name ?? 'The sub'} came in and kept the team competitive through the playoffs.`
                  } else {
                    if (inRuns !== null && inRuns < 80) sentence = `${inP.name} managed just ${inRuns} runs — the gamble didn't pay off.`
                    else if (inWkts !== null && inWkts < 3) sentence = `${inP.name} picked up only ${inWkts} wicket${inWkts !== 1 ? 's' : ''} — couldn't make the impact expected.`
                    else if (!upgrade) sentence = `Replacing ${outP?.name ?? 'a key player'} backfired — the team missed their experience.`
                    else sentence = `${inP?.name ?? 'The sub'} had the rating but couldn't replicate it when it mattered most.`
                  }
                  return (
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: impactSubPerf === 'good' ? '#4ade80' : '#f87171', marginTop: '0.25rem' }}>
                      {impactSubPerf === 'good' ? '✅' : '❌'} {sentence}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Impact Sub performance line */}
          {impactSubLog && !iconPlayer && (
            <div style={{
              marginBottom: '1.25rem',
              padding: '0.75rem 1.25rem',
              background: impactSubPerf === 'good'
                ? 'linear-gradient(135deg, #14532d18, #15803d18)'
                : 'linear-gradient(135deg, #7f1d1d18, #b91c1c18)',
              border: `2px solid ${impactSubPerf === 'good' ? '#22c55e55' : '#ef444455'}`,
              borderRadius: '0.875rem',
              display: 'flex', alignItems: 'center', gap: '0.875rem',
              animation: 'fade-in-up 0.4s ease both',
            }}>
              <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>
                {impactSubPerf === 'good' ? '✅' : '❌'}
              </div>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 900, color: impactSubPerf === 'good' ? '#22c55e' : '#ef4444', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.15rem' }}>
                  Impact Sub · {impactSubLog.event?.label ?? 'Transfer'}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>
                  {impactSubLog.in?.name} <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.75rem' }}>in for</span> {impactSubLog.out?.name}
                </div>
                <div style={{ fontSize: '0.7rem', color: impactSubPerf === 'good' ? '#4ade80' : '#f87171', marginTop: '0.1rem' }}>
                  {(() => {
                    const inP  = impactSubLog.in
                    const outP = impactSubLog.out
                    const inRuns  = topScorers.find(s => s.name === inP?.name)?.runs ?? null
                    const inWkts  = topWicketTakers.find(w => w.name === inP?.name)?.wickets ?? null
                    const inOvr   = inP?.overall ?? 0
                    const outOvr  = outP?.overall ?? 0
                    const upgrade = inOvr >= outOvr
                    if (impactSubPerf === 'good') {
                      if (inRuns && inRuns >= 150) return `${inP.name} justified the move — ${inRuns} runs in the playoffs.`
                      if (inWkts && inWkts >= 5)  return `${inP.name} was worth every bit — ${inWkts} wickets in the playoffs.`
                      if (upgrade) return `A smart upgrade on ${outP?.name ?? 'the outgoing player'} — paid off when it mattered.`
                      return `${inP?.name ?? 'The sub'} kept the team competitive through the playoffs.`
                    } else {
                      if (inRuns !== null && inRuns < 80) return `${inP.name} managed just ${inRuns} runs — the gamble didn't pay off.`
                      if (inWkts !== null && inWkts < 3)  return `${inP.name} picked up only ${inWkts} wicket${inWkts !== 1 ? 's' : ''} — couldn't make the impact expected.`
                      if (!upgrade) return `Replacing ${outP?.name ?? 'a key player'} backfired — the team missed their experience.`
                      return `${inP?.name ?? 'The sub'} had the rating but couldn't replicate it when it mattered most.`
                    }
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="share-btns" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem' }}>
            {/* WhatsApp */}
            <button
              onClick={shareWhatsApp}
              disabled={waSharing}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.45rem',
                padding: '0.8rem 1.4rem',
                background: waSharing ? '#1aaa52' : '#25D366',
                color: '#fff', border: 'none', borderRadius: '0.625rem',
                fontSize: '0.88rem', fontWeight: 800, cursor: waSharing ? 'wait' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {waSharing ? '⏳ Shortening…' : 'WhatsApp'}
            </button>
            {/* Copy Image */}
            <button
              onClick={copyImage}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.45rem',
                padding: '0.8rem 1.4rem',
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: '#fff', border: 'none', borderRadius: '0.625rem',
                fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              📋 Copy Image
            </button>
            {/* Save Card (download) */}
            <button
              onClick={downloadCard}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.45rem',
                padding: '0.8rem 1.4rem',
                background: 'transparent',
                color: '#94a3b8', border: '1px solid var(--border)', borderRadius: '0.625rem',
                fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              📸 Save Card
            </button>
            {/* Close / Play Again */}
            <button
              onClick={onPlayAgain}
              style={{
                background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E',
                borderRadius: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700,
                padding: '0.3rem 0.65rem', letterSpacing: '0.02em',
              }}
            >
              🏠 Home
            </button>
          </div>
        </div>

        {/* ── H2H Bragging Rights Card ── */}
        {h2hContext && (
          <div style={{
            marginTop: '1.25rem',
            padding: '1.25rem',
            background: 'linear-gradient(135deg, #0d0d1a, #0a0a1200)',
            border: '2px solid #f59e0b55',
            borderRadius: '1rem',
            animation: 'fade-in-up 0.4s ease both',
          }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.875rem', textAlign: 'center' }}>
              ⚔️ Multiplayer Bragging Rights
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.75rem', alignItems: 'center', marginBottom: '0.875rem' }}>
              {/* My column */}
              <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#C8102E', marginBottom: '0.3rem' }}>You</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{wins}</div>
                <div style={{ fontSize: '0.62rem', color: '#64748b' }}>wins</div>
                <div style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 700, marginTop: '0.2rem' }}>{losses}L</div>
              </div>
              {/* VS */}
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#64748b' }}>vs</div>
              {/* Opponent column */}
              <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--card)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', marginBottom: '0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h2hContext.opponentName}</div>
                {h2hOppStats ? (
                  <>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{h2hOppStats.wins}</div>
                    <div style={{ fontSize: '0.62rem', color: '#64748b' }}>wins</div>
                    <div style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 700, marginTop: '0.2rem' }}>{h2hOppStats.losses}L</div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.72rem', color: '#475569', padding: '0.5rem 0' }}>Still playing…</div>
                )}
              </div>
            </div>
            {/* Verdict */}
            {h2hOppStats && (() => {
              const iWon = wins > h2hOppStats.wins
              const tied = wins === h2hOppStats.wins
              return (
                <div style={{ textAlign: 'center', padding: '0.6rem', background: iWon ? '#0d1a0d' : tied ? 'var(--card)' : '#1a0d0d', borderRadius: '0.625rem', border: `1px solid ${iWon ? '#22c55e44' : tied ? 'var(--border)' : '#ef444444'}` }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900, color: iWon ? '#22c55e' : tied ? '#94a3b8' : '#ef4444' }}>
                    {iWon ? `🏆 You win the bragging rights!` : tied ? `🤝 It's a tie!` : `${h2hContext.opponentName} wins the bragging rights`}
                  </div>
                </div>
              )
            })()}
            {/* WhatsApp share for H2H */}
            <button
              onClick={async () => {
                setWaSharing2(true)
                try {
                  const oppLine = h2hOppStats ? ` · ${h2hContext.opponentName}: ${h2hOppStats.wins}W–${h2hOppStats.losses}L` : ''
                  const long = buildShareUrl()
                  const url = await createShortUrl(long)
                  const text = `⚔️ MULTIPLAYER RESULT\nMe: ${wins}W–${losses}L${oppLine}\n\nPlayed on Cricket 16-0 • ${url}`
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                } finally {
                  setWaSharing2(false)
                }
              }}
              disabled={waSharing2}
              style={{
                width: '100%', marginTop: '0.875rem', padding: '0.75rem',
                background: waSharing2 ? '#1aaa52' : '#25D366',
                color: '#fff', border: 'none', borderRadius: '0.625rem',
                fontSize: '0.88rem', fontWeight: 800, cursor: waSharing2 ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              }}
            >
              📣 {waSharing2 ? 'Shortening…' : 'Share Multiplayer Result on WhatsApp'}
            </button>
          </div>
        )}

        {/* ── Cup Standings (Friends Cup / Live Cup) ── */}
        {cupCtx && cupStandings && cupStandings.length > 0 && (
          <div style={{
            marginTop: '1.25rem',
            padding: '1.1rem 1.25rem',
            background: 'linear-gradient(135deg, rgba(200,16,46,0.07), rgba(200,16,46,0.03))',
            border: '1.5px solid rgba(200,16,46,0.3)',
            borderRadius: '1rem',
            animation: 'fade-in-up 0.4s ease 0.15s both',
          }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 900, color: '#C8102E', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>
              {cupCtx.type === 'friends' ? '👥 Friends Cup Standings' : '⚡ Live Cup Standings'}
            </div>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 32px 32px 32px 42px', gap: '0.2rem', padding: '0 0.5rem 0.3rem', fontSize: '0.58rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <div>#</div><div>Player</div>
              <div style={{ textAlign: 'center' }}>P</div>
              <div style={{ textAlign: 'center' }}>W</div>
              <div style={{ textAlign: 'center' }}>L</div>
              <div style={{ textAlign: 'center' }}>Pts</div>
            </div>
            {cupStandings.slice(0, 8).map((p, idx) => {
              const isMe = p.playerId === cupCtx.playerId
              return (
                <div key={p.playerId} style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr 32px 32px 32px 42px', gap: '0.2rem',
                  alignItems: 'center', padding: '0.35rem 0.5rem',
                  background: isMe ? 'rgba(200,16,46,0.1)' : idx === 0 ? 'rgba(245,158,11,0.06)' : 'transparent',
                  border: `1px solid ${isMe ? 'rgba(200,16,46,0.3)' : 'transparent'}`,
                  borderRadius: '0.4rem', marginBottom: '0.15rem',
                  fontSize: '0.75rem',
                }}>
                  <div style={{ fontWeight: 800, color: idx === 0 ? '#f59e0b' : '#64748b', textAlign: 'center' }}>{idx + 1}</div>
                  <div style={{ fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.displayName}{isMe ? ' ★' : ''}
                  </div>
                  <div style={{ textAlign: 'center', color: '#64748b' }}>{p.played}</div>
                  <div style={{ textAlign: 'center', color: '#22c55e', fontWeight: 700 }}>{p.wins}</div>
                  <div style={{ textAlign: 'center', color: '#ef4444', fontWeight: 700 }}>{p.losses}</div>
                  <div style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 900 }}>{p.pts}</div>
                </div>
              )
            })}
            <div style={{ marginTop: '0.625rem', textAlign: 'center' }}>
              <button onClick={onPlayAgain} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#C8102E', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                View full standings →
              </button>
            </div>
          </div>
        )}

        {/* ── Challenge a Friend — separate, clearly distinct from share ── */}
        <div style={{
          marginTop: '1.25rem',
          padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, #1e1b4b22, #312e8122)',
          border: '2px solid #6366f155',
          borderRadius: '1rem',
          textAlign: 'center',
          animation: 'fade-in-up 0.5s ease 0.2s both',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.3rem' }}>
            ⚔️ Challenge a Friend
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.875rem' }}>
            Can they beat your {dispWins}W–{dispLosses}L record with the <strong style={{ color: 'var(--text)' }}>exact same squad?</strong> Send them your squad — they play blind.
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
            {/* WhatsApp share team button */}
            <button
              onClick={async () => {
                setWaTeamSharing(true)
                try {
                  const url  = await buildChallengeUrl()
                  const text = `🏏 Here's my Cricket 16-0 XI — ${dispWins}W–${dispLosses}L!\n\nPlay a full season with my exact 11 players. Can you go further?\n${url}`
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                } finally {
                  setWaTeamSharing(false)
                }
              }}
              disabled={waTeamSharing}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.75rem 0.75rem',
                background: waTeamSharing ? '#1aaa52' : '#25D366',
                color: '#fff', border: 'none', borderRadius: '0.625rem',
                fontSize: '0.82rem', fontWeight: 800,
                cursor: waTeamSharing ? 'wait' : 'pointer',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {waTeamSharing ? '⏳ Generating…' : 'Share My XI on WhatsApp'}
            </button>

            {/* Copy link button */}
            <button
              onClick={async () => {
                const btn = document.getElementById('challenge-copy-btn')
                if (btn) btn.textContent = '⏳ Generating link…'
                const url = await buildChallengeUrl()
                navigator.clipboard?.writeText(url).then(() => {
                  if (btn) { btn.textContent = '✅ Link Copied!'; setTimeout(() => { btn.textContent = '📋 Copy Challenge Link' }, 2000) }
                }).catch(() => {
                  window.prompt('Copy this challenge link:', url)
                  if (btn) btn.textContent = '📋 Copy Challenge Link'
                })
              }}
              id="challenge-copy-btn"
              style={{
                flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.75rem 0.75rem',
                background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                color: '#fff', border: 'none', borderRadius: '0.625rem',
                fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 4px 16px #6366f133',
              }}
            >
              📋 Copy Challenge Link
            </button>
          </div>
          <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.5rem' }}>
            Recipient sees your 11 players and plays a full season with that exact squad.
          </div>
        </div>

        {/* ── Season History ── */}
        <SeasonHistoryCard
          seasonNumber={seasonNumber}
          prevSeasons={prevSeasons}
          currentWins={dispWins}
          currentLosses={dispLosses}
          currentIplOutcome={iplOutcome}
          currentStageReached={stageReached}
        />

        {/* ── Play Again Hook — just below share buttons to hook player ── */}
        <BestFinishHook
          wins={wins}
          losses={losses}
          iplOutcome={iplOutcome}
          stageReached={stageReached}
          onPlayAgain={onPlayAgain}
          onNextSeason={onNextSeason}
          seasonNumber={seasonNumber}
          mode={mode}
        />

        {/* ── Season Highlights ─────────────────────────────── */}
        <SeasonHighlights
          topScorers={topScorers}
          topWicketTakers={topWicketTakers}
          potm={potm}
          iplPosition={iplPosition}
          predictedPos={predicted.pos}
          predictedShort={predicted.short}
          perfWriteup={perfWriteup}
          iplOutcome={iplOutcome}
          stageReached={stageReached}
          mode={mode}
        />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem', background: 'var(--card)', padding: '0.35rem', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
          {[
            { id: 'overview',     label: '📊 Awards' },
            { id: 'playerstats',  label: '🏏 Player Stats' },
            { id: 'matches',      label: '📋 Matches' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '0.5rem 0.5rem',
                background: tab === t.id ? '#C8102E' : 'transparent',
                color: tab === t.id ? 'var(--bg)' : '#64748b',
                border: 'none', borderRadius: '0.5rem',
                fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'overview' && (
          <>
            <OverviewTab
              tournamentBestXI={tournamentBestXI}
              bestXI={bestXI}
              team={team}
            />

            {/* Save progress CTA — shown only when not logged in */}
            {!user && !resultJustSaved && (
              <div style={{
                margin: '1.25rem 0 1rem',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                border: '1px solid #334155',
                borderRadius: '1rem',
                padding: '1.25rem 1.25rem 1.1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>🔒</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '0.2rem' }}>
                  Your result isn't saved yet
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Sign in to save this result to your profile, track your stats over time, and compete on the leaderboards.
                </div>
                <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {/* Google */}
                  <button
                    onClick={() => {
                      // Persist result to localStorage so it survives the OAuth page redirect
                      try {
                        localStorage.setItem('pending_game_result', JSON.stringify({
                          mode,
                          wins:         summary?.wins         ?? 0,
                          losses:       summary?.losses       ?? 0,
                          total:        summary?.total        ?? 0,
                          stageReached: summary?.stageReached ?? null,
                          iplOutcome:   summary?.iplOutcome   ?? null,
                          iplPosition:  summary?.iplPosition  ?? null,
                          perfect:      summary?.perfect      ?? false,
                          awardIds:     (newAwards ?? []).map(a => a.id).filter(Boolean),
                        }))
                        // Also persist full results screen state for Safari redirect recovery
                        localStorage.setItem('pending_results_state', JSON.stringify({
                          mode, summary, matchResults, team, manager,
                          newAwards: (newAwards ?? []).map(a => ({ id: a.id, icon: a.icon, name: a.name })),
                          prevSeasons, seasonNumber,
                        }))
                      } catch {}
                      onGoogleSignIn?.()
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.6rem 1rem',
                      background: '#fff', border: 'none',
                      borderRadius: '0.5rem', cursor: 'pointer',
                      fontSize: '0.78rem', fontWeight: 700, color: '#1e293b',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 18 18">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
                    </svg>
                    Continue with Google
                  </button>
                  {/* Email */}
                  <button
                    onClick={() => {
                      // Persist result now — survives email confirmation redirect for sign-up,
                      // and is also used as fallback for sign-in if the page somehow reloads.
                      try {
                        localStorage.setItem('pending_game_result', JSON.stringify({
                          mode,
                          wins:         summary?.wins         ?? 0,
                          losses:       summary?.losses       ?? 0,
                          total:        summary?.total        ?? 0,
                          stageReached: summary?.stageReached ?? null,
                          iplOutcome:   summary?.iplOutcome   ?? null,
                          iplPosition:  summary?.iplPosition  ?? null,
                          perfect:      summary?.perfect      ?? false,
                          awardIds:     (newAwards ?? []).map(a => a.id).filter(Boolean),
                        }))
                      } catch {}
                      setShowAuthModal(true)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.6rem 1rem',
                      background: '#C8102E', border: 'none',
                      borderRadius: '0.5rem', cursor: 'pointer',
                      fontSize: '0.78rem', fontWeight: 700, color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    ✉️ Sign in / Sign up with email
                  </button>
                </div>
              </div>
            )}

            {/* Saved confirmation */}
            {(user || resultJustSaved) && resultJustSaved && (
              <div style={{
                margin: '0 0 1rem',
                background: '#052e16',
                border: '1px solid #166534',
                borderRadius: '1rem',
                padding: '0.9rem 1.25rem',
                textAlign: 'center',
                fontSize: '0.8rem', fontWeight: 700, color: '#4ade80',
              }}>
                ✓ Result saved to your profile
              </div>
            )}
          </>
        )}
        {tab === 'playerstats' && (
          <PlayerStatsTab playerStats={playerStats} team={team} />
        )}
        {tab === 'matches' && (
          <MatchesTab matchResults={matchResults} />
        )}

      </div>
    </div>

    {/* Inline auth modal triggered from save CTA */}
    {showAuthModal && (
      <AuthModal
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => { setShowAuthModal(false); setResultJustSaved(true) }}
      />
    )}
    </>
  )
}

// ─── Best Finish Hook ─────────────────────────────────────────────────────────

function BestFinishHook({ wins, losses, iplOutcome, stageReached, onPlayAgain, onNextSeason, seasonNumber = 1, mode = 'ipl' }) {
  const profile  = loadProfile()
  const history  = profile.history ?? []

  // Current season (already saved by recordSeason before Results renders)
  const current  = history[0]
  const bestPrev = getBestPreviousFinish(history)

  // Build current finish label
  const curLabel  = current ? finishLabel(current) : `${wins}W–${losses}L`
  const curRank  = rankFinish(current ?? {})
  const prevRank = rankFinish(bestPrev ?? {})
  const isNewBest = bestPrev == null ||
    curRank < prevRank ||
    (curRank === prevRank && (current?.wins ?? 0) >= (bestPrev?.wins ?? 0))
  const hookLine  = bestPrev
    ? getHookLine(curLabel, finishLabel(bestPrev), isNewBest)
    : `First season done. Now build on it.`

  const bestLabel  = bestPrev ? finishLabel(bestPrev) : curLabel
  const bestWins   = bestPrev?.wins ?? wins
  const bestLosses = bestPrev?.losses ?? losses

  return (
    <div style={{
      marginTop: '2rem',
      padding: '1.25rem 1.25rem 1.5rem',
      background: 'var(--card)',
      border: '1px solid var(--card-border)',
      borderRadius: '1rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
        Your best finish ever
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.2rem' }}>
        {bestLabel}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.1rem' }}>
        {bestWins}W – {bestLosses}L
      </div>
      <div style={{
        margin: '0.875rem 0 1.25rem',
        fontSize: '0.88rem',
        color: isNewBest ? '#f59e0b' : '#94a3b8',
        fontWeight: isNewBest ? 800 : 600,
        lineHeight: 1.5,
      }}>
        {isNewBest && <span style={{ display: 'block', fontSize: '1.5rem', marginBottom: '0.25rem' }}>🔥</span>}
        {hookLine}
      </div>
      {/* Season N+1 — the main hook CTA (IPL only) */}
      {onNextSeason ? (
        <>
          <button
            onClick={onNextSeason}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#0a0f1a',
              border: 'none',
              borderRadius: '0.75rem',
              fontSize: '1.05rem',
              fontWeight: 900,
              cursor: 'pointer',
              letterSpacing: '0.02em',
              marginBottom: '0.625rem',
              boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {mode === 'ipl' ? `🏆 Season ${seasonNumber + 1} — Retain & Rebuild →` : `🏏 Season ${seasonNumber + 1} — New Campaign →`}
          </button>
          <button
            onClick={onPlayAgain}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'transparent',
              color: '#64748b',
              border: '1px solid var(--border)',
              borderRadius: '0.625rem',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            🏠 Start Fresh
          </button>
        </>
      ) : (
        /* WC modes — just nudge to play again */
        <button
          onClick={onPlayAgain}
          style={{
            width: '100%',
            padding: '1rem',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#0a0f1a',
            border: 'none',
            borderRadius: '0.75rem',
            fontSize: '1.05rem',
            fontWeight: 900,
            cursor: 'pointer',
            letterSpacing: '0.02em',
            boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          🏏 Play Again →
        </button>
      )}
    </div>
  )
}

// ─── Season Highlights ─────────────────────────────────────────────────────

function SeasonHighlights({ topScorers, topWicketTakers, potm, iplPosition, predictedPos, predictedShort, perfWriteup, iplOutcome, stageReached, mode }) {
  const topBat   = topScorers?.[0]
  const topBowl  = topWicketTakers?.[0]

  return (
    <div style={{ marginTop: '1.25rem', marginBottom: '1.5rem', animation: 'fade-in-up 0.4s 0.1s ease both', animationFillMode: 'both' }}>

      {/* Hero stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem', marginBottom: '1rem' }}>

        {/* Top Batter */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '0.875rem', padding: '0.875rem 0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>🏏</div>
          <div style={{ fontSize: '0.58rem', color: '#C8102E', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>Top Scorer</div>
          {topBat ? (
            <>
              <div style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.2, marginBottom: '0.25rem' }}>{topBat.name}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#C8102E' }}>{topBat.runs}</div>
              <div style={{ fontSize: '0.58rem', color: '#64748b' }}>runs</div>
            </>
          ) : <div style={{ fontSize: '0.7rem', color: 'var(--border)' }}>—</div>}
        </div>

        {/* Top Bowler */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '0.875rem', padding: '0.875rem 0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>🎯</div>
          <div style={{ fontSize: '0.58rem', color: '#a855f7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>Top Bowler</div>
          {topBowl ? (
            <>
              <div style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.2, marginBottom: '0.25rem' }}>{topBowl.name}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#a855f7' }}>{topBowl.wickets}</div>
              <div style={{ fontSize: '0.58rem', color: '#64748b' }}>wickets</div>
            </>
          ) : <div style={{ fontSize: '0.7rem', color: 'var(--border)' }}>—</div>}
        </div>

        {/* Best Player / POTM */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '0.875rem', padding: '0.875rem 0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>🏅</div>
          <div style={{ fontSize: '0.58rem', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>Best Player</div>
          {potm ? (
            <>
              <div style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.2 }}>{potm}</div>
              <div style={{ fontSize: '0.58rem', color: '#f59e0b', marginTop: '0.25rem', fontWeight: 700 }}>Player of Tournament</div>
            </>
          ) : <div style={{ fontSize: '0.7rem', color: 'var(--border)' }}>—</div>}
        </div>
      </div>

      {/* Predicted vs Actual removed per user request */}
      {false && (() => {
        const isChampion = iplOutcome === 'champion' || stageReached === 'Champion'
        const isRunnerup = iplOutcome === 'runner-up' || stageReached === 'Runner-up'
        const isFinal    = stageReached === 'Final'
        const isSemi     = stageReached === 'Semi-Final'
        const isSuper8   = stageReached === 'Super 8'
        const isGroup    = stageReached === 'Group Stage'
        const isElim     = iplOutcome === 'eliminated'
        const isNoQ      = iplOutcome === 'not_qualified'

        const actualColor =
          isChampion ? '#f59e0b' :
          isRunnerup ? '#94a3b8' :
          isFinal    ? '#a78bfa' :
          isSemi || isElim ? '#C8102E' :
          isSuper8   ? '#94a3b8' :
          isGroup || isNoQ ? '#ef4444' :
          'var(--text)'

        const actualLabel =
          iplOutcome === 'champion'      ? '🏆 IPL Champions' :
          iplOutcome === 'runner-up'     ? '🥈 Runners-Up' :
          iplOutcome === 'eliminated'    ? '⚡ Playoff exit' :
          iplOutcome === 'not_qualified' ? (iplPosition ? `${ordinal(iplPosition)} place` : '❌ Missed Playoffs') :
          stageReached === 'Champion'    ? '🏆 World Champions' :
          stageReached === 'Runner-up'   ? '🥈 Final (Runner-up)' :
          stageReached === 'Final'       ? '🏟 Reached the Final' :
          stageReached === 'Semi-Final'  ? '⚡ Semi-Final exit' :
          stageReached === 'Super 8'     ? '📋 Super 8 exit' :
          stageReached === 'Group Stage' ? '❌ Group Stage exit' :
          'Season complete'

        const exceeded = isChampion || isRunnerup || isFinal || isSemi || isElim

        return (
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '1rem',
            padding: '1.25rem',
            animation: 'fade-in-up 0.3s ease both',
          }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#C8102E', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem', textAlign: 'center' }}>
              ⚡ Season Story
            </div>

            {/* Predicted → Actual */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', marginBottom: '1.25rem' }}>
              {/* Predicted box */}
              <div style={{ flex: 1, textAlign: 'center', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '0.75rem', padding: '0.875rem 0.5rem' }}>
                <div style={{ fontSize: '0.5rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Predicted</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#64748b', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{predictedPos}</div>
                <div style={{ fontSize: '0.55rem', color: 'var(--border)', marginTop: '0.25rem', fontWeight: 600 }}>{predictedShort}</div>
              </div>

              {/* Arrow */}
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 0.1rem' }}>
                <div style={{ fontSize: '1.25rem', color: exceeded ? '#C8102E' : '#ef4444', fontWeight: 900 }}>
                  {exceeded ? '→' : '→'}
                </div>
              </div>

              {/* Actual box */}
              <div style={{
                flex: 1, textAlign: 'center',
                background: 'var(--card)',
                border: `2px solid ${actualColor}44`,
                borderRadius: '0.75rem', padding: '0.875rem 0.5rem',
                boxShadow: isChampion ? `0 0 20px ${actualColor}18` : 'none',
              }}>
                <div style={{ fontSize: '0.5rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Actual</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: actualColor, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{actualLabel}</div>
              </div>
            </div>

            {/* Color-coded narrative */}
            <div style={{ fontSize: '0.82rem', lineHeight: 1.75, fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: '0.875rem' }}>
              {perfWriteup.map((seg, i) => (
                <span key={i} style={{
                  color: seg.tone === 'positive' ? '#4ade80' : seg.tone === 'negative' ? '#f87171' : '#94a3b8',
                }}>
                  {seg.text}{' '}
                </span>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Awards tab ────────────────────────────────────────────────────────────

function SeasonHistoryCard({ seasonNumber, prevSeasons, currentWins, currentLosses, currentIplOutcome, currentStageReached }) {
  const windowStart = Math.max(1, seasonNumber - 2)
  const slots = [windowStart, windowStart + 1, windowStart + 2]

  function getSeasonData(slot) {
    if (slot > seasonNumber) return null
    if (slot === seasonNumber) {
      return { wins: currentWins, losses: currentLosses, iplOutcome: currentIplOutcome, stageReached: currentStageReached }
    }
    const idx = seasonNumber - 1 - slot
    return prevSeasons[idx] ?? null
  }

  function getOutcomeLabel(data) {
    if (!data) return null
    if (data.iplOutcome === 'champion' || data.stageReached === 'Champion') return 'Champions 🏆'
    if (data.iplOutcome === 'runner-up' || data.stageReached === 'Runner-up') return 'Runners-Up 🥈'
    if (data.stageReached) return data.stageReached
    if (data.iplOutcome) return data.iplOutcome.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return null
  }

  return (
    <div style={{ margin: '1.25rem 0' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', paddingLeft: '0.25rem' }}>
        Season History
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem' }}>
        {slots.map(slot => {
          const data = getSeasonData(slot)
          const isFuture = slot > seasonNumber
          const isChamp = data && (data.iplOutcome === 'champion' || data.stageReached === 'Champion')
          const outLabel = getOutcomeLabel(data)
          const isCurrent = slot === seasonNumber

          if (isFuture) {
            return (
              <div key={slot} style={{
                background: 'rgba(15,20,35,0.6)',
                border: '1px solid #1e293b',
                borderRadius: '0.75rem',
                padding: '0.875rem 0.5rem',
                textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: 80,
                gap: '0.35rem',
              }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Season {slot}</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#334155', fontStyle: 'italic' }}>Not yet played</div>
              </div>
            )
          }

          return (
            <div key={slot} style={{
              background: isChamp
                ? 'linear-gradient(135deg, rgba(180,120,0,0.2), rgba(120,80,0,0.14))'
                : 'var(--card)',
              border: `1.5px solid ${isChamp ? '#f59e0baa' : isCurrent ? 'rgba(200,16,46,0.5)' : 'var(--border)'}`,
              borderRadius: '0.75rem',
              padding: '0.875rem 0.5rem',
              textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 80,
            }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 800, color: isChamp ? '#f59e0b' : isCurrent ? '#C8102E' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                {isCurrent ? 'This Season' : `Season ${slot}`}
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: isChamp ? '#f59e0b' : 'var(--text)', lineHeight: 1, marginBottom: '0.2rem' }}>
                {data.wins}W <span style={{ color: '#64748b', fontWeight: 700, fontSize: '1.05rem' }}>{data.losses}L</span>
              </div>
              {outLabel && (
                <div style={{ fontSize: '0.57rem', fontWeight: 700, color: isChamp ? '#fbbf24' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.1rem' }}>
                  {outLabel}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OverviewTab({ tournamentBestXI, bestXI, team }) {
  // Tournament XI entries — only user's players, capped by stage reached
  const xiEntries = tournamentBestXI

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', animation: 'fade-in 0.3s ease both' }}>

      {/* Tournament Best XI — only user's players, capped by stage reached */}
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem', paddingLeft: '0.25rem' }}>
          🌟 Tournament Best XI
        </div>
        {xiEntries.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '1.25rem', textAlign: 'center', color: '#64748b', fontSize: '0.75rem', fontStyle: 'italic' }}>
            No players made the tournament XI — the team was eliminated too early.
          </div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {xiEntries.map((p, i) => {
              const roleClr = ROLE_COLOR[p.role] ?? '#64748b'
              const roleTag = ROLE_LABEL[p.role] ?? 'BAT'
              const isUser  = p.isUser || p.team === 'Your XI'
              return (
                <div key={`${p.name}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.55rem 0.875rem',
                  borderBottom: i < xiEntries.length - 2 ? '1px solid var(--border2)' : 'none',
                  borderRight: i % 2 === 0 ? '1px solid var(--border2)' : 'none',
                  background: isUser ? '#C8102E0d' : 'transparent',
                  borderLeft: `3px solid ${isUser ? '#C8102E66' : '#33415530'}`,
                }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#64748b', width: 16, textAlign: 'center', flexShrink: 0 }}>{i+1}</div>
                  <div style={{ padding: '0.1rem 0.3rem', borderRadius: '0.2rem', flexShrink: 0, background: roleClr + '22', border: `1px solid ${roleClr}44`, fontSize: '0.45rem', fontWeight: 900, color: roleClr, minWidth: 30, textAlign: 'center' }}>
                    {roleTag}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.55rem', color: isUser ? '#C8102E' : '#64748b', fontWeight: isUser ? 700 : 400 }}>
                      {isUser ? 'Your XI' : p.team}
                    </div>
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatTable({ title, rows, col1, col1Key, col2, col2Key, color }) {
  if (!rows || rows.length === 0) return null
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', overflow: 'hidden' }}>
      <div style={{
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border2)',
        fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {title}
      </div>
      {rows.map((r, i) => (
        <div key={r.name} style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.625rem 1.25rem',
          borderBottom: i < rows.length - 1 ? '1px solid var(--border2)' : 'none',
          background: i === 0 ? color + '08' : 'transparent',
        }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, color: i === 0 ? color : '#64748b', width: 20 }}>
            {i === 0 ? '👑' : `${i + 1}`}
          </div>
          <div style={{ flex: 1, fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>{r[col1Key]}</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: i === 0 ? color : '#94a3b8' }}>{r[col2Key]}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Tournament XI tab ────────────────────────────────────────────────────────

function TournamentXITab({ tournamentBestXI }) {
  const entries = tournamentBestXI

  return (
    <div style={{ animation: 'fade-in 0.3s ease both' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', overflow: 'hidden' }}>
        <div style={{
          padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🌟 Tournament Best XI</span>
          <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>ranked by impact</span>
        </div>
        {entries.length === 0 ? (
          <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: '#64748b', fontSize: '0.78rem', fontStyle: 'italic' }}>
            No players made the tournament XI — the team was eliminated too early.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {entries.map((p, i) => {
              const roleClr = ROLE_COLOR[p.role] ?? '#64748b'
              const roleTag = ROLE_LABEL[p.role] ?? 'BAT'
              const isUser  = p.isUser || p.team === 'Your XI'
              return (
                <div key={`${p.name}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.65rem 1rem',
                  borderBottom: i < entries.length - 2 ? '1px solid var(--border2)' : 'none',
                  borderRight: i % 2 === 0 ? '1px solid var(--border2)' : 'none',
                  background: isUser ? '#C8102E0d' : 'transparent',
                  borderLeft: `3px solid ${isUser ? '#C8102E66' : '#33415530'}`,
                }}>
                  {/* Number */}
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', width: 18, textAlign: 'center', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  {/* Role badge */}
                  <div style={{
                    padding: '0.1rem 0.3rem', borderRadius: '0.2rem', flexShrink: 0,
                    background: roleClr + '22', border: `1px solid ${roleClr}44`,
                    fontSize: '0.48rem', fontWeight: 900, color: roleClr,
                    minWidth: 32, textAlign: 'center',
                  }}>
                    {roleTag}
                  </div>
                  {/* Name + team label */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: isUser ? '#C8102E' : '#64748b', fontWeight: isUser ? 700 : 400 }}>
                      {isUser ? 'Your XI' : p.team}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Player Stats tab ────────────────────────────────────────────────────────

function PlayerStatsTab({ playerStats, team }) {
  const isBatter  = r => ['opener','top-order','middle-order','wicket-keeper'].includes(r)
  const isBowler  = r => ['pace-bowler','spin-bowler'].includes(r)
  const isAllRndr = r => r === 'all-rounder'

  const rows = (playerStats && playerStats.length > 0)
    ? playerStats
    : (team || []).map(p => ({ name: p.name, role: p.role, runs: 0, balls: 0, sr: '—', wickets: 0, bowlBalls: 0, bowlRuns: 0, economy: '—' }))

  const thStyle = {
    padding: '0.5rem 0.5rem',
    fontSize: '0.52rem', fontWeight: 800, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.07em',
    textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border2)',
  }
  const thLeft = { ...thStyle, textAlign: 'left' }
  const tdStyle = { padding: '0.55rem 0.5rem', fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', textAlign: 'right', verticalAlign: 'middle' }
  const tdLeft = { ...tdStyle, textAlign: 'left' }

  return (
    <div style={{ animation: 'fade-in 0.3s ease both' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.875rem', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🏏 Player Stats</span>
          <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, marginLeft: 'auto' }}>Full season totals</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 340 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={thLeft}>Player</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Runs</th>
                <th style={thStyle}>SR</th>
                <th style={thStyle}>Wkts</th>
                <th style={thStyle}>Econ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const roleClr = ROLE_COLOR[p.role] ?? '#64748b'
                const roleTag = ROLE_LABEL[p.role] ?? 'BAT'
                const showBat  = isBatter(p.role) || isAllRndr(p.role)
                const showBowl = isBowler(p.role) || isAllRndr(p.role)
                return (
                  <tr key={p.name} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border2)' : 'none', background: i % 2 === 0 ? 'transparent' : 'var(--border2)' }}>
                    <td style={{ ...tdLeft, color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.name}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: '0.1rem 0.35rem', borderRadius: '0.2rem', background: roleClr + '22', border: `1px solid ${roleClr}44`, fontSize: '0.48rem', fontWeight: 900, color: roleClr }}>
                        {roleTag}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: showBat && p.runs > 0 ? '#C8102E' : 'var(--border)', fontWeight: showBat && p.runs > 0 ? 800 : 400 }}>
                      {showBat ? (p.runs || 0) : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: showBat && p.sr !== '—' ? '#86efac' : 'var(--border)' }}>
                      {showBat ? p.sr : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: showBowl && p.wickets > 0 ? '#a855f7' : 'var(--border)', fontWeight: showBowl && p.wickets > 0 ? 800 : 400 }}>
                      {showBowl ? (p.wickets || 0) : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: showBowl && p.economy !== '—' ? '#c084fc' : 'var(--border)' }}>
                      {showBowl ? p.economy : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Matches tab ────────────────────────────────────────────────────────────

function MatchesTab({ matchResults }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', animation: 'fade-in 0.3s ease both' }}>
      {(matchResults || []).map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: r.won ? 'var(--win-bg)' : 'var(--loss-bg)',
          border: `1px solid ${r.won ? '#22c55e44' : 'var(--loss-border)'}`,
          borderRadius: '0.625rem',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--border2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', fontWeight: 800, color: '#64748b', flexShrink: 0,
          }}>{r.matchNum}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.stage}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>vs {r.opponent}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', color: r.won ? '#22c55e' : '#dc2626', fontWeight: 700 }}>{r.summary}</div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{r.myScore} · {r.oppScore}</div>
          </div>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            background: r.won ? '#22c55e22' : '#ef444422',
            border: `1px solid ${r.won ? '#22c55e66' : '#ef444466'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', fontWeight: 900, color: r.won ? '#22c55e' : '#ef4444',
          }}>
            {r.won ? 'W' : 'L'}
          </div>
        </div>
      ))}
    </div>
  )
}
