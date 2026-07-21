import { Circle, Rect, Wedge } from 'react-konva';
import { toPx } from '../../utils/scale';

export function RangeRing({ casterX, casterY, rangeFeet, gridSize, stroke = '#a89e8c' }) {
  if (casterX == null || casterY == null || !rangeFeet) return null;
  return (
    <Circle
      x={casterX} y={casterY} radius={toPx(rangeFeet, gridSize)}
      stroke={stroke} strokeWidth={1} dash={[4, 6]} listening={false}
    />
  );
}

/**
 * Круг/квадрат центрированы на курсоре. Прямоугольник/конус (линия/веер)
 * исходят от кастующего в сторону курсора — это не то же самое позиционирование,
 * и подменять одно другим нельзя: у прямоугольника/конуса длина считается
 * от источника, а не от центра фигуры.
 */
export default function AoeShape({ aoe, casterX, casterY, targetX, targetY, gridSize, fill, stroke }) {
  const commonStyle = { fill, stroke, strokeWidth: 1.5, dash: [6, 4], listening: false };

  if (!aoe) {
    return <Circle x={targetX} y={targetY} radius={5} fill={stroke} listening={false} />;
  }

  if (aoe.shape === 'circle') {
    return <Circle x={targetX} y={targetY} radius={toPx(aoe.radius, gridSize)} {...commonStyle} />;
  }

  if (aoe.shape === 'square') {
    const side = toPx(aoe.size, gridSize);
    return <Rect x={targetX - side / 2} y={targetY - side / 2} width={side} height={side} {...commonStyle} />;
  }

  const hasOrigin = casterX != null && casterY != null;
  const originX = hasOrigin ? casterX : targetX;
  const originY = hasOrigin ? casterY : targetY;
  const angleDeg = (Math.atan2(targetY - originY, targetX - originX) * 180) / Math.PI;

  if (aoe.shape === 'rect') {
    const length = toPx(aoe.length, gridSize);
    const width = toPx(aoe.width, gridSize);
    return (
      <Rect x={originX} y={originY} width={length} height={width} offsetY={width / 2} rotation={angleDeg} {...commonStyle} />
    );
  }

  if (aoe.shape === 'cone') {
    const length = toPx(aoe.length, gridSize);
    // 53° — стандартное игровое приближение конуса в 5e, симметрично
    // относительно направления на курсор
    return (
      <Wedge x={originX} y={originY} radius={length} angle={53} rotation={angleDeg - 26.5} {...commonStyle} />
    );
  }

  return null;
}
