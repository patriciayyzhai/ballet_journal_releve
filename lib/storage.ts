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

function writeLocalFocus(items: string[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(items));
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

export async function migrateLocalFocus(defaults: string[]): Promise<number> {
  const supabase = createClient();
  if (!supabase) return 0;

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return 0;

  const { data: existing, error: existingError } = await supabase
    .from('practice_focus')
    .select('items')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    writeLocalFocus(existing.items || defaults);
    return 0;
  }

  const local = readLocal<string[]>(FOCUS_KEY, defaults).filter(Boolean).slice(0, 3);
  const items = local.length ? local : defaults;
  const { error } = await supabase.from('practice_focus').insert({
    user_id: auth.user.id,
    items,
  });
  if (error) throw error;
  writeLocalFocus(items);
  return 1;
}

export async function getFocus(defaults: string[]): Promise<string[]> {
  const local = readLocal<string[]>(FOCUS_KEY, defaults);
  const supabase = createClient();
  if (!supabase) return local;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return local;

  const { data, error } = await supabase
    .from('practice_focus')
    .select('items')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return local;

  const items = (data.items || defaults) as string[];
  writeLocalFocus(items);
  return items;
}

export async function saveFocus(items: string[]): Promise<void> {
  const next = items.filter(Boolean).slice(0, 3);
  writeLocalFocus(next);

  const supabase = createClient();
  if (!supabase) return;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const { error } = await supabase.from('practice_focus').upsert(
    {
      user_id: auth.user.id,
      items: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}
