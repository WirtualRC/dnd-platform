import { notifications } from '@mantine/notifications';
import { rollDiceFormula, InvalidDiceFormula } from './dice';
import { useRoomStore } from '../store/useRoomStore';
import { getSocket } from '../api/socket';
import { pushPendingRollLabel } from './pendingRollLabels';

export function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function broadcastContext() {
  const { current, broadcastCharacterId } = useRoomStore.getState();
  return current && broadcastCharacterId ? { room: current, characterId: broadcastCharacterId } : null;
}

// Пока лист персонажа живёт вне контекста комнаты, ролл локальный
// (мгновенный Math.random(), без похода на сервер). Но если персонаж сейчас
// активен в какой-то комнате (см. store/useRoomStore.broadcastCharacterId),
// бросок ОБЯЗАН решаться на сервере — иначе его можно подделать перед
// отправкой. Тост в этом случае НЕ считается заново локально (это было бы
// уже другое случайное число для того же клика) — он появится из
// сокет-подтверждения в useRoomStore, когда бэкенд подтвердит результат.
export function rollAndNotify(label, bonus, opts = {}) {
  const ctx = broadcastContext();
  if (ctx) {
    pushPendingRollLabel(label);
    const payload = { room_id: ctx.room.id, character_id: ctx.characterId };
    if (opts.advantage || opts.disadvantage) {
      payload.bonus = bonus;
      payload.advantage = !!opts.advantage;
      payload.disadvantage = !!opts.disadvantage;
    } else {
      payload.formula = `1d20${bonus >= 0 ? '+' : ''}${bonus}`;
    }
    getSocket().emit('dice_roll', payload);
    return;
  }

  const { advantage, disadvantage } = opts;
  let roll, detail;
  if (advantage && !disadvantage) {
    const r1 = rollD20(), r2 = rollD20();
    roll = Math.max(r1, r2);
    detail = `d20 (${r1}, ${r2} — преимущество)`;
  } else if (disadvantage && !advantage) {
    const r1 = rollD20(), r2 = rollD20();
    roll = Math.min(r1, r2);
    detail = `d20 (${r1}, ${r2} — помеха)`;
  } else {
    roll = rollD20();
    detail = `d20 (${roll})`;
  }

  const total = roll + bonus;
  const sign = bonus >= 0 ? '+' : '';
  notifications.show({
    title: label,
    message: `${detail} ${sign}${bonus} = ${total}`,
    color: roll === 20 ? 'green' : roll === 1 ? 'red' : 'lssBlue',
    autoClose: 4000,
  });
}

// Бросок за персонажа в конкретной комнате, без оглядки на
// useRoomStore.broadcastCharacterId — используется мини-карточкой отряда
// на боевой карте, где кликнуть можно на любого контролируемого
// персонажа, а не только на того, чей лист сейчас открыт на вкладке.
// Бросок всегда решает сервер (см. комментарий в rollAndNotify).
export function rollAbilityCheckInRoom(roomId, characterId, label, bonus, opts = {}) {
  pushPendingRollLabel(label);
  const payload = { room_id: roomId, character_id: characterId };
  if (opts.advantage || opts.disadvantage) {
    payload.bonus = bonus;
    payload.advantage = !!opts.advantage;
    payload.disadvantage = !!opts.disadvantage;
  } else {
    payload.formula = `1d20${bonus >= 0 ? '+' : ''}${bonus}`;
  }
  getSocket().emit('dice_roll', payload);
}

// Бросок произвольной формулы урона (не d20) — та же логика: в контексте
// вещания формула улетает на сервер вместо локального счёта.
export function rollFormulaAndNotify(label, formula) {
  const ctx = broadcastContext();
  if (ctx) {
    pushPendingRollLabel(label);
    getSocket().emit('dice_roll', { room_id: ctx.room.id, character_id: ctx.characterId, formula });
    return;
  }

  try {
    const { total, breakdown } = rollDiceFormula(formula);
    notifications.show({
      title: label,
      message: `${breakdown} = ${total}`,
      color: 'lssBlue',
      autoClose: 4000,
    });
  } catch (e) {
    if (e instanceof InvalidDiceFormula) {
      notifications.show({ title: 'Некорректная формула урона', message: e.message, color: 'red' });
    } else {
      throw e;
    }
  }
}
