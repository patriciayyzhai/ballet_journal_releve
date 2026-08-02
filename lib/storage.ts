import type { JournalEntry } from './types';
import { createClient } from './supabase';

const ENTRIES_KEY = 'releveEntriesV2';
const FOCUS_KEY = 'releveFocusV2';

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
}

export async function getEntries(): Promise<JournalEntry[]> {
  const supabase = createClient();
  if (!supabase) return readLocal<JournalEntry[]>(ENTRIES_KEY, []);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return readLocal<JournalEntry[]>(ENTRIES_KEY, []);
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .order('class_date', { ascending: false });
  if (error) throw error;
  return (data || []) as JournalEntry[];
}

export async function addEntry(entry: JournalEntry): Promise<void> {
  const supabase = createClient();
  if (!supabase) {
    const current = readLocal<JournalEntry[]>(ENTRIES_KEY, []);
    localStorage.setItem(ENTRIES_KEY, JSON.stringify([entry, ...current]));
    return;
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    const current = readLocal<JournalEntry[]>(ENTRIES_KEY, []);
    localStorage.setItem(ENTRIES_KEY, JSON.stringify([entry, ...current]));
    return;
  }
  const { error } = await supabase.from('journal_entries').insert({
    ...entry,
    user_id: auth.user.id,
  });
  if (error) throw error;
}

export function getFocus(defaults: string[]) {
  return readLocal<string[]>(FOCUS_KEY, defaults);
}

export function saveFocus(items: string[]) {
  localStorage.setItem(FOCUS_KEY, JSON.stringify(items));
}
