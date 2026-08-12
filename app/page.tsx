'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import WeeklyReflection from '@/components/WeeklyReflection';
import { addEntry, deleteEntry, flushPendingEntries, getEntries, getFocus, migrateLocalEntries, migrateLocalFocus, saveFocus, updateEntry } from '@/lib/storage';
import { createClient, hasSupabaseConfig } from '@/lib/supabase';
import type { JournalEntry } from '@/lib/types';

const defaultFocus = ['Lift through the supporting side', 'Finish every fifth', 'Relax the shoulders in adagio'];
const tagOptions = ['Turnout', 'Posture', 'Feet', 'Arms', 'Balance', 'Musicality', 'Jumps', 'Memory'];
type CloudStatus = 'checking' | 'cloud' | 'signedOut' | 'issue';

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return 'Still awake';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}
function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export default function Home() {
  const [now, setNow] = useState(new Date());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [focus, setFocus] = useState(defaultFocus);
  const [entryOpen, setEntryOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [toast, setToast] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('checking');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const refreshTimer = useRef<number | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }

  useEffect(() => {
    let disposed = false;
    const supabase = createClient();

    const refreshCloudState = async (announceMigration = false) => {
      if (!supabase) {
        setCloudStatus('signedOut');
        setEntries(await getEntries());
        setFocus(await getFocus(defaultFocus));
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!disposed) {
          setUserEmail('');
          setCloudStatus('signedOut');
          setEntries(await getEntries());
          setFocus(await getFocus(defaultFocus));
        }
        return;
      }
      const { data: verified, error: verifyError } = await supabase.auth.getUser();
      if (verifyError || !verified.user) {
        if (!disposed) setCloudStatus('issue');
        return;
      }
      if (!disposed) {
        setUserEmail(verified.user.email || '');
        setCloudStatus('cloud');
      }
      let migrated = 0;
      try { migrated = await migrateLocalEntries(); } catch {}
      try { await flushPendingEntries(); } catch {}
      try {
        const nextEntries = await getEntries();
        if (!disposed) setEntries(nextEntries);
      } catch {
        if (!disposed) setCloudStatus('issue');
      }
      try {
        await migrateLocalFocus();
        const nextFocus = await getFocus(defaultFocus);
        if (!disposed) setFocus(nextFocus);
      } catch {}
      if (!disposed && announceMigration && migrated) showToast(`${migrated} local ${migrated === 1 ? 'entry' : 'entries'} moved to the cloud.`);
    };

    const scheduleRefresh = (announce = false) => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => refreshCloudState(announce), 250);
    };

    scheduleRefresh(true);
    let unsubscribeAuth: (() => void) | undefined;
    if (supabase) {
      const { data: listener } = supabase.auth.onAuthStateChange(() => scheduleRefresh(true));
      unsubscribeAuth = () => listener.subscription.unsubscribe();
    }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') { setNow(new Date()); scheduleRefresh(); } };
    const refreshOnFocus = () => scheduleRefresh();
    const refreshOnOnline = () => scheduleRefresh();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('online', refreshOnOnline);
    return () => {
      disposed = true;
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      unsubscribeAuth?.();
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('online', refreshOnOnline);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = useMemo(() => greetingFor(now), [now]);
  const cloudLabel = cloudStatus === 'cloud' ? 'Cloud' : cloudStatus === 'issue' ? 'Sync issue' : cloudStatus === 'checking' ? 'Checking…' : 'Sign in';

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entry: JournalEntry = {
      id: crypto.randomUUID(), class_date: String(data.get('class_date')),
      feeling: String(data.get('feeling') || '').trim(), clicked: String(data.get('clicked') || '').trim(),
      correction: String(data.get('correction') || '').trim(), next_practice: String(data.get('next_practice') || '').trim(),
      memory: String(data.get('memory') || '').trim(), tags: selectedTags,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    if (!entry.feeling && !entry.clicked && !entry.correction && !entry.memory) { showToast('Add one small reflection first.'); return; }
    try {
      const destination = await addEntry(entry);
      setEntries((current) => [entry, ...current]);
      if (entry.next_practice) {
        const next = [entry.next_practice, ...focus.filter((item) => item !== entry.next_practice)].slice(0, 3);
        setFocus(next); try { await saveFocus(next); } catch {}
      }
      setSelectedTags([]); setEntryOpen(false); event.currentTarget.reset();
      showToast(destination === 'cloud' ? 'Saved to your private journal.' : destination === 'queued' ? 'Saved offline. Relevé will sync it when you reconnect.' : 'Saved on this device.');
    } catch { showToast('This class could not be saved. Please try again.'); }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingEntry) return;
    const data = new FormData(event.currentTarget);
    const updated: JournalEntry = { ...editingEntry,
      class_date: String(data.get('class_date')), feeling: String(data.get('feeling') || '').trim(), clicked: String(data.get('clicked') || '').trim(),
      correction: String(data.get('correction') || '').trim(), next_practice: String(data.get('next_practice') || '').trim(), memory: String(data.get('memory') || '').trim(),
      tags: editTags, updated_at: new Date().toISOString(),
    };
    try { await updateEntry(updated); setEntries((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingEntry(null); showToast('Class note updated.'); }
    catch { showToast('Could not update this class note.'); }
  }

  async function removeEntry(entry: JournalEntry) {
    if (!window.confirm('Delete this class note? This cannot be undone.')) return;
    try { await deleteEntry(entry.id); setEntries((current) => current.filter((item) => item.id !== entry.id)); setEditingEntry(null); showToast('Class note deleted.'); }
    catch { showToast('Could not delete this class note.'); }
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    if (!supabase) { setAuthMessage('Supabase is not configured yet.'); return; }
    setAuthBusy(true); setAuthMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setAuthBusy(false);
      setAuthMessage(error.message);
    }
  }

  async function signOut() {
    const supabase = createClient(); if (!supabase) return;
    await supabase.auth.signOut(); setAccountOpen(false); setUserEmail(''); setCloudStatus('signedOut');
    setAuthMessage('');
    setEntries(await getEntries()); setFocus(await getFocus(defaultFocus)); showToast('Signed out.');
  }

  return <>
    <main className="app">
      <header className="topbar">
        <div className="brand"><div className="mark">🦢</div><div><div className="eyebrow">Ballet journal</div><h1>Relevé</h1></div></div>
        <button className={`accountPill ${cloudStatus === 'cloud' ? 'signedIn' : cloudStatus === 'issue' ? 'syncIssue' : ''}`} onClick={() => setAccountOpen(true)}>{cloudLabel}</button>
      </header>
      <section className="hero"><div className="eyebrow">{greeting}</div><h2>What did your body discover today?</h2><p>Capture a correction, a breakthrough, or one quiet thing to carry into your next class.</p><button className="primary" onClick={() => setEntryOpen(true)}>Start today’s reflection</button></section>
      <section className="section"><div className="sectionHead"><h3>Current practice</h3><button className="textButton" onClick={() => setFocusOpen(true)}>Edit</button></div><div className="focusList">{focus.map((item) => <div className="focusCard" key={item}><div className="dot"/><span>{item}</span></div>)}</div></section>
      <section className="section"><div className="sectionHead"><h3>Recent entries</h3><span className="muted">{entries.length || ''}</span></div><div className="entryList">
        {!entries.length && <div className="empty">{cloudStatus === 'issue' ? 'Your cloud journal could not be reached just now.' : 'Your first class note will appear here.'}</div>}
        {entries.slice(0, 8).map((entry) => <button className="entryCard entryButton" key={entry.id} onClick={() => { setEditingEntry(entry); setEditTags(entry.tags); }}>
          <div className="entryDate">{new Date(`${entry.class_date}T12:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}</div>
          <div className="entryTitle">{entry.memory || entry.clicked || 'A class remembered'}</div><div className="entryMeta">{entry.tags.length ? entry.tags.join(' · ') : 'Reflection'}</div>
        </button>)}
      </div></section>
      <section className="section weeklySection"><WeeklyReflection /></section>
    </main>
    <nav className="nav"><button className="active"><span>⌂</span>Journal</button><button onClick={() => setFocusOpen(true)}><span>◌</span>Practice</button><button onClick={() => setAccountOpen(true)}><span>♙</span>Me</button></nav>

    {entryOpen && <div className="sheet"><form className="panel" onSubmit={submitEntry}><div className="grab"/><div className="panelHead"><div><div className="eyebrow">New class note</div><h2>Today’s reflection</h2></div><button className="close" type="button" onClick={() => setEntryOpen(false)}>×</button></div>
      <label>Date</label><input className="field" name="class_date" type="date" defaultValue={localDateValue()} required/><label>How did class feel?</label><textarea className="field" name="feeling"/><label>What clicked?</label><textarea className="field" name="clicked"/><label>Teacher’s correction</label><textarea className="field" name="correction"/><label>Needs work</label><div className="tags">{tagOptions.map((tag)=><button type="button" key={tag} className={`tag ${selectedTags.includes(tag)?'selected':''}`} onClick={()=>setSelectedTags((c)=>c.includes(tag)?c.filter((x)=>x!==tag):[...c,tag])}>{tag}</button>)}</div><label>Next practice</label><input className="field" name="next_practice"/><label>What will you remember?</label><input className="field" name="memory"/><div className="saveRow"><button className="secondary" type="button" onClick={()=>setEntryOpen(false)}>Cancel</button><button className="save" type="submit">Remember this class</button></div>
    </form></div>}

    {editingEntry && <div className="sheet"><form className="panel" onSubmit={submitEdit}><div className="grab"/><div className="panelHead"><div><div className="eyebrow">Class note</div><h2>Edit reflection</h2></div><button className="close" type="button" onClick={()=>setEditingEntry(null)}>×</button></div>
      <label>Date</label><input className="field" name="class_date" type="date" defaultValue={editingEntry.class_date} required/><label>How did class feel?</label><textarea className="field" name="feeling" defaultValue={editingEntry.feeling}/><label>What clicked?</label><textarea className="field" name="clicked" defaultValue={editingEntry.clicked}/><label>Teacher’s correction</label><textarea className="field" name="correction" defaultValue={editingEntry.correction}/><label>Needs work</label><div className="tags">{tagOptions.map((tag)=><button type="button" key={tag} className={`tag ${editTags.includes(tag)?'selected':''}`} onClick={()=>setEditTags((c)=>c.includes(tag)?c.filter((x)=>x!==tag):[...c,tag])}>{tag}</button>)}</div><label>Next practice</label><input className="field" name="next_practice" defaultValue={editingEntry.next_practice}/><label>What will you remember?</label><input className="field" name="memory" defaultValue={editingEntry.memory}/><div className="dangerRow"><button className="deleteButton" type="button" onClick={()=>removeEntry(editingEntry)}>Delete</button></div><div className="saveRow"><button className="secondary" type="button" onClick={()=>setEditingEntry(null)}>Cancel</button><button className="save" type="submit">Save changes</button></div>
    </form></div>}

    {focusOpen && <div className="sheet"><form className="panel" onSubmit={async(e)=>{e.preventDefault();const values=new FormData(e.currentTarget).getAll('focus').map(String).map((x)=>x.trim()).filter(Boolean).slice(0,3);const next=values.length?values:defaultFocus;try{await saveFocus(next);setFocus(next);setFocusOpen(false);showToast(cloudStatus==='cloud'?'Practice intentions synced.':'Practice intentions saved on this device.');}catch{showToast('Practice intentions could not be saved.');}}}><div className="grab"/><div className="panelHead"><div><div className="eyebrow">Practice</div><h2>Your three intentions</h2></div><button className="close" type="button" onClick={()=>setFocusOpen(false)}>×</button></div>{[0,1,2].map((i)=><div key={i}><label>Focus {i+1}</label><input className="field" name="focus" defaultValue={focus[i]||''}/></div>)}<div className="saveRow"><button className="secondary" type="button" onClick={()=>setFocusOpen(false)}>Cancel</button><button className="save" type="submit">Save intentions</button></div></form></div>}

    {accountOpen && <div className="sheet"><div className="panel"><div className="grab"/><div className="panelHead"><div><div className="eyebrow">Private journal</div><h2>{cloudStatus==='cloud'?'Cloud connected':cloudStatus==='issue'?'Sync needs attention':'Carry Relevé with you'}</h2></div><button className="close" type="button" onClick={()=>setAccountOpen(false)}>×</button></div>
      {cloudStatus==='cloud'?<><p className="accountCopy">Signed in as <strong>{userEmail}</strong>. Your journal is synced across authenticated Relevé sessions.</p><button className="secondary fullButton" onClick={signOut}>Sign out</button></>:<><p className="accountCopy">{cloudStatus==='issue'?'Your saved session could not be validated. Sign in again to restore cloud sync.':'Sign in with Google to back up local notes and sync them across your phone and browser.'}</p>{!hasSupabaseConfig()&&<div className="authNote">Cloud connection is not configured.</div>}<button className="save fullButton" type="button" onClick={signInWithGoogle} disabled={authBusy||!hasSupabaseConfig()}>{authBusy?'Opening Google…':'Continue with Google'}</button>{authMessage&&<div className="authNote">{authMessage}</div>}</>}
    </div></div>}
    {toast&&<div className="toast">{toast}</div>}
  </>;
}
