import type { JournalEntry } from './types';
import { createClient } from './supabase';

const ENTRIES_KEY = 'releveEntriesV2';
const PENDING_KEY = 'relevePendingEntriesV1';
const FOCUS_KEY = 'releveFocusV2';

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function hasLocal(key: string) {
  return typeof window !== 'undefined' && localStorage.getItem(key) !== null;
}

function writeLocal<T>(key: string, value: T) {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
}

function writeLocalEntries(entries: JournalEntry[]) {
  writeLocal(ENTRIES_KEY, entries);
}

function writePendingEntries(entries: JournalEntry[]) {
  writeLocal(PENDING_KEY, entries);
}

function writeLocalFocus(items: string[]) {
  writeLocal(FOCUS_KEY, items);
}

export function getLocalEntries() {
  return readLocal<JournalEntry[]>(ENTRIES_KEY, []);
}

export function getPendingEntries() {
  return readLocal<JournalEntry[]>(PENDING_KEY, []);
}

function queueEntry(entry: JournalEntry) {
  const current = getPendingEntries();
  if (!current.some((item) => item.id === entry.id)) writePendingEntries([entry, ...current]);
}

export async function flushPendingEntries(): Promise<number> {
  const supabase = createClient();
  if (!supabase || typeof navigator === 'undefined' || !navigator.onLine) return 0;
  const pending = getPendingEntries();
  if (!pending.length) return 0;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return 0;
  const rows = pending.map((entry) => ({ ...entry, user_id: auth.user!.id }));
  const { error } = await supabase.from('journal_entries').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  writePendingEntries([]);
  return rows.length;
}

export async function migrateLocalEntries(): Promise<number> {
  const supabase = createClient();
  if (!supabase) return 0;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return 0;
  const localEntries = getLocalEntries();
  let migrated = 0;
  if (localEntries.length) {
    const rows = localEntries.map((entry) => ({ ...entry, user_id: auth.user!.id }));
    const { error } = await supabase.from('journal_entries').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    writeLocalEntries([]);
    migrated += rows.length;
  }
  migrated += await flushPendingEntries();
  return migrated;
}

export async function getEntries(): Promise<JournalEntry[]> {
  const supabase = createClient();
  if (!supabase) return [...getPendingEntries(), ...getLocalEntries()];
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .order('class_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const pending = getPendingEntries();
  const cloud = (data || []) as JournalEntry[];
  return [...pending.filter((p) => !cloud.some((c) => c.id === p.id)), ...cloud];
}

export async function addEntry(entry: JournalEntry): Promise<'cloud' | 'local' | 'queued'> {
  const supabase = createClient();
  if (!supabase) {
    writeLocalEntries([entry, ...getLocalEntries()]);
    return 'local';
  }
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    writeLocalEntries([entry, ...getLocalEntries()]);
    return 'local';
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    queueEntry(entry);
    return 'queued';
  }
  const { error } = await supabase.from('journal_entries').insert({ ...entry, user_id: sessionData.session.user.id });
  if (error) {
    if (!navigator.onLine || error.message.toLowerCase().includes('fetch')) {
      queueEntry(entry);
      return 'queued';
    }
    throw error;
  }
  return 'cloud';
}

export async function updateEntry(entry: JournalEntry): Promise<void> {
  const supabase = createClient();
  if (!supabase) {
    writeLocalEntries(getLocalEntries().map((item) => item.id === entry.id ? entry : item));
    return;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    writeLocalEntries(getLocalEntries().map((item) => item.id === entry.id ? entry : item));
    return;
  }
  const { error } = await supabase.from('journal_entries').update({
    class_date: entry.class_date,
    feeling: entry.feeling,
    clicked: entry.clicked,
    correction: entry.correction,
    next_practice: entry.next_practice,
    memory: entry.memory,
    tags: entry.tags,
    updated_at: new Date().toISOString(),
  }).eq('id', entry.id);
  if (error) throw error;
}

export async function deleteEntry(id: string): Promise<void> {
  const supabase = createClient();
  if (!supabase) {
    writeLocalEntries(getLocalEntries().filter((item) => item.id !== id));
    writePendingEntries(getPendingEntries().filter((item) => item.id !== id));
    return;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    writeLocalEntries(getLocalEntries().filter((item) => item.id !== id));
    writePendingEntries(getPendingEntries().filter((item) => item.id !== id));
    return;
  }
  const { error } = await supabase.from('journal_entries').delete().eq('id', id);
  if (error) throw error;
  writePendingEntries(getPendingEntries().filter((item) => item.id !== id));
}

export async function migrateLocalFocus(): Promise<number> {
  const supabase = createClient();
  if (!supabase || !hasLocal(FOCUS_KEY)) return 0;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return 0;
  const { data: existing, error: existingError } = await supabase.from('practice_focus').select('items').eq('user_id', auth.user.id).maybeSingle();
  if (existingError) throw existingError;
  if (existing) { writeLocalFocus(existing.items || []); return 0; }
  const local = readLocal<string[]>(FOCUS_KEY, []).filter(Boolean).slice(0, 3);
  if (!local.length) return 0;
  const { error } = await supabase.from('practice_focus').insert({ user_id: auth.user.id, items: local });
  if (error) throw error;
  return 1;
}

export async function getFocus(defaults: string[]): Promise<string[]> {
  const local = readLocal<string[]>(FOCUS_KEY, defaults);
  const supabase = createClient();
  if (!supabase) return local;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return local;
  const { data, error } = await supabase.from('practice_focus').select('items').eq('user_id', auth.user.id).maybeSingle();
  if (error) throw error;
  if (!data) return local;
  const items = (data.items || []) as string[];
  writeLocalFocus(items);
  return items.length ? items : defaults;
}

export async function saveFocus(items: string[]): Promise<void> {
  const next = items.filter(Boolean).slice(0, 3);
  writeLocalFocus(next);
  const supabase = createClient();
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase.from('practice_focus').upsert({ user_id: auth.user.id, items: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}
