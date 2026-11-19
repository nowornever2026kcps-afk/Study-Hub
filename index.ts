import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Please sign in first.' }, 401);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Your session is invalid. Please sign in again.' }, 401);

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ error: 'Gemini is not configured. Add GEMINI_API_KEY to Edge Function secrets.' }, 503);
    const body = await req.json();
    const request = String(body?.request ?? '').trim().slice(0, 5000);
    if (!request) return json({ error: 'Please describe what you want to change.' }, 400);
    const current = body?.current ?? {};

    const systemPrompt = `You are StudyHub's careful study-planning assistant. Help a school student make a realistic, supportive study plan. Do not shame, pressure, or encourage unhealthy all-night studying. Include breaks and reasonable sleep. Do not claim to know an exam syllabus unless the student supplied it. Ask for clarification only when essential; otherwise make conservative assumptions and explain them in message.

Return ONLY valid JSON with this exact shape:
{
 "message":"brief summary and assumptions",
 "plan":{
  "goalMinutes":300,
  "subjects":["Physics","Chemistry"],
  "timetable":[{"time":"4:00–4:45 PM","subject":"Physics","mins":45,"note":"specific task"}],
  "days":[{"label":"Day 1 · date","date":"YYYY-MM-DD or empty","tasks":[{"subject":"Physics","text":"specific measurable target","note":"optional detail","done":false}]}]
 }
}

Rules: Build a useful 7-day plan unless the student requests another duration. Preserve completed targets as completed when they remain unchanged. Use only subjects relevant to the student or their request. Timetable minutes should add up sensibly and include breaks as subject 'Break'. Keep the plan specific, achievable and not overloaded. Use local date ${new Date().toISOString().slice(0,10)} as today's date if dates are needed. The student's current data follows; adapt it rather than blindly replacing everything. Do not return markdown fences.`;

    const prompt = `${systemPrompt}\n\nCURRENT STUDY DATA:\n${JSON.stringify(current).slice(0, 18000)}\n\nSTUDENT REQUEST:\n${request}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, responseMimeType: 'application/json' },
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('Gemini API error:', result);
      return json({ error: result?.error?.message || 'Gemini could not generate a plan right now.' }, 502);
    }
    const text = result?.candidates?.[0]?.content?.parts?.map((p: {text?: string}) => p.text || '').join('');
    if (!text) return json({ error: 'Gemini returned an empty response. Please try again.' }, 502);
    let parsed;
    try { parsed = JSON.parse(text); } catch { return json({ error: 'Gemini returned an unreadable plan. Please try again.' }, 502); }
    if (!parsed?.plan || !Array.isArray(parsed.plan.timetable) || !Array.isArray(parsed.plan.days)) {
      return json({ error: 'Gemini returned an incomplete plan. Please try again.' }, 502);
    }
    return json({ message: String(parsed.message || 'Review your proposed study plan.'), plan: parsed.plan });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
