import { useEffect, useState } from 'react';
import { api } from '../../api/client';

// Специально сырой просмотр (дамп sheet_data) — раньше в тестовом
// vanilla-JS харнессе для этого хватало alert(JSON.stringify(...)), тут
// чуть приличнее, но полноценный рендер листа для этого места избыточен:
// GM открывает его для быстрой сверки, не для редактирования.
export default function FullSheetModal({ roomId, characterId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/rooms/${roomId}/characters/${characterId}/full`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [characterId]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="card" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {error && <div className="error-banner">{error}</div>}
        {!data && !error && <p style={{ color: 'var(--text-secondary)' }}>Загрузка…</p>}
        {data && (
          <>
            <h3 style={{ marginTop: 0 }}>{data.name}</h3>
            <pre style={styles.pre}>{JSON.stringify(data.sheet_data, null, 2)}</pre>
          </>
        )}
        <button className="secondary" onClick={onClose} style={{ marginTop: 10 }}>Закрыть</button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: { width: 480, maxHeight: '80vh', overflowY: 'auto' },
  pre: {
    whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--surface-2)',
    padding: 10, borderRadius: 6, maxHeight: 400, overflowY: 'auto',
  },
};
