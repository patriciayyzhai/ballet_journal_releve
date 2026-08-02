'use client';

import { useEffect, useState } from 'react';
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

export default function WeeklyReflection() {
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const weekStart = mondayValue();

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      if (!supabase) return;
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return;
      const { data } = await supabase
        .from('weekly_reflections')
        .select('week_start,title,opening,observation,carry_forward')
        .eq('week_start', weekStart)
        .maybeSingle();
      if (data) setReflection(data as Reflection);
    };
    load();
  }, [weekStart]);

  async function generate() {
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
        body: JSON.stringify({ weekOf: weekStart }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not write the reflection.');
      setReflection(result.reflection);
      setOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not write the reflection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section weeklySection">
      <div className="sectionHead">
        <div><div className="eyebrow">Weekly letter</div><h3>From the Barre</h3></div>
        {reflection && <button className="textButton" onClick={() => setOpen(true)}>Read</button>}
      </div>
      <div className="weeklyCard">
        <div className="weeklySwan" aria-hidden>◌</div>
        <div>
          <p>{reflection ? reflection.title : 'A quiet reading of what is changing in your dancing.'}</p>
          <button className="weeklyAction" onClick={reflection ? () => setOpen(true) : generate} disabled={busy}>
            {busy ? 'Reading your notes…' : reflection ? 'Open this week’s letter' : 'Write this week’s reflection'}
          </button>
          {reflection && <button className="weeklyRegenerate" onClick={generate} disabled={busy}>Regenerate</button>}
          {message && <div className="authNote">{message}</div>}
        </div>
      </div>

      {open && reflection && <div className="sheet" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
        <article className="panel letterPanel">
          <div className="grab" />
          <div className="panelHead">
            <div><div className="eyebrow">From the Barre · Week of {new Date(`${reflection.week_start}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</div><h2>{reflection.title}</h2></div>
            <button className="close" type="button" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="letterBody">
            <p>{reflection.opening}</p>
            <p>{reflection.observation}</p>
            <div className="carryLabel">To carry forward</div>
            <blockquote>{reflection.carry_forward}</blockquote>
          </div>
        </article>
      </div>}
    </section>
  );
}
