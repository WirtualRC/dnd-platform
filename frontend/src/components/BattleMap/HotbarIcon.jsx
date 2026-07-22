import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const HOVER_DELAY = 350; // мс — небольшая задержка перед показом, чтобы подсказка не мелькала при быстром движении мыши по хотбару

export default function HotbarIcon({ label, iconUrl, active, disabled, onClick, tooltip }) {
  const [coords, setCoords] = useState(null); // null — подсказка скрыта
  const timerRef = useRef(null);
  const btnRef = useRef(null);

  // Хотбар обрезает своё содержимое по горизонтали (overflowX: 'auto'), и
  // из-за этого браузер обрезает его и по вертикали тоже — обычный
  // position:absolute внутри бара оказывался невидим. Портал в body с
  // fixed-координатами от getBoundingClientRect обходит эту обрезку.
  function handleEnter() {
    timerRef.current = setTimeout(() => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setCoords({ left: rect.left + rect.width / 2, top: rect.top });
    }, HOVER_DELAY);
  }
  function handleLeave() {
    clearTimeout(timerRef.current);
    setCoords(null);
  }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        ref={btnRef}
        onClick={onClick}
        disabled={disabled}
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

      {coords && tooltip && createPortal(<TooltipCard tooltip={tooltip} coords={coords} />, document.body)}
    </div>
  );
}

function TooltipCard({ tooltip, coords }) {
  const { title, subtitle, meta, rollLabel, rollValue, damage, desc } = tooltip;
  return (
    <div
      className="theme-slate"
      style={{
        position: 'fixed', left: coords.left, top: coords.top, transform: 'translate(-50%, calc(-100% - 8px))',
        width: 240, padding: '10px 12px', borderRadius: 10, zIndex: 1000, pointerEvents: 'none',
        background: 'var(--surface-1)', border: '1px solid var(--border-strong)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)', textAlign: 'left',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{title || 'Без названия'}</div>
      {subtitle && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{subtitle}</div>}

      {meta?.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>{meta.join(' • ')}</div>
      )}

      {(rollValue != null || damage) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {rollValue != null && (
            <span style={badgeStyle}>{rollLabel}: {rollValue}</span>
          )}
          {damage && (
            <span style={{ ...badgeStyle, color: 'var(--accent)' }}>{damage} урона</span>
          )}
        </div>
      )}

      {desc && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.35 }}>{desc}</div>
      )}
    </div>
  );
}

const badgeStyle = {
  fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)',
};
