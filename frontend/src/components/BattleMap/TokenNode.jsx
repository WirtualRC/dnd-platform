import { useState, useEffect } from 'react';
import { Group, Circle, Image as KonvaImage, Text } from 'react-konva';

// react-konva не даёт готового хука загрузки изображений (в отличие от
// пакета use-image) — пишем свой маленький, чтобы не тащить лишнюю
// зависимость ради одной функции
function useTokenImage(url) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!url) { setImage(null); return undefined; }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = url;
    return () => { img.onload = null; };
  }, [url]);
  return image;
}

export default function TokenNode({ token, canMove, shapeRef, onSelect, onDragMove, onDragEnd, onTransformEnd }) {
  const image = useTokenImage(token.image_url);
  const color = token.is_instance ? '#b5453a' : '#c9822f';
  const w = token.width || 50;
  const h = token.height || 50;

  return (
    <Group
      ref={shapeRef}
      x={token.pos_x}
      y={token.pos_y}
      rotation={token.rotation || 0}
      draggable={canMove}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(e) => onDragMove(token.id, e.target.x(), e.target.y())}
      onDragEnd={(e) => onDragEnd(token.id, e.target.x(), e.target.y())}
      onTransformEnd={(e) => onTransformEnd(token.id, e.target)}
    >
      {image ? (
        <KonvaImage image={image} x={-w / 2} y={-h / 2} width={w} height={h} />
      ) : (
        <Circle radius={w / 2} fill={color} stroke="#1b1f27" strokeWidth={2} />
      )}
      {token.label && (
        <Text text={token.label} y={h / 2 + 4} width={w} offsetX={w / 2} align="center" fontSize={12} fill="#e7e9ee" />
      )}
    </Group>
  );
}
