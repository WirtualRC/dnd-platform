// Тот же приём, что и pendingRollLabels.js: сокет-подтверждение "мой бросок
// долетел" не несёт ничего, кроме formula/result/breakdown, поэтому эффект,
// который нужно применить по результату (например, вылечить персонажа на
// выпавшее число), сопоставляется по порядку отправки. Отдельная очередь от
// pendingRollLabels — эффект и человекочитаемый лейбл нужны не всегда вместе.
const pending = [];

export function pushPendingRollEffect(onResult) {
  pending.push(onResult);
}

export function shiftPendingRollEffect() {
  return pending.length > 0 ? pending.shift() : null;
}
