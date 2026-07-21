// 1 клетка сетки карты = 5 футов (стандарт D&D 5e)
export const FEET_PER_CELL = 5;

export function toPx(feet, gridSize) {
  return ((feet || 0) / FEET_PER_CELL) * gridSize;
}

export function toFeet(px, gridSize) {
  return gridSize ? ((px || 0) / gridSize) * FEET_PER_CELL : 0;
}
