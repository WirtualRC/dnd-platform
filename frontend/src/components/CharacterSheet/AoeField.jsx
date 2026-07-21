import { Select, NumberInput, Group } from '@mantine/core';

const NO_AOE = '__none__';

const SHAPE_OPTIONS = [
  { value: NO_AOE, label: 'Без области' },
  { value: 'circle', label: 'Круг' },
  { value: 'square', label: 'Квадрат' },
  { value: 'rect', label: 'Прямоугольник' },
  { value: 'cone', label: 'Конус' },
];

// Дефолты при переключении формы — чтобы после выбора сразу было что
// редактировать, а не пустые поля
function defaultsFor(shape, prevAoe) {
  if (shape === 'circle') return { shape, radius: prevAoe?.radius ?? 10 };
  if (shape === 'square') return { shape, size: prevAoe?.size ?? 10 };
  if (shape === 'rect') return { shape, length: prevAoe?.length ?? 10, width: prevAoe?.width ?? 5 };
  if (shape === 'cone') return { shape, length: prevAoe?.length ?? 15 };
  return null;
}

export default function AoeField({ aoe, onChange }) {
  const shape = aoe?.shape || NO_AOE;

  function setShape(value) {
    onChange(value === NO_AOE ? null : defaultsFor(value, aoe));
  }
  function setField(field, value) {
    onChange({ ...aoe, [field]: typeof value === 'number' ? value : 0 });
  }

  return (
    <>
      <Select label="Форма области" data={SHAPE_OPTIONS} value={shape} onChange={setShape} />

      {shape === 'circle' && (
        <NumberInput label="Радиус, фт" value={aoe.radius ?? ''} onChange={(v) => setField('radius', v)} />
      )}
      {shape === 'square' && (
        <NumberInput label="Сторона, фт" value={aoe.size ?? ''} onChange={(v) => setField('size', v)} />
      )}
      {shape === 'rect' && (
        <Group grow>
          <NumberInput label="Длина, фт" value={aoe.length ?? ''} onChange={(v) => setField('length', v)} />
          <NumberInput label="Ширина, фт" value={aoe.width ?? ''} onChange={(v) => setField('width', v)} />
        </Group>
      )}
      {shape === 'cone' && (
        <NumberInput label="Длина, фт" value={aoe.length ?? ''} onChange={(v) => setField('length', v)} />
      )}
    </>
  );
}
