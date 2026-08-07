import { notifications } from '@mantine/notifications';
import { rollDiceFormula, InvalidDiceFormula } from './dice';
import { useRoomStore } from '../store/useRoomStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { pushPendingRollLabel } from './pendingRollLabels';
import { pushPendingRollEffect } from './pendingRollEffects';
import { wrapCritLabel } from './critLabel';

export function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function broadcastContext() {
  const { current, broadcastCharacterId } = useRoomStore.getState();
  return current && broadcastCharacterId ? { room: current, characterId: broadcastCharacterId } : null;
}

// Уведомление Discord-пресетов для ЛОКАЛЬНОГО броска (без трансляции в
// комнату — см. broadcastContext) — этот путь не идёт через сокет вовсе,
// поэтому серверный dispatch_roll_webhooks в handle_dice_roll его не
// увидит. Отправляем результат отдельным REST-запросом, независимо от
// того, открыт ли сейчас персонаж в какой-то комнате: Discord-уведомления
// не должны зависеть от факта трансляции. Fire-and-forget — ошибка сети
// тут не должна мешать обычному локальному броску/тосту.
function notifyLocalRollWebhooks(label, formula, result, breakdown, natural) {
  const characterId = useCharacterStore.getState().current?.id;
  if (!characterId) return;
  api.post(`/characters/${characterId}/roll-presets/notify`, { label, formula, result, breakdown, natural }).catch(() => {});
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
    const payload = { room_id: ctx.room.id, character_id: ctx.characterId, label };
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
  let roll, detail, rollTypeLabel = null;
  if (advantage && !disadvantage) {
    const r1 = rollD20(), r2 = rollD20();
    roll = Math.max(r1, r2);
    detail = `d20 (${r1}, ${r2} — преимущество)`;
    rollTypeLabel = 'преимущество';
  } else if (disadvantage && !advantage) {
    const r1 = rollD20(), r2 = rollD20();
    roll = Math.min(r1, r2);
    detail = `d20 (${r1}, ${r2} — помеха)`;
    rollTypeLabel = 'помеха';
  } else {
    roll = rollD20();
    detail = `d20 (${roll})`;
  }

  const total = roll + bonus;
  const sign = bonus >= 0 ? '+' : '';
  notifications.show({
    title: wrapCritLabel(label, total, roll),
    message: `${detail} ${sign}${bonus} = ${total}`,
    color: roll === 20 ? 'green' : roll === 1 ? 'red' : 'lssBlue',
    autoClose: 4000,
  });
  // тост выше нарочно показывает оба d20 при преимуществе/помехе (см. detail) —
  // полезный контекст в игре. Но для Discord нужна breakdown-строка в
  // квадратных скобках с ТОЛЬКО выбранным значением (см. _build_roll_lines
  // на бэкенде — сумма должна сходиться с total), поэтому здесь отдельная
  // версия, а "преимущество"/"помеха" переносим в подпись, а не в разбивку
  const bonusSign = bonus >= 0 ? '+' : '-';
  const discordBreakdown = `d20[${roll}]${bonus !== 0 ? ` ${bonusSign} ${Math.abs(bonus)}` : ''}`;
  const discordLabel = rollTypeLabel ? `${label} (${rollTypeLabel})` : label;
  notifyLocalRollWebhooks(discordLabel, `1d20${sign}${bonus}`, total, discordBreakdown, roll);
}

// Бросок за персонажа в конкретной комнате, без оглядки на
// useRoomStore.broadcastCharacterId — используется мини-карточкой отряда
// на боевой карте, где кликнуть можно на любого контролируемого
// персонажа, а не только на того, чей лист сейчас открыт на вкладке.
// Бросок всегда решает сервер (см. комментарий в rollAndNotify).
// label — для тоста и лога (с именем персонажа, т.к. в ростере брoсает
// GM/игрок за разных персонажей вперемешку); discordLabel — то, что уйдёт
// в Discord-эмбед (по умолчанию совпадает с label), где имя персонажа уже
// показано отдельно как заголовок эмбеда (см. send_discord_roll) и
// повторять его в тексте брoска не нужно.
export function rollAbilityCheckInRoom(roomId, characterId, label, bonus, opts = {}, discordLabel = label) {
  pushPendingRollLabel(label);
  const payload = { room_id: roomId, character_id: characterId, label: discordLabel };
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
    getSocket().emit('dice_roll', { room_id: ctx.room.id, character_id: ctx.characterId, formula, label });
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
    notifyLocalRollWebhooks(label, formula, total, breakdown);
  } catch (e) {
    if (e instanceof InvalidDiceFormula) {
      notifications.show({ title: 'Некорректная формула урона', message: e.message, color: 'red' });
    } else {
      throw e;
    }
  }
}

// Бросок формулы, результат которой применяет побочный эффект (например,
// лечение зельем) вместо простого тоста — тот же выбор локально/на сервере,
// что и в rollFormulaAndNotify, но результат отдаётся вызывающему через
// onResult(total, breakdown), а не печатается сразу. В контексте вещания
// onResult вызывается позже, из useRoomStore, когда придёт подтверждение —
// эффект (лечение) обязан ждать сервер по той же причине, что и сам бросок.
export function rollFormulaForEffect(formula, onResult, onError) {
  const ctx = broadcastContext();
  if (ctx) {
    pushPendingRollEffect(onResult);
    getSocket().emit('dice_roll', { room_id: ctx.room.id, character_id: ctx.characterId, formula });
    return;
  }

  try {
    const { total, breakdown } = rollDiceFormula(formula);
    onResult(total, breakdown);
  } catch (e) {
    if (e instanceof InvalidDiceFormula) {
      if (onError) onError(e);
      else notifications.show({ title: 'Некорректная формула', message: e.message, color: 'red' });
    } else {
      throw e;
    }
  }
}
