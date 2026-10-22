/**
 * ConfirmLeaveModal
 * Shown when the user tries to navigate away after making progress.
 *
 * Props:
 *   message  – string shown to the user
 *   onYes    – called when they confirm leaving
 *   onNo     – called when they dismiss (stay on page)
 *   onHome   – (optional) if provided, a third "🏠 Home" button is shown
 */
export default function ConfirmLeaveModal({ message, onYes, onNo, onHome }) {
  return (
    <div
      onClick={onNo}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(6,8,14,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(10,13,22,0.97)',
          border: '1px solid rgba(200,16,46,0.45)',
          borderRadius: '1.125rem',
          padding: '2rem 1.75rem 1.5rem',
          maxWidth: 360, width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
        }}
      >
        <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>⚠️</div>
        <p style={{
          color: '#e2e8f0', fontSize: '0.9rem', lineHeight: 1.6,
          margin: '0 0 1.5rem',
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onYes}
            style={{
              padding: '0.6rem 1.5rem',
              background: '#C8102E', border: 'none', borderRadius: '0.5rem',
              color: '#fff', fontSize: '0.875rem', fontWeight: 800, cursor: 'pointer',
            }}
          >
            Yes
          </button>
          <button
            onClick={onNo}
            style={{
              padding: '0.6rem 1.5rem',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '0.5rem',
              color: '#94a3b8', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            No
          </button>
          {onHome && (
            <button
              onClick={onHome}
              style={{
                background: 'rgba(200,16,46,0.12)', border: '1px solid rgba(200,16,46,0.35)', color: '#C8102E',
                borderRadius: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700,
                padding: '0.3rem 0.65rem', letterSpacing: '0.02em',
              }}
            >
              🏠 Home
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
