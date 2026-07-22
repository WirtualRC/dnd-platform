// Именованные слои токена — под капотом это то же числовое поле Token.layer
// на бэкенде (0 = фон), просто с человекочитаемыми названиями в UI. Порядок
// списка = порядок в выпадающем меню, а не порядок отрисовки — за отрисовку
// отвечает само значение value (см. сортировку токенов в MapCanvas).
export const TOKEN_LAYERS = [
  { value: 0, label: 'Карта' },
  { value: 5, label: 'Декорация' },
  { value: 10, label: 'Токен' },
  { value: 20, label: 'Эффект' },
];

export function tokenLayerLabel(value) {
  return TOKEN_LAYERS.find((l) => l.value === value)?.label || 'Токен';
}
