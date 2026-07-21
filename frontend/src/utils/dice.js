// Порт уже протестированного backend/app/utils/dice.py — та же логика
// термов и те же защитные лимиты, только на JS для мгновенного броска
// урона в интерфейсе без похода на сервер.

const TERM = '(?:\\d*d\\d+|\\d+)';
const FULL_PATTERN = new RegExp(`^[+-]?${TERM}(?:[+-]${TERM})*$`);
const TERM_PATTERN = /([+-]?)(?:(\d*)d(\d+)|(\d+))/g;

const MAX_DICE_PER_TERM = 100;
const MAX_TOTAL_DICE = 100;
const MAX_TERMS = 20;
const ALLOWED_SIDES = new Set([2, 3, 4, 6, 8, 10, 12, 20, 100]);

export class InvalidDiceFormula extends Error {}

export function rollDiceFormula(formula) {
  if (!formula || formula.length > 200) throw new InvalidDiceFormula('Пустая или слишком длинная формула');

  const clean = formula.trim().replace(/\s+/g, '').toLowerCase();
  if (!FULL_PATTERN.test(clean)) throw new InvalidDiceFormula(`Некорректная формула: ${formula}`);

  const terms = [...clean.matchAll(TERM_PATTERN)];
  if (terms.length > MAX_TERMS) throw new InvalidDiceFormula(`Слишком много термов (максимум ${MAX_TERMS})`);

  let flatModifier = 0;
  let totalDice = 0;
  const diceRolls = []; // [{ sides, rolls: [...] }]

  for (const m of terms) {
    const [, signStr, countStr, sidesStr, flatStr] = m;
    const sign = signStr === '-' ? -1 : 1;

    if (flatStr !== undefined) {
      flatModifier += sign * Number(flatStr);
      continue;
    }

    const count = countStr ? Number(countStr) : 1;
    const sides = Number(sidesStr);

    if (count < 1 || count > MAX_DICE_PER_TERM) {
      throw new InvalidDiceFormula(`Количество костей в d${sides} должно быть от 1 до ${MAX_DICE_PER_TERM}`);
    }
    if (!ALLOWED_SIDES.has(sides)) throw new InvalidDiceFormula(`Неподдерживаемая кость: d${sides}`);

    totalDice += count;
    if (totalDice > MAX_TOTAL_DICE) throw new InvalidDiceFormula(`Суммарно нельзя кидать больше ${MAX_TOTAL_DICE} костей`);

    const rolls = Array.from({ length: count }, () => sign * (Math.floor(Math.random() * sides) + 1));
    diceRolls.push({ sides, rolls });
  }

  const total = diceRolls.reduce((sum, d) => sum + d.rolls.reduce((s, r) => s + r, 0), 0) + flatModifier;

  const breakdown = diceRolls
    .map(({ sides, rolls }) => {
      const sign = rolls[0] < 0 ? '-' : '+';
      return `${sign} d${sides}[${rolls.map((r) => Math.abs(r)).join(', ')}]`;
    })
    .concat(flatModifier ? [`${flatModifier >= 0 ? '+' : '-'} ${Math.abs(flatModifier)}`] : [])
    .join(' ')
    .replace(/^\+\s*/, '');

  return { formula: clean, total, breakdown };
}
