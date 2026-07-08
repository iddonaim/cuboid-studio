import { create } from 'zustand';
import type { TranslationRecordView } from '../lib/operators/recordView';

/**
 * The single open "full reading" drawer. One record at a time — opening a
 * record from any surface (result panel, cube history, Evolve candidate)
 * replaces whatever was showing, so the drawer is one learnable place.
 */
interface RecordViewerState {
  record: TranslationRecordView | null;
  open: (record: TranslationRecordView) => void;
  close: () => void;
}

export const useRecordViewerStore = create<RecordViewerState>((set) => ({
  record: null,
  open: (record) => set({ record }),
  close: () => set({ record: null }),
}));
