// Node/jsdom fetch НЕ хранит куки между вызовами автоматически, в отличие
// от настоящего браузера — без этого сессионная авторизация выглядела бы
// сломанной в тестах, хотя в реальном браузере всё работает штатно.
// Это чинит только тестовое окружение, никакого влияния на прод-код.
import '@testing-library/jest-dom/vitest';
import fetchCookie from 'fetch-cookie';

// сырой fetch без общей cookie-обёртки — для тестов, где нужен второй,
// независимый от React-рендера "пользователь" со своими куками (проверка
// мультиплеерных сценариев: что видит один браузер, когда действие
// совершил кто-то другой)
global.__rawFetch = global.fetch;
global.fetch = fetchCookie(global.fetch);

// jsdom не реализует matchMedia вообще — Mantine использует его для
// определения системной цветовой схемы (light/dark)
window.matchMedia = window.matchMedia || function (query) {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
};

// jsdom тоже не реализует ResizeObserver — на нём построена автоподстройка
// высоты (autosize) у Mantine Textarea
global.ResizeObserver = global.ResizeObserver || class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// и document.fonts (FontFaceSet) — autosize подписывается на загрузку
// шрифтов, чтобы пересчитать высоту, когда шрифт наконец загрузится
if (!document.fonts) {
  document.fonts = { addEventListener: () => {}, removeEventListener: () => {} };
}

// и scrollIntoView — Mantine Combobox прокручивает к активной опции
// списка, jsdom этот метод тоже не реализует
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
