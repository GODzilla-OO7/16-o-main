import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import './App.css'
import App from './App.jsx'
import { initSupabase, getSupabase } from './lib/supabase.js'
import { playBtnClick } from './utils/audioEngine.js'

// Boot Supabase early so it can pick up email verification / OAuth tokens in the URL
initSupabase()

// Vercel Analytics
inject()

// ── OAuth popup callback detection ───────────────────────────────────────────
// When Google OAuth completes it redirects to our origin with ?oauth_popup=1&code=...
// We open that URL in a popup so the main window (results screen etc.) stays intact.
// Detect here: if this window was opened as a popup, let Supabase exchange the code,
// wait for the session to be stored to localStorage (which fires onAuthStateChange in
// the main window), then close the popup automatically.
// With implicit flow, Supabase puts tokens in the hash: #access_token=...
// We also set ?oauth_popup=1 on the redirectTo so we can detect popup context
// even before the hash is parsed.
const isOAuthPopup = window.opener != null &&
  (window.location.search.includes('oauth_popup=1') ||
   window.location.hash.includes('access_token='))

if (isOAuthPopup) {
  // Show minimal UI — full app rendering is unnecessary here
  document.body.style.cssText = 'margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;color:#f1f5f9;font-family:sans-serif;font-size:1rem'
  document.body.innerHTML = '<div style="text-align:center"><div style="font-size:1.5rem;margin-bottom:0.5rem">🏏</div><div>Signing in…</div><div style="font-size:0.75rem;color:#64748b;margin-top:0.25rem">This window will close automatically</div></div>'

  // Supabase detects the code/token in the URL and exchanges it for a session.
  // Once the session is stored in localStorage the main window's onAuthStateChange fires.
  getSupabase().then(sb => {
    if (!sb) { setTimeout(() => window.close(), 1000); return }
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        subscription.unsubscribe()
        window.close()
      }
    })
    // Fallback: close after 8 s even if no auth event
    setTimeout(() => { subscription.unsubscribe(); window.close() }, 8000)
  })
} else {
  // Normal app boot
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  document.addEventListener('click', (e) => {
    if (e.target.closest('button')) playBtnClick()
  }, true)
}
