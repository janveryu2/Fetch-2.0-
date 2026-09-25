import type { CalendarEvent } from "./demo-types";
export const timeMinutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
/** Allocate lanes per connected overlap group, including chained overlaps. */
export function eventLanes(events: CalendarEvent[]) {
  const result = new Map<string, { lane: number; columns: number }>();
  const sorted = events.toSorted(
    (a, b) => timeMinutes(a.start!) - timeMinutes(b.start!),
  );
  let group: CalendarEvent[] = [];
  let end = -1;
  function flush() {
    const laneEnds: number[] = [];
    const lanes = new Map<string, number>();
    for (const e of group) {
      let lane = laneEnds.findIndex((n) => n <= timeMinutes(e.start!));
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = timeMinutes(e.end || "23:59");
      lanes.set(e.id, lane);
    }
    for (const e of group)
      result.set(e.id, { lane: lanes.get(e.id)!, columns: laneEnds.length });
  }
  for (const event of sorted) {
    const start = timeMinutes(event.start!);
    if (start >= end && group.length) {
      flush();
      group = [];
      end = -1;
    }
    group.push(event);
    end = Math.max(end, timeMinutes(event.end || "23:59"));
  }
  flush();
  return result;
}
