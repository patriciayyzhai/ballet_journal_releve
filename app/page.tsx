'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import WeeklyReflection from '@/components/WeeklyReflection';
import { addEntry, getEntries, getFocus, migrateLocalEntries, migrateLocalFocus, saveFocus } from '@/lib/storage';
import { createClient, hasSupabaseConfig } from '@/lib/supabase';
import type { JournalEntry } from '@/lib/types';

const defaultFocus = [
  'Lift through the supporting side',
  'Finish every fifth',
  'Relax the shoulders in adagio',
];
const tagOptions = ['Turnout', 'Posture', 'Feet', 'Arms', 'Balance', 'Musicality', 'Jumps', 'Memory'];

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
  const [toast, setToast] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  useEffect(() => {
    let disposed = false;

    const refreshCloudState = async (announceMigration = false) => {
      let migratedEntries = 0;
      try {
        migratedEntries = await migrateLocalEntries();
      } catch {
        // Migration failure must never block reading existing cloud entries.
      }

      try {
        const nextEntries = await getEntries();
        if (!disposed) setEntries(nextEntries);
      } catch {
        if (!disposed) showToast('Could not load your class notes just now.');
      }

      try {
        await migrateLocalFocus();
        const nextFocus = await getFocus(defaultFocus);
        if (!disposed) setFocus(nextFocus);
      } catch {
        // Practice sync is secondary; keep the current UI state if it fails.
      }

      if (!disposed && announceMigration && migratedEntries) {
        showToast(`${migratedEntries} local ${migratedEntries === 1 ? 'entry' : 'entries'} moved to the cloud.`);
      }
    };

    const supabase = createClient();
    let unsubscribeAuth: (() => void) | undefined;

    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (disposed) return;
        setUserEmail(data.session?.user.email || '');
        refreshCloudState(true);
      });

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (disposed) return;
        setUserEmail(session?.user.email || '');
        window.setTimeout(() => refreshCloudState(true), 0);
      });
      unsubscribeAuth = () => listener.subscription.unsubscribe();
    } else {
      refreshCloudState();
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date());
        refreshCloudState();
      }
    };
    const refreshOnFocus = () => refreshCloudState();
    const refreshOnPageShow = () => refreshCloudState();

    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('pageshow', refreshOnPageShow);

    return () => {
      disposed = true;
      unsubscribeAuth?.();
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('pageshow', refreshOnPageShow);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = useMemo(() => greetingFor(now), [now]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      class_date: String(data.get('class_date')),
      feeling: String(data.get('feeling') || '').trim(),
      clicked: String(data.get('clicked') || '').trim(),
      correction: String(data.get('correction') || '').trim(),
      next_practice: String(data.get('next_practice') || '').trim(),
      memory: String(data.get('memory') || '').trim(),
      tags: selectedTags,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!entry.feeling && !entry.clicked && !entry.correction && !entry.memory) {
      showToast('Add one small reflection first.');
      return;
    }

    try {
      await addEntry(entry);
      setEntries((current) => [entry, ...current]);
      if (entry.next_practice) {
        const next = [entry.next_practice, ...focus.filter((item) => item !== entry.next_practice)].slice(0, 3);
        setFocus(next);
        try { await saveFocus(next); } catch {}
      }
      setSelectedTags([]);
      setEntryOpen(false);
      event.currentTarget.reset();
      showToast(userEmail ? 'Saved to your private journal.' : 'Saved on this device.');
    } catch {
      showToast('This class could not be saved. Please try again.');
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setAuthMessage('Supabase is not configured yet.');
      return;
    }

    const email = String(new FormData(event.currentTarget).get('email') || '').trim();
    if (!email) return;

    setAuthBusy(true);
    setAuthMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setAuthBusy(false);
    setAuthMessage(error ? error.message : 'Check your inbox for a private sign-in link.');
  }

  async function signOut() {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setAccountOpen(false);
    setEntries(await getEntries());
    setFocus(await getFocus(defaultFocus));
    showToast('Signed out. Local notes remain on this device.');
  }

  return (
    <>
      <main className="app">
        <header className="topbar">
          <div className="brand"><div className="mark">🦢</div><div><div className="eyebrow">Ballet journal</div><h1>Relevé</h1></div></div>
          <button className={`accountPill ${userEmail ? 'signedIn' : ''}`} onClick={() => setAccountOpen(true)} aria-label="Open account">
            {userEmail ? 'Cloud' : 'Sign in'}
          </button>
        </header>

        <section className="hero">
          <div className="eyebrow">{greeting}</div>
          <h2>What did your body discover today?</h2>
          <p>Capture a correction, a breakthrough, or one quiet thing to carry into your next class.</p>
          <button className="primary" onClick={() => setEntryOpen(true)}>Start today’s reflection</button>
        </section>

        <section className="section">
          <div className="sectionHead"><h3>Current practice</h3><button className="textButton" onClick={() => setFocusOpen(true)}>Edit</button></div>
          <div className="focusList">{focus.map((item) => <div className="focusCard" key={item}><div className="dot"/><span>{item}</span></div>)}</div>
        </section>

        <section className="section">
          <div className="sectionHead"><h3>Recent entries</h3><span className="muted">{entries.length || ''}</span></div>
          <div className="entryList">
            {!entries.length && <div className="empty">Your first class note will appear here.</div>}
            {entries.slice(0, 5).map((entry) => (
              <article className="entryCard" key={entry.id}>
                <div className="entryDate">{new Date(`${entry.class_date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div className="entryTitle">{entry.memory || entry.clicked || 'A class remembered'}</div>
                <div className="entryMeta">{entry.tags.length ? entry.tags.join(' · ') : 'Reflection'}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="section weeklySection">
          <WeeklyReflection />
        </section>
      </main>

      <nav className="nav"><button className="active"><span>⌂</span>Journal</button><button onClick={() => setFocusOpen(true)}><span>◌</span>Practice</button><button onClick={() => setAccountOpen(true)}><span>♙</span>Me</button></nav>

      {entryOpen && <div className="sheet" onMouseDown={(event) => event.target === event.currentTarget && setEntryOpen(false)}><form className="panel" onSubmit={submitEntry}>
        <div className="grab"/><div className="panelHead"><div><div className="eyebrow">New class note</div><h2>Today’s reflection</h2></div><button className="close" type="button" onClick={() => setEntryOpen(false)}>×</button></div>
        <label>Date</label><input className="field" name="class_date" type="date" defaultValue={localDateValue()} required />
        <label>How did class feel?</label><textarea className="field" name="feeling" placeholder="Messy, musical, surprisingly strong…" />
        <label>What clicked?</label><textarea className="field" name="clicked" placeholder="One small discovery is enough." />
        <label>Teacher’s correction</label><textarea className="field" name="correction" placeholder="Lift through the supporting side…" />
        <label>Needs work</label><div className="tags">{tagOptions.map((tag) => <button type="button" key={tag} className={`tag ${selectedTags.includes(tag) ? 'selected' : ''}`} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}>{tag}</button>)}</div>
        <label>Next practice</label><input className="field" name="next_practice" placeholder="Keep one intention small and specific." />
        <label>What will you remember?</label><input className="field" name="memory" placeholder="A single sentence for your future self." />
        <div className="saveRow"><button className="secondary" type="button" onClick={() => setEntryOpen(false)}>Cancel</button><button className="save" type="submit">Remember this class</button></div>
      </form></div>}

      {focusOpen && <div className="sheet"><form className="panel" onSubmit={async (event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget).getAll('focus').map(String).map((x) => x.trim()).filter(Boolean).slice(0, 3);
        const next = values.length ? values : defaultFocus;
        try {
          await saveFocus(next);
          setFocus(next);
          setFocusOpen(false);
          showToast(userEmail ? 'Practice intentions synced.' : 'Practice intentions saved on this device.');
        } catch {
          showToast('Practice intentions could not be saved.');
        }
      }}>
        <div className="grab"/><div className="panelHead"><div><div className="eyebrow">Practice</div><h2>Your three intentions</h2></div><button className="close" type="button" onClick={() => setFocusOpen(false)}>×</button></div>
        {[0,1,2].map((index) => <div key={index}><label>Focus {index + 1}</label><input className="field" name="focus" defaultValue={focus[index] || ''}/></div>)}
        <div className="saveRow"><button className="secondary" type="button" onClick={() => setFocusOpen(false)}>Cancel</button><button className="save" type="submit">Save intentions</button></div>
      </form></div>}

      {accountOpen && <div className="sheet" onMouseDown={(event) => event.target === event.currentTarget && setAccountOpen(false)}><div className="panel accountPanel">
        <div className="grab"/><div className="panelHead"><div><div className="eyebrow">Private journal</div><h2>{userEmail ? 'Cloud connected' : 'Carry Relevé with you'}</h2></div><button className="close" type="button" onClick={() => setAccountOpen(false)}>×</button></div>
        {userEmail ? <>
          <p className="accountCopy">Signed in as <strong>{userEmail}</strong>. Journal entries and practice intentions are saved to your private Supabase journal and available across devices.</p>
          <button className="secondary fullButton" type="button" onClick={signOut}>Sign out</button>
        </> : <>
          <p className="accountCopy">Sign in by email to back up your entries and practice intentions and sync them across your phone and laptop.</p>
          {!hasSupabaseConfig() && <div className="authNote">Cloud connection is not configured.</div>}
          <form onSubmit={sendMagicLink}>
            <label>Email address</label>
            <input className="field" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            <button className="save fullButton" type="submit" disabled={authBusy || !hasSupabaseConfig()}>{authBusy ? 'Sending…' : 'Email me a sign-in link'}</button>
          </form>
          {authMessage && <div className="authNote">{authMessage}</div>}
        </>}
      </div></div>}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
