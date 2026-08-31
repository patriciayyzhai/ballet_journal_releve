'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';

type Reflection = {
  week_start: string;
  title: string;
  opening: string;
  observation: string;
  carry_forward: string;
};

function mondayValue(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  local.setDate(local.getDate() + (day === 0 ? -6 : 1 - day));
  const offset = local.getTimezoneOffset();
  return new Date(local.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function previousMondayValue(date = new Date()) {
  const current = new Date(`${mondayValue(date)}T12:00:00`);
  current.setDate(current.getDate() - 7);
  return mondayValue(current);
}

function weekLabel(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startText = start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const endText = end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${startText} – ${endText}`;
}

export default function WeeklyReflection() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [openReflection, setOpenReflection] = useState<Reflection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const currentWeek = useMemo(() => mondayValue(), []);
  const previousWeek = useMemo(() => previousMondayValue(), []);

  const load = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) {
      setReflections([]);
      return;
    }

    const { data, error } = await supabase
      .from('weekly_reflections')
      .select('week_start,title,opening,observation,carry_forward')
      .order('week_start', { ascending: false })
      .limit(8);

    if (error) {
      setMessage('Your weekly letters could not be reached just now.');
      return;
    }
    setMessage('');
    setReflections((data || []) as Reflection[]);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onFocus = () => load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    let unsubscribe: (() => void) | undefined;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange(() => window.setTimeout(load, 0));
      unsubscribe = () => data.subscription.unsubscribe();
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      unsubscribe?.();
    };
  }, [load]);

  const latest = reflections[0] || null;
  const hasCurrentWeek = reflections.some((item) => item.week_start === currentWeek);
  const hasPreviousWeek = reflections.some((item) => item.week_start === previousWeek);

  async function generate(weekOf = currentWeek) {
    const supabase = createClient();
    if (!supabase) {
      setMessage('Cloud connection is required.');
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setMessage('Sign in before generating your reflection.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/weekly-reflection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ weekOf }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not write the reflection.');
      await load();
      setOpenReflection(result.reflection as Reflection);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not write the reflection.');
    } finally {
      setBusy(false);
    }
  }

  const generateWeek = !hasPreviousWeek && latest?.week_start !== currentWeek ? previousWeek : currentWeek;
  const generateLabel = generateWeek === previousWeek ? 'Write last week’s reflection' : 'Write this week’s reflection';

  return (
    <section className="section weeklySection">
      <div className="sectionHead">
        <div><div className="eyebrow">Weekly letter</div><h3>From the Barre</h3></div>
        {latest && <button className="textButton" onClick={() => setOpenReflection(latest)}>Read latest</button>}
      </div>

      <div className="weeklyCard">
        <div className="weeklySwan" aria-hidden>◌</div>
        <div>
          {latest ? <>
            <div className="entryDate">{weekLabel(latest.week_start)}</div>
            <p>{latest.title}</p>
            <button className="weeklyAction" onClick={() => setOpenReflection(latest)}>Open latest letter</button>
          </> : <>
            <p>A quiet reading of what is changing in your dancing.</p>
            <button className="weeklyAction" onClick={() => generate(generateWeek)} disabled={busy}>
              {busy ? 'Reading your notes…' : generateLabel}
            </button>
          </>}
          {latest && !hasCurrentWeek && <button className="weeklyRegenerate" onClick={() => generate(generateWeek)} disabled={busy}>{busy ? 'Reading…' : generateLabel}</button>}
          {message && <div className="authNote">{message}</div>}
        </div>
      </div>

      {reflections.length > 1 && <div className="weeklyArchive">
        <div className="eyebrow">Earlier letters</div>
        {reflections.slice(1, 5).map((item) => (
          <button className="weeklyArchiveItem" key={item.week_start} onClick={() => setOpenReflection(item)}>
            <span>{weekLabel(item.week_start)}</span>
            <strong>{item.title}</strong>
          </button>
        ))}
      </div>}

      {openReflection && <div className="sheet" onMouseDown={(event) => event.target === event.currentTarget && setOpenReflection(null)}>
        <article className="panel letterPanel">
          <div className="grab" />
          <div className="panelHead">
            <div><div className="eyebrow">From the Barre · {weekLabel(openReflection.week_start)}</div><h2>{openReflection.title}</h2></div>
            <button className="close" type="button" onClick={() => setOpenReflection(null)}>×</button>
          </div>
          <div className="letterBody">
            <p>{openReflection.opening}</p>
            <p>{openReflection.observation}</p>
            <div className="carryLabel">To carry forward</div>
            <blockquote>{openReflection.carry_forward}</blockquote>
          </div>
          <button className="weeklyRegenerate" onClick={() => generate(openReflection.week_start)} disabled={busy}>{busy ? 'Rewriting…' : 'Regenerate this letter'}</button>
        </article>
      </div>}
    </section>
  );
}
