import { useState } from 'react';
import { useRoomStore } from '../../store/useRoomStore';
import { useDocumentPip } from '../../hooks/useDocumentPip';
import DiceLog from './DiceLog';

export default function DiceRoller({ myCharacterId }) {
  const [formula, setFormula] = useState('1d20');
  const rollDice = useRoomStore((s) => s.rollDice);
  const pip = useDocumentPip();

  function handleRoll(e) {
    e.preventDefault();
    if (!formula.trim()) return;
    rollDice(formula.trim(), myCharacterId);
  }

  // в открепленное окно уходит ТОЛЬКО лог — форма и кнопка броска
  // остаются на странице, так и договаривались
  function handleDetach() {
    pip.open(<DiceLog maxHeight="100%" />, { width: 300, height: 380, title: 'Броски кубиков', themeClass: 'theme-slate' });
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'center' }}>
        <form onSubmit={handleRoll} className="row" style={{ flex: 1, margin: 0 }}>
          <input value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="например 2d6+3" />
          <button type="submit">Бросить</button>
        </form>
        {pip.isSupported && (
          <button
            className="ghost"
            title={pip.isOpen ? 'Лог открыт в отдельном окне' : 'Открепить лог в отдельное окошко поверх других окон'}
            onClick={pip.isOpen ? pip.close : handleDetach}
          >
            {pip.isOpen ? '📌 открепить обратно' : '⧉ открепить лог'}
          </button>
        )}
      </div>

      {pip.isOpen ? (
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 10 }}>Лог сейчас в отдельном окне.</p>
      ) : (
        <div style={{ marginTop: 10 }}>
          <DiceLog />
        </div>
      )}
    </div>
  );
}
