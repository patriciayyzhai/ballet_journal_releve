'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { addEntry, getEntries, getFocus, saveFocus } from '@/lib/storage';
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
  const [toast, setToast] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    setFocus(getFocus(defaultFocus));
    getEntries().then(setEntries).catch(() => setEntries([]));
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const greeting = useMemo(() => greetingFor(now), [now]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
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
    await addEntry(entry);
    setEntries((current) => [entry, ...current]);
    if (entry.next_practice) {
      const next = [entry.next_practice, ...focus.filter((item) => item !== entry.next_practice)].slice(0, 3);
      setFocus(next);
      saveFocus(next);
    }
    setSelectedTags([]);
    setEntryOpen(false);
    event.currentTarget.reset();
    showToast('Another step remembered.');
  }

  return (
    <>
      <main className="app">
        <header className="topbar">
          <div className="brand"><div className="mark">🦢</div><div><div className="eyebrow">Ballet journal</div><h1>Relevé</h1></div></div>
          <div className="moon" aria-hidden>◐</div>
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
      </main>

      <nav className="nav"><button className="active"><span>⌂</span>Journal</button><button onClick={() => setFocusOpen(true)}><span>◌</span>Practice</button><button onClick={() => showToast('Private by design.') }><span>♙</span>Me</button></nav>

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

      {focusOpen && <div className="sheet"><form className="panel" onSubmit={(event) => {event.preventDefault(); const values = new FormData(event.currentTarget).getAll('focus').map(String).map((x) => x.trim()).filter(Boolean).slice(0, 3); const next = values.length ? values : defaultFocus; setFocus(next); saveFocus(next); setFocusOpen(false); showToast('Practice intentions updated.');}}>
        <div className="grab"/><div className="panelHead"><div><div className="eyebrow">Practice</div><h2>Your three intentions</h2></div><button className="close" type="button" onClick={() => setFocusOpen(false)}>×</button></div>
        {[0,1,2].map((index) => <div key={index}><label>Focus {index + 1}</label><input className="field" name="focus" defaultValue={focus[index] || ''}/></div>)}
        <div className="saveRow"><button className="secondary" type="button" onClick={() => setFocusOpen(false)}>Cancel</button><button className="save" type="submit">Save intentions</button></div>
      </form></div>}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
