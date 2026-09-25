import { calendarEventSchema, fromCalendarEventRow, toCalendarEventRow } from "@/lib/calendar-event-schema";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";

const selection = "id,title,event_type,event_date,start_time,end_time,all_day,color,subject,location,pack_id";

export async function GET() {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();
  const { data, error } = await context.supabase
    .from("calendar_events")
    .select(selection)
    .eq("user_id", context.userId)
    .order("event_date", { ascending: true });
  if (error) return Response.json({ error: "Calendar events could not be loaded." }, { status: 503 });
  return Response.json({ events: (data ?? []).map(fromCalendarEventRow) });
}

export async function POST(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();
  const parsed = calendarEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the event title, date, and time." }, { status: 400 });

  if (parsed.data.packId) {
    const { data: pack } = await context.supabase
      .from("study_packs").select("id").eq("id", parsed.data.packId).eq("owner_id", context.userId).maybeSingle();
    if (!pack) return Response.json({ error: "Choose one of your own StudyPacks." }, { status: 400 });
  }
  const { data, error } = await context.supabase
    .from("calendar_events")
    .insert(toCalendarEventRow(parsed.data, context.userId))
    .select(selection)
    .single();
  if (error) return Response.json({ error: "This event could not be saved to your account." }, { status: 503 });
  return Response.json({ event: fromCalendarEventRow(data) }, { status: 201 });
}
