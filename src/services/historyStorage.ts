import { TranscriptionResult } from '../types';

const STORAGE_KEY = 'offline_video_transcripts_v1';

export function getHistory(): TranscriptionResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read history from localStorage:', err);
    return [];
  }
}

export function saveToHistory(item: TranscriptionResult): TranscriptionResult[] {
  try {
    const current = getHistory();
    // Prepend new item
    const updated = [item, ...current.filter(i => i.id !== item.id)].slice(0, 50); // Keep latest 50
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save to history:', err);
    return getHistory();
  }
}

export function deleteHistoryItem(id: string): TranscriptionResult[] {
  try {
    const current = getHistory();
    const updated = current.filter(i => i.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to delete history item:', err);
    return getHistory();
  }
}

export function clearAllHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear history:', err);
  }
}
