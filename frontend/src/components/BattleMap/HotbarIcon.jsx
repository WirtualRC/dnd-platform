export default function HotbarIcon({ label, iconUrl, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        width: 48, height: 48, borderRadius: 8, fontSize: 10, padding: iconUrl ? 0 : 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        overflow: 'hidden', lineHeight: 1.1,
        background: active ? 'var(--accent)' : 'var(--surface-2)',
        color: active ? 'var(--accent-contrast)' : 'var(--text-primary)',
        border: active ? '2px solid var(--accent-deep)' : '1px solid var(--border)',
      }}
    >
      {iconUrl ? (
        <img src={iconUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
      ) : label}
    </button>
  );
}
