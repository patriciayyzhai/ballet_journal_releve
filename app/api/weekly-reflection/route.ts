import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Entry = {
  class_date: string;
  feeling: string;
  clicked: string;
  correction: string;
  next_practice: string;
  memory: string;
  tags: string[];
};

function mondayOf(date: Date) {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const authorization = request.headers.get('authorization');

    if (!supabaseUrl || !supabaseKey || !openaiKey) {
      return NextResponse.json({ error: 'Weekly reflection is not configured.' }, { status: 503 });
    }
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
    }

    const token = authorization.slice(7);
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
    });
    if (!userResponse.ok) return NextResponse.json({ error: 'Your session has expired.' }, { status: 401 });
    const user = await userResponse.json();

    const body = await request.json().catch(() => ({}));
    const requestedDate = body.weekOf ? new Date(`${body.weekOf}T12:00:00Z`) : new Date();
    const weekStart = mondayOf(requestedDate);
    const weekEndDate = new Date(`${weekStart}T00:00:00Z`);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    const params = new URLSearchParams({
      select: 'class_date,feeling,clicked,correction,next_practice,memory,tags',
      class_date: `gte.${weekStart}`,
      order: 'class_date.asc',
    });
    const entriesResponse = await fetch(`${supabaseUrl}/rest/v1/journal_entries?${params}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
        'Range-Unit': 'items',
      },
    });
    if (!entriesResponse.ok) {
      const detail = await entriesResponse.text();
      return NextResponse.json({ error: detail || 'Could not read this week’s journal.' }, { status: 500 });
    }
    const allEntries = (await entriesResponse.json()) as Entry[];
    const entries = allEntries.filter((entry) => entry.class_date < weekEnd);
    if (!entries.length) {
      return NextResponse.json({ error: 'Add at least one class note this week before generating a reflection.' }, { status: 400 });
    }

    const prompt = `You are writing “From the Barre”, a weekly reflection for a private ballet journal.\n\nRead the structured class notes and discern what matters. Do not recap every class. Do not mention counts, statistics, data, or that you are an AI. Do not use generic praise, therapy language, or motivational clichés. Never invent progress. If evidence is thin, say so with restraint.\n\nWrite elegant, economical prose with the observational precision of an experienced répétiteur and the intimacy of an artist’s notebook. Identify at most two recurring themes, one subtle change or consolidation supported by the notes, and the most important technical idea to carry forward. The whole reflection should be 180–280 words.\n\nReturn exactly these four sections as JSON strings:\n- title: a short, evocative title (3–8 words)\n- opening: the central thread of the week in one compact paragraph\n- observation: the most consequential recurring pattern or subtle change in one compact paragraph\n- carry_forward: one distilled technical sentence, not encouragement\n\nWeek beginning ${weekStart}. Notes:\n${JSON.stringify(entries, null, 2)}`;

    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'weekly_ballet_reflection',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                opening: { type: 'string' },
                observation: { type: 'string' },
                carry_forward: { type: 'string' },
              },
              required: ['title', 'opening', 'observation', 'carry_forward'],
            },
          },
        },
      }),
    });
    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      console.error('OpenAI weekly reflection error', detail);
      return NextResponse.json({ error: 'The reflection could not be written just now.' }, { status: 502 });
    }
    const ai = await aiResponse.json();
    const reflection = JSON.parse(ai.output_text);

    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/weekly_reflections?on_conflict=user_id,week_start`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({ user_id: user.id, week_start: weekStart, ...reflection }),
    });
    if (!saveResponse.ok) {
      const detail = await saveResponse.text();
      return NextResponse.json({ error: detail || 'The reflection was written but could not be saved.' }, { status: 500 });
    }
    const saved = await saveResponse.json();
    return NextResponse.json({ reflection: saved[0] || { week_start: weekStart, ...reflection } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Something interrupted the reflection.' }, { status: 500 });
  }
}
