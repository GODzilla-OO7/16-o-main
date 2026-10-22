// Season mode add-ons plugged into the hub: playable moment, celebrations.
export { default as Moment } from './Moment.jsx'

const CELEBRATIONS = {
  '50': n => ({ icon: '🏏', title: 'FIFTY!', sub: `${n} raises the bat` }),
  '100': n => ({ icon: '💯', title: 'HUNDRED!', sub: `${n} — what a knock` }),
  hattrick: n => ({ icon: '🎩', title: 'HAT-TRICK!', sub: `${n} — three in three` }),
  sixsixes: n => ({ icon: '💥', title: 'SIX SIXES!', sub: `${n} clears the rope six times in an over` }),
}
export function celebrationFor(e) { return CELEBRATIONS[e.type]?.(e.name) ?? null }
