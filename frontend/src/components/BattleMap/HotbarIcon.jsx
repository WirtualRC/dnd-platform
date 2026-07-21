export default function HotbarIcon({ label, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        width: 48, height: 48, borderRadius: 8, fontSize: 10, padding: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        overflow: 'hidden', lineHeight: 1.1,
        background: active ? 'var(--accent)' : 'var(--surface-2)',
        color: active ? 'var(--accent-contrast)' : 'var(--text-primary)',
        border: active ? '2px solid var(--accent-deep)' : '1px solid var(--border)',
      }}
    >
      {label}
    </button>
  );
}
