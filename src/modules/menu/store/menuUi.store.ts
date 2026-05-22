import { create } from 'zustand';

type MenuUiState = {
  searchText: string;
  setSearchText: (v: string) => void;
  clearSearch: () => void;
  menuItemModalOpen: boolean;
  setMenuItemModalOpen: (open: boolean) => void;
};

export const useMenuUi = create<MenuUiState>((set) => ({
  searchText: '',
  setSearchText: (v) => set({ searchText: v }),
  clearSearch: () => set({ searchText: '' }),
  menuItemModalOpen: false,
  setMenuItemModalOpen: (open) => set({ menuItemModalOpen: open }),
}));
