"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { eventLanes } from "@/lib/calendar-layout";
import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, Plus, X } from "@phosphor-icons/react";
import { useDemo } from "@/components/app/demo-provider";
import { Button } from "@/components/ui/button";
import { addDays, localDate } from "@/lib/study-stats";
import type { CalendarEvent } from "@/lib/demo-types";
const views = ["Day", "Week", "Month", "Agenda"] as const;
const colors = ["#1065e6", "#7252b8", "#14765c", "#ac4c16", "#a83d62"];
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const asDate = (date: string) => new Date(date + "T12:00:00");
function blank(date: string): CalendarEvent {
  return {
    id: "",
    title: "",
    date,
    type: "study",
    start: "08:30",
    end: "09:30",
    allDay: false,
    color: colors[0],
    subject: "",
    location: "",
    packId: "",
  };
}
export default function CalendarPage() {
  const { events, packs, addEvent, removeEvent, mode } = useDemo();
  const [anchor, setAnchor] = useState(() => localDate(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [view, setView] = useState<(typeof views)[number]>("Week");
  const [initialViewResolved, setInitialViewResolved] = useState(false);
  const [draft, setDraft] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const titleRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledTime = useRef(false);

  // Focused slot for roving tabindex in Day/Week view
  const [focusedSlot, setFocusedSlot] = useState<{ dayIndex: number; hour: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const editorId = draft?.id;
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = matchMedia("(max-width:1279px)");
    const sync = () => setCompact(mq.matches);
    const frame = requestAnimationFrame(sync);
    mq.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      mq.removeEventListener("change", sync);
    };
  }, []);

  // Adaptive initial view resolution (< 640px opens Agenda by default, desktop opens Week)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem("fetch-calendar-view");
        if (saved && views.includes(saved as (typeof views)[number])) {
          setView(saved as (typeof views)[number]);
        } else if (window.innerWidth < 640) {
          setView("Agenda");
        }
      } catch {
        // ignore storage errors
      }
      setInitialViewResolved(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function handleViewChange(v: (typeof views)[number]) {
    setView(v);
    try {
      localStorage.setItem("fetch-calendar-view", v);
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    if (editorId !== undefined) titleRef.current?.focus();
  }, [editorId]);

  const date = asDate(anchor),
    today = localDate(now);
  const weekStart = addDays(date, -date.getDay());
  const days =
    view === "Day"
      ? [date]
      : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const monthDays = Array.from({ length: 42 }, (_, i) =>
    addDays(monthStart, i - monthStart.getDay()),
  );

  const todayIndex = days.findIndex((d) => localDate(d) === today);
  const defaultSlot = {
    dayIndex: todayIndex >= 0 ? todayIndex : 0,
    hour: Math.max(8, Math.min(20, now.getHours())),
  };

  const activeSlot = focusedSlot ?? defaultSlot;

  // Scroll to current hour on initial Day or Week render
  useEffect(() => {
    if (!initialViewResolved) return;
    if ((view === "Day" || view === "Week") && !hasScrolledTime.current) {
      const container = calendarScrollRef.current;
      if (container) {
        const targetHour = Math.max(0, now.getHours() - 1);
        container.scrollTop = targetHour * 60;
        hasScrolledTime.current = true;
      }
    }
  }, [initialViewResolved, now, view]);

  function handleSlotKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    dayIdx: number,
    hour: number,
    dayDateStr: string,
  ) {
    let nextDay = dayIdx;
    let nextHour = hour;
    let handled = false;

    switch (e.key) {
      case "ArrowDown":
        nextHour = Math.min(23, hour + 1);
        handled = true;
        break;
      case "ArrowUp":
        nextHour = Math.max(0, hour - 1);
        handled = true;
        break;
      case "ArrowRight":
        nextDay = Math.min(days.length - 1, dayIdx + 1);
        handled = true;
        break;
      case "ArrowLeft":
        nextDay = Math.max(0, dayIdx - 1);
        handled = true;
        break;
      case "Home":
        nextHour = 0;
        handled = true;
        break;
      case "End":
        nextHour = 23;
        handled = true;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setDraft({
          ...blank(dayDateStr),
          start: `${String(hour).padStart(2, "0")}:00`,
          end: hour === 23 ? "23:59" : `${String(hour + 1).padStart(2, "0")}:00`,
        });
        return;
    }

    if (handled) {
      e.preventDefault();
      setFocusedSlot({ dayIndex: nextDay, hour: nextHour });
      const targetId = `cal-slot-${nextDay}-${nextHour}`;
      const el = document.getElementById(targetId);
      el?.focus();
    }
  }
  function edit(event: CalendarEvent) {
    setSelectedDate(event.date);
    setDraft({
      ...blank(event.date),
      ...event,
      allDay: event.allDay ?? !event.start,
    });
    setError("");
    setConfirmDelete(false);
  }
  function createOnDate(date: string) {
    setSelectedDate(date);
    setDraft(blank(date));
    setError("");
    setConfirmDelete(false);
  }
  function close() {
    setDraft(null);
    setError("");
    setConfirmDelete(false);
    addRef.current?.focus();
  }
  function move(direction: number) {
    if (view === "Month")
      setAnchor(
        localDate(
          new Date(date.getFullYear(), date.getMonth() + direction, 1, 12),
        ),
      );
    else
      setAnchor(localDate(addDays(date, direction * (view === "Day" ? 1 : 7))));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.title.trim() || !draft.date) {
      setError("Add a title and date before saving.");
      return;
    }
    if (
      !draft.allDay &&
      (!draft.start || !draft.end || draft.end <= draft.start)
    ) {
      setError("End time must be later than start time on the same day.");
      return;
    }
    const event = {
      ...draft,
      title: draft.title.trim(),
      id: draft.id || crypto.randomUUID(),
    };
    if (mode === "account") {
      const startDate = new Date(`${event.date}T${event.allDay ? "00:00" : event.start}:00`);
      const endDate = event.allDay
        ? new Date(startDate)
        : new Date(`${event.date}T${event.end}:00`);
      if (event.allDay) endDate.setDate(endDate.getDate() + 1);
      try {
        const response = await fetch(event.id && draft.id ? `/api/calendar-events/${event.id}` : "/api/calendar-events", {
          method: event.id && draft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...event,
            startsAt: startDate.toISOString(),
            endsAt: endDate.toISOString(),
          }),
        });
        const result = (await response.json()) as { error?: string; event?: CalendarEvent };
        if (!response.ok || !result.event) throw new Error(result.error || "This event could not be saved.");
        addEvent(result.event);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "This event could not be saved.");
        return;
      }
    } else {
      addEvent(event);
    }
    setStatus(draft.id ? "Event updated." : mode === "account" ? "Event saved to your account." : "Event saved in this browser.");
    close();
  }

  async function deleteEvent(id: string) {
    if (mode === "account") {
      try {
        const response = await fetch(`/api/calendar-events/${id}`, { method: "DELETE" });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "This event could not be deleted.");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "This event could not be deleted.");
        setConfirmDelete(false);
        return;
      }
    }
    removeEvent(id);
    setStatus(mode === "account" ? "Event deleted from your account." : "Event deleted.");
    close();
  }
  function field<K extends keyof CalendarEvent>(
    key: K,
    value: CalendarEvent[K],
  ) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  const label =
    view === "Month"
      ? date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "Day"
        ? date.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  const eventButton = (event: CalendarEvent) => (
    <button
      key={event.id}
      onClick={() => edit(event)}
      type="button"
      className="block w-full truncate rounded-md px-2 py-1 text-left text-xs font-bold text-white"
      style={{ background: event.color || colors[0] }}
      title={`${event.title} · ${event.allDay || !event.start ? "All day" : `${event.start}–${event.end}`}`}
    >
      {event.title}
    </button>
  );
  return (
    <div className="workspace !max-w-[1600px]">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-description">
            Make time for what you want to learn.
          </p>
        </div>
        <div className="segment" aria-label="Calendar view">
          {views.map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => handleViewChange(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAnchor(today)}
          >
            Today
          </Button>
          <button
            aria-label="Previous period"
            className="flex size-11 items-center justify-center"
            onClick={() => move(-1)}
          >
            <CaretLeft />
          </button>
          <button
            aria-label="Next period"
            className="flex size-11 items-center justify-center"
            onClick={() => move(1)}
          >
            <CaretRight />
          </button>
          <h2 className="text-sm font-extrabold">{label}</h2>
        </div>
        <Button
          ref={addRef}
          onClick={() => {
            setDraft(blank(anchor));
            setError("");
            setConfirmDelete(false);
          }}
        >
          <Plus />
          New event
        </Button>
      </div>
      <p
        role="status"
        className="my-2 min-h-5 text-sm text-[var(--text-secondary)]"
      >
        {status || (mode === "account" ? "Events are saved to your account." : "Events are saved only in this browser.")}
      </p>
      <div
        className={`grid items-start gap-5 ${draft ? "xl:grid-cols-[minmax(0,1fr)_310px]" : ""}`}
      >
        <section
          aria-label={`${view} calendar`}
          className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
        >
          {(view === "Day" || view === "Week") && (
            <div ref={calendarScrollRef} className="overflow-auto max-h-[680px]">
              <div style={{ minWidth: view === "Week" ? 620 : 280 }}>
                {view === "Week" && (
                  <p className="sm:hidden px-3 py-1.5 text-xs text-[var(--text-secondary)] bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)]">
                    Swipe horizontally to view all days, or switch to Agenda view.
                  </p>
                )}
                <div
                  className="sticky top-0 z-20 grid bg-[var(--surface-card)]"
                  style={{
                    gridTemplateColumns: `54px repeat(${days.length},minmax(0,1fr))`,
                  }}
                >
                  <div />
                  {days.map((d) => (
                    <div
                      key={localDate(d)}
                      className={`border-b border-l border-[var(--border-subtle)] p-3 text-center ${localDate(d) === today ? "bg-[var(--fetch-blue-50)]" : ""}`}
                    >
                      <p className="text-xs text-[var(--text-secondary)]">
                        {d.toLocaleDateString(undefined, { weekday: "short" })}
                      </p>
                      <p className="mt-1 font-extrabold">
                        {d.getDate()}
                        {localDate(d) === today && (
                          <span className="sr-only"> Today</span>
                        )}
                      </p>
                    </div>
                  ))}
                  <div className="border-b border-[var(--border-subtle)] p-1 text-[10px] text-[var(--text-secondary)]">
                    All day
                  </div>
                  {days.map((d) => (
                    <div
                      key={localDate(d)}
                      className="space-y-1 border-b border-l border-[var(--border-subtle)] p-1"
                    >
                      {events
                        .filter(
                          (e) =>
                            e.date === localDate(d) && (e.allDay || !e.start),
                        )
                        .map(eventButton)}
                    </div>
                  ))}
                </div>
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `54px repeat(${days.length},minmax(0,1fr))`,
                  }}
                >
                  <div>
                    {Array.from({ length: 24 }, (_, h) => (
                      <div
                        key={h}
                        className="h-[60px] pr-2 text-right text-[10px] text-[var(--text-secondary)]"
                      >
                        {h % 12 || 12} {h < 12 ? "AM" : "PM"}
                      </div>
                    ))}
                  </div>
                  {days.map((d, dayIdx) => {
                    const dayEvents = events
                      .filter(
                        (e) => e.date === localDate(d) && !e.allDay && e.start,
                      )
                      .toSorted((a, b) => a.start!.localeCompare(b.start!));
                    return (
                      <div
                        key={localDate(d)}
                        className={`relative border-l border-[var(--border-subtle)] ${localDate(d) === today ? "bg-[var(--fetch-blue-50)]" : ""}`}
                      >
                        {Array.from({ length: 24 }, (_, h) => {
                          const isRoving =
                            activeSlot.dayIndex === dayIdx &&
                            activeSlot.hour === h;
                          return (
                            <button
                              key={h}
                              id={`cal-slot-${dayIdx}-${h}`}
                              tabIndex={isRoving ? 0 : -1}
                              aria-label={`Add event ${localDate(d)} at ${h}:00`}
                              onClick={() =>
                                setDraft({
                                  ...blank(localDate(d)),
                                  start: `${String(h).padStart(2, "0")}:00`,
                                  end:
                                    h === 23
                                      ? "23:59"
                                      : `${String(h + 1).padStart(2, "0")}:00`,
                                })
                              }
                              onKeyDown={(e) =>
                                handleSlotKeyDown(e, dayIdx, h, localDate(d))
                              }
                              onFocus={() =>
                                setFocusedSlot({ dayIndex: dayIdx, hour: h })
                              }
                              className={`block h-[60px] w-full border-t border-[var(--border-subtle)] transition-colors hover:bg-[var(--fetch-blue-100)] focus:z-10 focus:outline-2 focus:outline-[var(--fetch-blue-600)] focus:outline-offset-[-2px] ${
                                isRoving ? "bg-[var(--fetch-blue-50)]/40" : ""
                              }`}
                            />
                          );
                        })}
                        {dayEvents.map((e) => {
                          const position = eventLanes(dayEvents).get(e.id)!;
                          return (
                            <button
                              key={e.id}
                              onClick={() => edit(e)}
                              className="absolute overflow-hidden rounded-md border border-white/40 p-1 text-left text-xs text-white"
                              style={{
                                top: minutes(e.start!),
                                height: Math.max(
                                  22,
                                  minutes(e.end || "23:59") - minutes(e.start!),
                                ),
                                left: `${(position.lane * 100) / position.columns}%`,
                                width: `${100 / position.columns}%`,
                                background: e.color || colors[0],
                              }}
                            >
                              <span className="block truncate font-extrabold">
                                {e.title}
                              </span>
                              <span className="block truncate text-[10px]">
                                {e.start}–{e.end}
                              </span>
                            </button>
                          );
                        })}
                        {localDate(d) === today && (
                          <div
                            role="img" aria-label="Current time"
                            className="pointer-events-none absolute inset-x-0 border-t-2 border-[var(--danger)]"
                            style={{
                              top: now.getHours() * 60 + now.getMinutes(),
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {view === "Month" && (
            <div className="overflow-x-auto">
              <div className="grid min-w-[560px] grid-cols-7">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="p-3 text-center text-xs font-extrabold text-[var(--text-secondary)]"
                  >
                    {d}
                  </div>
                ))}
                {monthDays.map((d) => (
                  <div
                    key={localDate(d)}
                    data-date={localDate(d)}
                    onClick={(event) => {
                      if (!(event.target as HTMLElement).closest("button")) createOnDate(localDate(d));
                    }}
                    className={`calendar-month-cell relative min-h-28 cursor-pointer border-t border-r border-[var(--border-subtle)] p-2 hover:bg-[var(--surface-subtle)] ${localDate(d) === today ? "bg-[var(--fetch-blue-50)]" : ""} ${selectedDate === localDate(d) ? "ring-2 ring-inset ring-[var(--fetch-blue-500)]" : ""}`}
                  >
                    <button
                      aria-label={`Add event on ${localDate(d)}`}
                      type="button"
                      aria-current={localDate(d) === today ? "date" : undefined}
                      onClick={() => createOnDate(localDate(d))}
                      className={`mb-1 flex min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-bold ${d.getMonth() !== date.getMonth() ? "text-[var(--text-tertiary)]" : ""}`}
                    >
                      {d.getDate()}
                    </button>
                    <div className="space-y-1">
                      {events
                        .filter((e) => e.date === localDate(d))
                        .map(eventButton)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {view === "Agenda" && (
            <div className="p-5">
              <h3 className="font-display text-xl font-semibold">
                Upcoming from {date.toLocaleDateString()}
              </h3>
              {events.filter((e) => e.date >= anchor).length ? (
                events
                  .filter((e) => e.date >= anchor)
                  .toSorted((a, b) =>
                    (a.date + (a.start || "")).localeCompare(
                      b.date + (b.start || ""),
                    ),
                  )
                  .map((e) => (
                    <button
                      key={e.id}
                      aria-label={e.title}
                      onClick={() => edit(e)}
                      className="flex w-full items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-4 text-left"
                    >
                      <span aria-hidden="true">
                        <strong className="block">{e.title}</strong>
                        <span className="text-sm text-[var(--text-secondary)]">
                          {asDate(e.date).toLocaleDateString()} ·{" "}
                          {e.allDay || !e.start
                            ? "All day"
                            : `${e.start}–${e.end}`}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-xs capitalize">{e.type}</span>
                    </button>
                  ))
              ) : (
                <p className="py-16 text-center text-[var(--text-secondary)]">
                  No upcoming events. Plan your next study session.
                </p>
              )}
            </div>
          )}
        </section>
        <Dialog.Root
          open={!!draft}
          modal={compact}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          {draft && (
            <Dialog.Content
              asChild
              aria-describedby={undefined}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                titleRef.current?.focus();
              }}
            >
              <aside
                className="surface-card fixed inset-x-2 sm:inset-x-4 top-16 sm:top-20 bottom-2 z-40 flex flex-col overflow-hidden rounded-2xl p-0 shadow-2xl xl:static xl:max-h-[760px] xl:shadow-none"
                aria-label="Event editor"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] p-5">
                  <Dialog.Title className="font-display text-xl font-semibold">
                    {draft.id ? "Edit event" : "New event"}
                  </Dialog.Title>
                  <button
                    onClick={close}
                    aria-label="Close event editor"
                    className="flex size-11 items-center justify-center rounded-lg hover:bg-[var(--surface-subtle)]"
                  >
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
                  <div className="flex-1 space-y-4 overflow-y-auto p-5">
                    <label className="field-label">
                      Event type
                      <select
                        className="field"
                        value={draft.type}
                        onChange={(e) =>
                          field("type", e.target.value as CalendarEvent["type"])
                        }
                      >
                        <option value="exam">Exam</option>
                        <option value="study">Study</option>
                        <option value="deadline">Deadline</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Title
                      <input
                        ref={titleRef}
                        required
                        maxLength={100}
                        className="field"
                        value={draft.title}
                        onChange={(e) => field("title", e.target.value)}
                        placeholder="e.g. Biology review"
                      />
                    </label>
                    <fieldset>
                      <legend className="field-label">Color</legend>
                      <div className="mt-2 flex gap-2">
                        {colors.map((c, i) => (
                          <button
                            type="button"
                            key={c}
                            aria-label={`Color ${["blue", "purple", "green", "orange", "pink"][i]}`}
                            aria-pressed={draft.color === c}
                            onClick={() => field("color", c)}
                            className="size-9 rounded-full border-4 border-[var(--surface-card)] text-white outline outline-1 outline-[var(--border-strong)]"
                            style={{ background: c }}
                          >
                            {draft.color === c ? "✓" : ""}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <label className="field-label">
                      Date
                      <input
                        type="date"
                        required
                        className="field"
                        value={draft.date}
                        onChange={(e) => field("date", e.target.value)}
                      />
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={!!draft.allDay}
                        onChange={(e) => field("allDay", e.target.checked)}
                      />
                      All day
                    </label>
                    {!draft.allDay && (
                      <div className="grid grid-cols-2 gap-3">
                        <label className="field-label">
                          Start
                          <input
                            type="time"
                            required
                            className="field"
                            value={draft.start}
                            onChange={(e) => field("start", e.target.value)}
                          />
                        </label>
                        <label className="field-label">
                          End
                          <input
                            type="time"
                            required
                            className="field"
                            value={draft.end}
                            onChange={(e) => field("end", e.target.value)}
                          />
                        </label>
                      </div>
                    )}
                    <label className="field-label">
                      Subject / course
                      <input
                        className="field"
                        value={draft.subject}
                        onChange={(e) => field("subject", e.target.value)}
                        maxLength={100}
                      />
                    </label>
                    <label className="field-label">
                      Location
                      <input
                        className="field"
                        value={draft.location}
                        onChange={(e) => field("location", e.target.value)}
                        maxLength={150}
                      />
                    </label>
                    <label className="field-label">
                      Link a StudyPack
                      <select
                        className="field"
                        value={draft.packId}
                        onChange={(e) => field("packId", e.target.value)}
                      >
                        <option value="">
                          {packs.length
                            ? "No StudyPack linked"
                            : "No StudyPacks yet"}
                        </option>
                        {packs.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {error && (
                      <p
                        role="alert"
                        className="text-sm font-bold text-[var(--danger)]"
                      >
                        {error}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="flex flex-col gap-2">
                      <Button type="submit" className="w-full">
                        Save event
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={close}
                      >
                        Cancel
                      </Button>
                      {draft.id &&
                        (confirmDelete ? (
                          <div className="notice mt-2">
                            <p>Delete this event? This cannot be undone.</p>
                            <Button
                              type="button"
                              variant="secondary"
                              className="mt-3 w-full"
                              onClick={() => {
                                void deleteEvent(draft.id);
                              }}
                            >
                              Confirm delete
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="min-h-11 w-full text-sm font-bold text-[var(--danger)]"
                          >
                            Delete event
                          </button>
                        ))}
                    </div>
                  </div>
                </form>
              </aside>
            </Dialog.Content>
          )}
        </Dialog.Root>
      </div>
    </div>
  );
}
