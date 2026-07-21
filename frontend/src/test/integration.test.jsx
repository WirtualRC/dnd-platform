import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import LoginPage from '../pages/LoginPage';
import LibraryPage from '../pages/LibraryPage';
import CharacterSheetPage from '../pages/CharacterSheetPage';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { theme } from '../theme';

const uniq = Date.now();

function renderWithProviders(ui) {
  return render(<MantineProvider theme={theme}>{ui}</MantineProvider>);
}

describe('реальный сквозной поток против настоящего Flask-бэкенда', () => {
  it('регистрация через LoginPage реально создаёт пользователя и логинит', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>ГЛАВНАЯ СТРАНИЦА</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('Регистрация'));
    await user.type(screen.getByPlaceholderText('имя пользователя'), `reactuser${uniq}`);
    await user.type(screen.getByPlaceholderText('email'), `reactuser${uniq}@t.com`);
    await user.type(screen.getByPlaceholderText('пароль'), 'password123');
    await user.click(screen.getByText('Создать аккаунт'));

    await waitFor(() => expect(screen.getByText('ГЛАВНАЯ СТРАНИЦА')).toBeInTheDocument());
    expect(useAuthStore.getState().user?.username).toBe(`reactuser${uniq}`);
  });

  it('LibraryPage реально создаёт персонажа через настоящий POST /characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><LibraryPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByPlaceholderText('имя нового персонажа')).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText('имя нового персонажа'), 'Тестовый Мэлин');
    await user.click(screen.getByText('+ Создать'));

    await waitFor(() => expect(useCharacterStore.getState().characters.some(c => c.name === 'Тестовый Мэлин')).toBe(true));
  });

  it('CharacterSheetPage: правка score реально пересчитывает модификатор и сохраняется на сервере', async () => {
    const user = userEvent.setup();
    const charId = useCharacterStore.getState().characters.find(c => c.name === 'Тестовый Мэлин').id;

    renderWithProviders(
      <MemoryRouter initialEntries={[`/characters/${charId}`]}>
        <Routes>
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByDisplayValue('Тестовый Мэлин')).toBeInTheDocument());

    // сила по умолчанию 10 -> модификатор +0
    expect(screen.getAllByText('+0').length).toBeGreaterThan(0);

    // клик по названию характеристики открывает модалку — само значение
    // теперь редактируется там, а не прямо на компактной карточке
    await user.click(screen.getByRole('button', { name: 'открыть Сила' }));
    const scoreInput = await screen.findByLabelText('Значение');

    fireEvent.change(scoreInput, { target: { value: '18' } }); // str = 18 -> mod +4

    await waitFor(() => {
      expect(document.body.textContent).toContain('+4');
    });

    // ждём дебаунс-автосейв (800мс) и реально запрашиваем сервер напрямую,
    // а не полагаемся на локальный стор — так проверяется, что PUT реально дошёл
    await new Promise((r) => setTimeout(r, 1200));
    const resp = await fetch(`http://127.0.0.1:5000/api/v1/characters/${charId}`, { credentials: 'include' });
    const data = await resp.json();
    expect(data.sheet_data.stats.str.score).toBe(18);

    // закрываем модалку "Сила" явным кликом по кнопке — Escape в этом
    // тестовом окружении не долетал до Mantine Modal надёжно
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    // модалка Mantine закрывается с анимацией перехода — дожидаемся,
    // чтобы её оверлей реально пропал из DOM и не перехватывал клики
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument());

    // новый паттерн в шапке: клик по тексту КД открывает модалку,
    // правка внутри неё тоже должна дойти до сервера
    await user.click(screen.getByRole('button', { name: 'открыть КД' }));
    // не getByLabelText: у модалки aria-labelledby указывает на её же
    // заголовок "КД", из-за чего getByLabelText находит и заголовок, и
    // инпут как "одинаково подходящие" — берём инпут явным CSS-селектором
    const acInput = await waitFor(() => {
      const el = document.querySelector('input[aria-label="КД"]');
      if (!el) throw new Error('инпут КД ещё не отрисован');
      return el;
    });
    fireEvent.change(acInput, { target: { value: '17' } });

    await waitFor(() => {
      expect(screen.getByText('17')).toBeInTheDocument();
    });

    await new Promise((r) => setTimeout(r, 1200));
    const resp2 = await fetch(`http://127.0.0.1:5000/api/v1/characters/${charId}`, { credentials: 'include' });
    const data2 = await resp2.json();
    expect(data2.sheet_data.vitality.ac).toBe(17);
  }, 10000);

  it('предмет с автобонусом реально прибавляется к проверке характеристики', async () => {
    const user = userEvent.setup();
    const charId = useCharacterStore.getState().characters.find(c => c.name === 'Тестовый Мэлин').id;

    renderWithProviders(
      <MemoryRouter initialEntries={[`/characters/${charId}`]}>
        <Routes>
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByDisplayValue('Тестовый Мэлин')).toBeInTheDocument());

    // ловкость по умолчанию 10 -> модификатор +0 (до всякого бонуса от предмета)
    // сужаем именно до строки "Проверка" — в блоке ещё есть "Спасбросок",
    // у которого тоже +0 по умолчанию, общий поиск по блоку неоднозначен
    const dexButton = screen.getByRole('button', { name: 'открыть Ловкость' });
    const dexBlock = dexButton.closest('[class*="Paper"]');
    const dexCheckRow = within(dexBlock).getByText('Проверка').closest('[class*="Group"]');
    expect(within(dexCheckRow).getByText('+0')).toBeInTheDocument();

    await user.click(screen.getByText('Снаряжение'));
    await user.click(await screen.findByText('+ Добавить предмет'));

    const nameInput = await screen.findByLabelText('Название');
    await user.type(nameInput, 'Кольцо ловкости');

    // Mantine Select — не нативный <select>, открываем клипом и выбираем опцию.
    // role тут "combobox" (не "textbox"), и getByLabelText неоднозначен по
    // той же причине, что и с модалкой "КД" раньше: выпадающий список тоже
    // получает aria-labelledby на ту же подпись поля
    await user.click(screen.getByRole('combobox', { name: 'Цель бонуса' }));
    await user.click(await screen.findByText('Проверка: Ловкость'));

    const valueInput = await screen.findByLabelText('Значение');
    fireEvent.change(valueInput, { target: { value: '2' } });

    await user.click(screen.getByText('Сохранить'));

    // возвращаться на "Общее" больше не нужно — характеристики теперь
    // всегда видны в левой колонке, а не под отдельной вкладкой
    await waitFor(() => {
      const block = screen.getByRole('button', { name: 'открыть Ловкость' }).closest('[class*="Paper"]');
      const checkRow = within(block).getByText('Проверка').closest('[class*="Group"]');
      expect(within(checkRow).getByText('+2')).toBeInTheDocument();
    });

    // и это реально дошло до сервера как отдельный item, а не только в UI
    await new Promise((r) => setTimeout(r, 1200));
    const resp = await fetch(`http://127.0.0.1:5000/api/v1/characters/${charId}`, { credentials: 'include' });
    const data = await resp.json();
    expect(data.sheet_data.items).toHaveLength(1);
    expect(data.sheet_data.items[0]).toMatchObject({
      name: 'Кольцо ловкости',
      equipped: true,
      modifier: { target: 'ability_check:dex', type: 'bonus', value: 2 },
    });
  }, 10000);

  it('атака: модификатор и урон считаются живьём из характеристики, а не хранятся в строке', async () => {
    const user = userEvent.setup();
    const charId = useCharacterStore.getState().characters.find(c => c.name === 'Тестовый Мэлин').id;

    renderWithProviders(
      <MemoryRouter initialEntries={[`/characters/${charId}`]}>
        <Routes>
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByDisplayValue('Тестовый Мэлин')).toBeInTheDocument());

    await user.click(screen.getByText('Атаки'));
    await user.click(await screen.findByText('+ Добавить атаку'));

    const nameInput = await screen.findByLabelText('Название');
    await user.type(nameInput, 'Удар мечом');

    const damageInput = screen.getByLabelText('Кости урона');
    fireEvent.change(damageInput, { target: { value: '2d6' } });

    // характеристика по умолчанию уже "Сила" (str=18 после предыдущего теста -> мод +4),
    // владение по умолчанию включено -> бонус мастерства +2 (дефолт) = атака +6
    await user.click(screen.getByText('Сохранить'));

    await waitFor(() => {
      const row = screen.getByText('Удар мечом').closest('[class*="Group"]');
      expect(within(row).getByText('+6')).toBeInTheDocument(); // атака: мод +4 + мастерство +2
      expect(within(row).getByText('2d6+4')).toBeInTheDocument(); // урон: кости + мод +4 (без мастерства)
    });

    await new Promise((r) => setTimeout(r, 1200));
    const resp = await fetch(`http://127.0.0.1:5000/api/v1/characters/${charId}`, { credentials: 'include' });
    const data = await resp.json();
    expect(data.sheet_data.attacks).toHaveLength(1);
    // в самих данных урон хранится ЧИСТЫМИ костями, без запечённого модификатора
    expect(data.sheet_data.attacks[0].damage).toBe('2d6');
  }, 10000);

  it('заклинания: настройка заклинательной характеристики меняет СЛ спасброска и атаку заклинанием', async () => {
    const user = userEvent.setup();
    const charId = useCharacterStore.getState().characters.find(c => c.name === 'Тестовый Мэлин').id;

    renderWithProviders(
      <MemoryRouter initialEntries={[`/characters/${charId}`]}>
        <Routes>
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByDisplayValue('Тестовый Мэлин')).toBeInTheDocument());
    await user.click(screen.getByText('Заклинания'));

    // до настройки характеристики — прочерк/база без бонуса характеристики
    await user.click(await screen.findByText('Настройка заклинаний'));
    await user.click(await screen.findByRole('combobox', { name: 'Заклинательная характеристика' }));
    // клик по опции ненадёжен: popover-список позиционируется через
    // floating-ui, которому в jsdom не на что опереться (нет реальной
    // раскладки), и он застревает на display:none. Сила идёт первой в
    // списке характеристик — выбираем клавиатурой, это не зависит от
    // фактического позиционирования всплывающего меню.
    await user.keyboard('{ArrowDown}{Enter}');

    await user.click(screen.getByText('Сохранить'));

    // СЛ = 8 + мастерство(2) + мод(4) = 14; атака = 2+4 = +6
    await waitFor(() => {
      expect(screen.getByText('14')).toBeInTheDocument();
    });

    await new Promise((r) => setTimeout(r, 1200));
    const resp = await fetch(`http://127.0.0.1:5000/api/v1/characters/${charId}`, { credentials: 'include' });
    const data = await resp.json();
    expect(data.sheet_data.spellcasting.ability).toBe('str');
  }, 10000);

  it('область поражения: переключение формы на конус меняет набор полей и сохраняет нужную структуру', async () => {
    const user = userEvent.setup();
    const charId = useCharacterStore.getState().characters.find(c => c.name === 'Тестовый Мэлин').id;

    renderWithProviders(
      <MemoryRouter initialEntries={[`/characters/${charId}`]}>
        <Routes>
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByDisplayValue('Тестовый Мэлин')).toBeInTheDocument());
    await user.click(screen.getByText('Заклинания'));
    await user.click(await screen.findByText('+ Добавить заклинание'));

    await user.type(await screen.findByLabelText('Название'), 'Огненный конус');

    await user.click(screen.getByRole('combobox', { name: 'Форма области' }));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}'); // без области -> круг -> квадрат -> прямоугольник -> конус

    // после выбора "конус" должно появиться единственное поле "Длина, фт"
    // (не радиус, не сторона, не пара длина+ширина от других форм)
    const lengthInput = await screen.findByLabelText('Длина, фт');
    fireEvent.change(lengthInput, { target: { value: '30' } });
    expect(screen.queryByLabelText('Радиус, фт')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ширина, фт')).not.toBeInTheDocument();

    await user.click(screen.getByText('Сохранить'));

    await new Promise((r) => setTimeout(r, 1200));
    const resp2 = await fetch(`http://127.0.0.1:5000/api/v1/characters/${charId}`, { credentials: 'include' });
    const data2 = await resp2.json();
    const spell = data2.sheet_data.spells.find((s) => s.name === 'Огненный конус');
    expect(spell.aoe).toEqual({ shape: 'cone', length: 30 });
  }, 10000);

  it('вдохновение циклится по клику, состояния добавляются тегами — и то и другое реально сохраняется', async () => {
    const user = userEvent.setup();
    const charId = useCharacterStore.getState().characters.find(c => c.name === 'Тестовый Мэлин').id;

    renderWithProviders(
      <MemoryRouter initialEntries={[`/characters/${charId}`]}>
        <Routes>
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByDisplayValue('Тестовый Мэлин')).toBeInTheDocument());

    const inspirationButton = screen.getByRole('button', { name: 'вдохновение: 0' });
    await user.click(inspirationButton); // -> 1
    expect(screen.getByRole('button', { name: 'вдохновение: 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'открыть состояния' }));
    const tagsInput = await screen.findByRole('combobox', { name: 'Активные состояния' });
    await user.type(tagsInput, 'Невидим{Enter}');
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await waitFor(() => {
      const conditionsBox = screen.getByRole('button', { name: 'открыть состояния' });
      expect(within(conditionsBox).getByText('Невидим')).toBeInTheDocument();
    });

    await new Promise((r) => setTimeout(r, 1200));
    const resp = await fetch(`http://127.0.0.1:5000/api/v1/characters/${charId}`, { credentials: 'include' });
    const data = await resp.json();
    expect(data.sheet_data.inspiration).toBe(1);
    expect(data.sheet_data.conditions).toEqual(['Невидим']);
  }, 10000);
});
