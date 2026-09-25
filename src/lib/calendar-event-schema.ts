import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid calendar date.");

export const calendarEventSchema = z.object({
  title: z.string().trim().min(1).max(100),
  date: dateSchema,
  type: z.enum(["study", "exam", "deadline"]),
  allDay: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  color: z.string().regex(/^#[\da-fA-F]{6}$/),
  subject: z.string().max(100).default(""),
  location: z.string().max(150).default(""),
  packId: z.uuid().nullable().optional(),
}).superRefine((event, ctx) => {
  if (Date.parse(event.endsAt) <= Date.parse(event.startsAt)) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start." });
  }
  if (!event.allDay && (!event.start || !event.end || event.end <= event.start)) {
    ctx.addIssue({ code: "custom", path: ["end"], message: "End time must be later than start time." });
  }
});

export type CalendarEventInput = z.infer<typeof calendarEventSchema>;

export function toCalendarEventRow(event: CalendarEventInput, userId: string) {
  return {
    user_id: userId,
    title: event.title,
    event_type: event.type,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    event_date: event.date,
    start_time: event.allDay ? null : event.start,
    end_time: event.allDay ? null : event.end,
    all_day: event.allDay,
    color: event.color,
    subject: event.subject,
    location: event.location,
    pack_id: event.packId || null,
  };
}

export function fromCalendarEventRow(event: Record<string, unknown>) {
  return {
    id: event.id,
    title: event.title,
    date: event.event_date,
    type: event.event_type,
    allDay: event.all_day,
    start: typeof event.start_time === "string" ? event.start_time.slice(0, 5) : undefined,
    end: typeof event.end_time === "string" ? event.end_time.slice(0, 5) : undefined,
    color: event.color,
    subject: event.subject,
    location: event.location,
    packId: event.pack_id ?? undefined,
  };
}
