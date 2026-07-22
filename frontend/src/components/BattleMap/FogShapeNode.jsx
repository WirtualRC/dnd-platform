import { Group, Rect, Circle, Line } from 'react-konva';

// Фигура тумана войны — по структуре повторяет TokenNode: Group несёт
// позицию/поворот/драг, а сама форма рисуется в локальных координатах
// (0,0)..(width,height) внутри неё. Это позволяет использовать общий с
// токенами паттерн onTransformEnd (масштаб читается с Group, а не с
// фигуры), не считая отдельную математику для круга/треугольника.
export default function FogShapeNode({ shape, isGm, editable, shapeRef, onSelect, onDragMove, onDragEnd, onTransformEnd }) {
  const w = shape.width;
  const h = shape.height;
  const style = isGm
    ? { fill: 'rgba(15,15,20,0.55)', stroke: '#6c7fd8', strokeWidth: editable ? 1 : 0 }
    : { fill: '#000000', stroke: undefined, strokeWidth: 0 };

  let inner;
  if (shape.shape_type === 'circle') {
    // scaleX/scaleY растягивают единичный круг в эллипс по рамке — Konva
    // по умолчанию масштабирует strokeWidth вместе с фигурой, из-за чего
    // тонкая обводка раздувалась бы до огромной толщины; strokeScaleEnabled
    // держит её в исходных пикселях независимо от масштаба
    inner = <Circle x={w / 2} y={h / 2} radius={1} scaleX={w / 2} scaleY={h / 2} strokeScaleEnabled={false} {...style} />;
  } else if (shape.shape_type === 'triangle') {
    inner = <Line points={[w / 2, 0, w, h, 0, h]} closed {...style} />;
  } else {
    inner = <Rect x={0} y={0} width={w} height={h} {...style} />;
  }

  return (
    <Group
      ref={shapeRef}
      x={shape.pos_x}
      y={shape.pos_y}
      rotation={shape.rotation || 0}
      draggable={editable}
      onClick={editable ? onSelect : undefined}
      onTap={editable ? onSelect : undefined}
      onDragMove={editable ? (e) => onDragMove(shape.id, e.target.x(), e.target.y()) : undefined}
      onDragEnd={editable ? (e) => onDragEnd(shape.id, e.target.x(), e.target.y()) : undefined}
      onTransformEnd={editable ? (e) => onTransformEnd(shape.id, e.target) : undefined}
    >
      {inner}
    </Group>
  );
}
