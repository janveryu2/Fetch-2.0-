import { z } from "zod";
import { calendarEventSchema, fromCalendarEventRow, toCalendarEventRow } from "@/lib/calendar-event-schema";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";

const selection = "id,title,event_type,event_date,start_time,end_time,all_day,color,subject,location,pack_id";
const idSchema = z.uuid();

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();
  const { eventId } = await params;
  if (!idSchema.safeParse(eventId).success) return Response.json({ error: "Calendar event not found." }, { status: 404 });
  const parsed = calendarEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the event title, date, and time." }, { status: 400 });
  if (parsed.data.packId) {
    const { data: pack } = await context.supabase
      .from("study_packs").select("id").eq("id", parsed.data.packId).eq("owner_id", context.userId).maybeSingle();
    if (!pack) return Response.json({ error: "Choose one of your own StudyPacks." }, { status: 400 });
  }
  const { data, error } = await context.supabase
    .from("calendar_events")
    .update(toCalendarEventRow(parsed.data, context.userId))
    .eq("id", eventId)
    .eq("user_id", context.userId)
    .select(selection)
    .maybeSingle();
  if (error) return Response.json({ error: "This event could not be updated." }, { status: 503 });
  if (!data) return Response.json({ error: "Calendar event not found." }, { status: 404 });
  return Response.json({ event: fromCalendarEventRow(data) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();
  const { eventId } = await params;
  if (!idSchema.safeParse(eventId).success) return Response.json({ error: "Calendar event not found." }, { status: 404 });
  const { data, error } = await context.supabase
    .from("calendar_events")
    .delete()
    .eq("id", eventId)
    .eq("user_id", context.userId)
    .select("id")
    .maybeSingle();
  if (error) return Response.json({ error: "This event could not be deleted." }, { status: 503 });
  if (!data) return Response.json({ error: "Calendar event not found." }, { status: 404 });
  return Response.json({ deleted: true });
}
