import { create } from 'zustand';

type MenuUiState = {
  searchText: string;
  setSearchText: (v: string) => void;
  clearSearch: () => void;
};

export const useMenuUi = create<MenuUiState>((set) => ({
  searchText: '',
  setSearchText: (v) => set({ searchText: v }),
  clearSearch: () => set({ searchText: '' }),
}));
