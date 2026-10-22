// Season save/load: localStorage always, Supabase too when signed in.
// Supabase table: see supabase_season.sql (season_saves). Failures fall back silently.
import { getSupabase } from '../lib/supabase.js'

const KEY = 'season_v1'

export function loadLocal() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s?.v === 1 ? s : null } catch { return null }
}

export async function loadSeason(user) {
  const local = loadLocal()
  if (!user) return local
  try {
    const sb = await getSupabase()
    if (!sb) return local
    const { data, error } = await sb.from('season_saves').select('data').eq('user_id', user.id).maybeSingle()
    if (error || !data?.data) return local
    const remote = data.data
    return !local || (remote.updatedAt ?? 0) >= (local.updatedAt ?? 0) ? remote : local
  } catch { return local }
}

export async function saveSeason(state, user) {
  try { if (state) localStorage.setItem(KEY, JSON.stringify(state)); else localStorage.removeItem(KEY) } catch { /* storage full or blocked */ }
  if (!user) return
  try {
    const sb = await getSupabase()
    if (!sb) return
    if (!state) await sb.from('season_saves').delete().eq('user_id', user.id)
    else await sb.from('season_saves').upsert({ user_id: user.id, data: state, updated_at: new Date().toISOString() })
  } catch { /* offline — local copy still saved */ }
}
