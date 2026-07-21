import { useState, useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

export function isDocumentPipSupported() {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

/**
 * Открепляет переданный React-элемент в отдельное always-on-top окно
 * (Document Picture-in-Picture). У окна СВОЙ document, поэтому стили
 * туда сами не попадают — копируем все текущие стили при открытии.
 * JS-контекст при этом общий с основной страницей (в отличие от
 * window.open()) — сторы/сокеты работают без дополнительной синхронизации.
 */
export function useDocumentPip() {
  const [isOpen, setIsOpen] = useState(false);
  const pipWindowRef = useRef(null);
  const rootRef = useRef(null);

  const open = useCallback(async (element, { width = 320, height = 420, title = '', themeClass = '' } = {}) => {
    if (!isDocumentPipSupported()) return false;

    const pipWindow = await window.documentPictureInPicture.requestWindow({ width, height });
    pipWindowRef.current = pipWindow;
    if (title) pipWindow.document.title = title;

    // копируем стили из основного документа — свои же <style>-теги можно
    // прочитать напрямую через cssRules, а внешние (cross-origin, если
    // вдруг когда-нибудь появятся) — просто клонируем как <link>
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssText = [...styleSheet.cssRules].map((rule) => rule.cssText).join('\n');
        const style = pipWindow.document.createElement('style');
        style.textContent = cssText;
        pipWindow.document.head.appendChild(style);
      } catch {
        if (styleSheet.href) {
          const link = pipWindow.document.createElement('link');
          link.rel = 'stylesheet';
          link.href = styleSheet.href;
          pipWindow.document.head.appendChild(link);
        }
      }
    });

    pipWindow.document.body.style.margin = '0';
    pipWindow.document.body.style.background = 'var(--bg)';

    const container = pipWindow.document.createElement('div');
    container.className = themeClass;
    container.style.padding = '10px';
    container.style.height = '100%';
    container.style.boxSizing = 'border-box';
    pipWindow.document.body.appendChild(container);

    const root = createRoot(container);
    root.render(element);
    rootRef.current = root;
    setIsOpen(true);

    pipWindow.addEventListener('pagehide', () => {
      rootRef.current?.unmount();
      rootRef.current = null;
      pipWindowRef.current = null;
      setIsOpen(false);
    }, { once: true });

    return true;
  }, []);

  const close = useCallback(() => {
    pipWindowRef.current?.close();
  }, []);

  // если компонент, вызвавший хук, размонтируется первым — закрываем
  // окно вместе с ним, не оставляя осиротевший React-root
  useEffect(() => () => { pipWindowRef.current?.close(); }, []);

  return { isSupported: isDocumentPipSupported(), isOpen, open, close };
}
