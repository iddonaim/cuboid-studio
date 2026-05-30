import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
}

interface ToastState {
  toasts: Toast[];
  showToast: (message: string, variant?: Toast['variant']) => void;
  dismissToast: (id: string) => void;
}

/**
 * Minimal toast store. Toasts auto-dismiss after 3s; the ToastContainer
 * renders whatever is in `toasts`.
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  showToast: (message, variant = 'success') => {
    const id = crypto.randomUUID();
    set(state => ({ toasts: [...state.toasts, { id, message, variant }] }));
    setTimeout(() => get().dismissToast(id), 3000);
  },
  dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));
