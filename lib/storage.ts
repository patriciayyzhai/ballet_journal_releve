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

function writeLocalEntries(entries: JournalEntry[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  }
}

export function getLocalEntries() {
  return readLocal<JournalEntry[]>(ENTRIES_KEY, []);
}

export async function migrateLocalEntries(): Promise<number> {
  const supabase = createClient();
  if (!supabase) return 0;

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return 0;

  const localEntries = getLocalEntries();
  if (!localEntries.length) return 0;

  const rows = localEntries.map((entry) => ({
    ...entry,
    user_id: auth.user!.id,
  }));

  const { error } = await supabase
    .from('journal_entries')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

  if (error) throw error;
  writeLocalEntries([]);
  return rows.length;
}

export async function getEntries(): Promise<JournalEntry[]> {
  const supabase = createClient();
  if (!supabase) return getLocalEntries();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return getLocalEntries();

  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .order('class_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as JournalEntry[];
}

export async function addEntry(entry: JournalEntry): Promise<void> {
  const supabase = createClient();
  if (!supabase) {
    writeLocalEntries([entry, ...getLocalEntries()]);
    return;
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    writeLocalEntries([entry, ...getLocalEntries()]);
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
