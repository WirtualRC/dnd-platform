import { UnstyledButton, Tooltip } from '@mantine/core';

const STATES_WITH_EXPERTISE = ['none', 'prof', 'expertise'];
const STATES_PROF_ONLY = ['none', 'prof'];

const TITLES = { none: 'нет владения', prof: 'владение', expertise: 'экспертиза (×2 мастерства)' };

/**
 * Клик циклит: нет владения -> владение -> (для навыков) экспертиза -> нет владения.
 * Спасброски используют allowExpertise=false — экспертиза на спасбросках не
 * базовая механика 5e, договорились не переносить её туда.
 */
export default function Checkdot({ prof, expertity, allowExpertise = true, onChange, label }) {
  const states = allowExpertise ? STATES_WITH_EXPERTISE : STATES_PROF_ONLY;
  const current = expertity ? 'expertise' : prof ? 'prof' : 'none';

  function handleClick() {
    const idx = states.indexOf(current);
    const next = states[(idx + 1) % states.length];
    onChange({ prof: next === 'prof' || next === 'expertise', expertity: next === 'expertise' });
  }

  return (
    <Tooltip label={`${label ? label + ' — ' : ''}${TITLES[current]}`} openDelay={300}>
      <UnstyledButton
        onClick={handleClick}
        aria-label={`владение: ${label || ''} (${TITLES[current]})`}
        style={dotStyle(current)}
      />
    </Tooltip>
  );
}

function dotStyle(state) {
  const base = {
    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
    border: '1.5px solid var(--border-strong)', boxSizing: 'border-box',
  };
  if (state === 'none') return { ...base, background: 'transparent' };
  if (state === 'prof') return { ...base, background: 'var(--accent)', borderColor: 'var(--accent)' };
  // экспертиза — та же заполненная точка, но с дополнительным кольцом вокруг
  return {
    ...base, background: 'var(--accent)', borderColor: 'var(--accent)',
    boxShadow: '0 0 0 2px var(--bg), 0 0 0 3.5px var(--accent)',
  };
}
