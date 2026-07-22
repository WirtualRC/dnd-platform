import { createTheme } from '@mantine/core';

// Синяя шкала построена вокруг реального --c-blue-6 LSS (#4776e6) —
// Mantine требует полную шкалу 0-9, а не один цвет.
export const theme = createTheme({
  primaryColor: 'lssBlue',
  colors: {
    lssBlue: ['#eef2fd', '#d7e0fa', '#b0c1f5', '#87a0ef', '#638ce9', '#4776e6', '#385ec0', '#2c4a99', '#4577d9', '#87a0ef'],
  },
  fontFamily: 'Open Sans, sans-serif',
  fontFamilyMonospace: 'PT Mono, monospace',
  defaultRadius: 'sm',
});
