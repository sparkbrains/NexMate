import { createContext } from 'react';

export const AppContext = createContext({
  theme: 'dark',
  setTheme: () => {},
  sidebarOpen: false,
  setSidebarOpen: () => {},
});
