// Стандартные состояния D&D 5e — общий список для листа персонажа
// (ConditionsStat), панели токена на боевой карте (TokenActionPanel) и
// кружков-иконок над токеном (TokenNode). Оба первых места пишут в одно и
// то же поле sheet_data.conditions (список строк-label), поэтому набор
// подсказок должен быть единым источником истины.
// slug — латинское имя файла иконки под public/conditions/<slug>.webp,
// кириллица в имени файла ненадёжна.
const CONDITIONS = [
  { label: 'Ослеплён', slug: 'blinded' },
  { label: 'Очарован', slug: 'charmed' },
  { label: 'Оглушён', slug: 'deafened' },
  { label: 'Испуган', slug: 'frightened' },
  { label: 'Схвачен', slug: 'grappled' },
  { label: 'Недееспособен', slug: 'incapacitated' },
  { label: 'Невидим', slug: 'invisible' },
  { label: 'Парализован', slug: 'paralyzed' },
  { label: 'Окаменел', slug: 'petrified' },
  { label: 'Отравлен', slug: 'poisoned' },
  { label: 'Ничком', slug: 'prone' },
  { label: 'Обездвижен', slug: 'restrained' },
  { label: 'Ошеломлён', slug: 'stunned' },
  { label: 'Без сознания', slug: 'unconscious' },
];

export const STANDARD_CONDITIONS = CONDITIONS.map((c) => c.label);

const SLUG_BY_LABEL = Object.fromEntries(CONDITIONS.map((c) => [c.label, c.slug]));

export function conditionIconUrl(label) {
  const slug = SLUG_BY_LABEL[label];
  return slug ? `/conditions/${slug}.webp` : null;
}
