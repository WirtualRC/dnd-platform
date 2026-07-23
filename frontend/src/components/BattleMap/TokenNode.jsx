import { useState, useEffect, useMemo } from 'react';
import { Group, Circle, Rect, Image as KonvaImage, Text } from 'react-konva';
import { conditionIconUrl } from '../../utils/conditions';

const TOOLTIP_FONT = '13px sans-serif';
const TOOLTIP_PADDING_X = 8;
const TOOLTIP_HEIGHT = 24;

// canvas 2D измеряет текст синхронно и точно, в отличие от Konva.Label/Tag,
// чья автоширина зависит от внутреннего цикла отрисовки — из-за этого
// подпись не успевала пересчитать центр к моменту первого кадра и
// оказывалась смещена от иконки
let measureCanvas = null;
function measureTextWidth(text, font) {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

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

const BADGE_SIZE = 30;
const BADGE_GAP = 3;

// Один кружок-иконка состояния — если файла иконки нет (ещё не занесли в
// public/conditions/) или он не загрузился, откатываемся на первую букву
// названия, чтобы токен не терял значок совсем.
function ConditionBadge({ label, x }) {
  const image = useTokenImage(conditionIconUrl(label));
  const [hovered, setHovered] = useState(false);
  const r = BADGE_SIZE / 2;
  const tooltipWidth = useMemo(() => measureTextWidth(label, TOOLTIP_FONT) + TOOLTIP_PADDING_X * 2, [label]);

  function setCursor(stage, cursor) {
    if (stage) stage.container().style.cursor = cursor;
  }

  return (
    <Group
      x={x} y={0}
      onMouseEnter={(e) => { setHovered(true); setCursor(e.target.getStage(), 'pointer'); }}
      onMouseLeave={(e) => { setHovered(false); setCursor(e.target.getStage(), 'default'); }}
    >
      <Circle radius={r} fill="#1b1f27" stroke="#f6f7f9" strokeWidth={1} />
      {image ? (
        <KonvaImage
          image={image}
          x={-r + 1.5} y={-r + 1.5} width={BADGE_SIZE - 3} height={BADGE_SIZE - 3}
        />
      ) : (
        <Text
          text={label[0]}
          fontSize={10} fill="#f6f7f9" width={BADGE_SIZE} height={BADGE_SIZE}
          x={-r} y={-r} align="center" verticalAlign="middle"
        />
      )}
      {hovered && (
        <Group x={-tooltipWidth / 2} y={-r - 8 - TOOLTIP_HEIGHT} listening={false}>
          <Rect width={tooltipWidth} height={TOOLTIP_HEIGHT} fill="#1b1f27" stroke="#f6f7f9" strokeWidth={1} cornerRadius={4} />
          <Text
            text={label} fontSize={13} fill="#f6f7f9"
            width={tooltipWidth} height={TOOLTIP_HEIGHT} align="center" verticalAlign="middle"
          />
        </Group>
      )}
    </Group>
  );
}

export default function TokenNode({ token, canMove, shapeRef, onSelect, onDragMove, onDragEnd, onTransformEnd }) {
  const image = useTokenImage(token.image_url);
  const color = token.is_instance ? '#b5453a' : '#c9822f';
  const w = token.width || 50;
  const h = token.height || 50;
  const conditions = token.conditions || [];
  const rotation = token.rotation || 0;
  // бейджи должны стоять ровным рядком НАД токеном на экране, а не там,
  // куда их отнесло поворотом родительской Group (rotation вращает и
  // локальные x/y детей вокруг центра токена) — компенсируем вручную:
  // считаем офсет в повёрнутых координатах, и сами бейджи контр-поворачиваем
  const badgeOffset = h / 2 + BADGE_SIZE / 2 + 4;
  const rad = (rotation * Math.PI) / 180;
  const badgeGroupX = badgeOffset * Math.sin(rad);
  const badgeGroupY = -badgeOffset * Math.cos(rad);

  return (
    <Group
      ref={shapeRef}
      x={token.pos_x}
      y={token.pos_y}
      rotation={rotation}
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
      {conditions.length > 0 && (
        <Group x={badgeGroupX} y={badgeGroupY} rotation={-rotation}>
          {conditions.map((label, i) => (
            <ConditionBadge
              key={label}
              label={label}
              x={(i - (conditions.length - 1) / 2) * (BADGE_SIZE + BADGE_GAP)}
            />
          ))}
        </Group>
      )}
    </Group>
  );
}
