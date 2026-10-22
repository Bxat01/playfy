import { reactive } from 'vue';

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/**
 * Tiny shared state for the right-click menu. One instance is rendered once in
 * MainLayout; any view opens it by calling `openContextMenu` with its items and
 * a callback that receives the chosen item's key.
 */
export const contextMenu = reactive<ContextMenuState>({
  open: false,
  x: 0,
  y: 0,
  items: [],
});

const MENU_WIDTH = 208;
const ITEM_HEIGHT = 32;
const EDGE_PAD = 10;

let handler: ((key: string) => void) | null = null;

export function openContextMenu(
  event: MouseEvent,
  items: ContextMenuItem[],
  onSelect: (key: string) => void,
) {
  event.preventDefault();
  event.stopPropagation();

  contextMenu.items = items;
  contextMenu.x = Math.max(
    EDGE_PAD,
    Math.min(event.clientX, window.innerWidth - MENU_WIDTH - EDGE_PAD),
  );
  contextMenu.y = Math.max(
    EDGE_PAD,
    Math.min(event.clientY, window.innerHeight - items.length * ITEM_HEIGHT - EDGE_PAD),
  );
  contextMenu.open = true;
  handler = onSelect;
}

export function closeContextMenu() {
  contextMenu.open = false;
  handler = null;
}

export function selectContextItem(key: string) {
  const callback = handler;
  closeContextMenu();
  callback?.(key);
}
