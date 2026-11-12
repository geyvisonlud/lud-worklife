import { describe, expect, it } from "vitest";
import { calendarAuthorizeUrl, mapCalendar, mapEvent, taskEventBody } from "./google";

describe("Google mapping", () => {
  it("maps a calendar list entry", () => {
    const c = mapCalendar({ id: "abc@group.calendar.google.com", summary: "Church", colorId: "13", backgroundColor: "#92e1c0", accessRole: "owner", selected: false });
    expect(c).toMatchObject({ name: "Church", color: "#33b679", canWrite: true, primary: false, visibleByDefault: false });
    expect(mapCalendar({ id: "x", summary: "Holidays", summaryOverride: "US holidays", accessRole: "reader" })).toMatchObject({ name: "US holidays", canWrite: false, visibleByDefault: true });
  });
  it("maps timed events", () => {
    const e = mapEvent({
      id: "1",
      summary: "Standup",
      start: { dateTime: "2026-11-05T09:30:00-05:00" },
      end: { dateTime: "2026-11-05T09:45:00-05:00" },
      colorId: "5",
      hangoutLink: "https://meet.google.com/x",
      attendees: [{ self: true, responseStatus: "accepted" }],
    })!;
    expect(e.start.toISOString()).toBe("2026-11-05T14:30:00.000Z");
    expect(e.allDay).toBe(false);
    expect(e.color).toBe("#f6bf26");
    expect(e.meetLink).toBe("https://meet.google.com/x");
    expect(e.responseStatus).toBe("accepted");
  });
  it("maps all-day events to UTC midnight dates", () => {
    const e = mapEvent({ id: "2", start: { date: "2026-11-26" }, end: { date: "2026-11-27" } })!;
    expect(e.allDay).toBe(true);
    expect(e.title).toBe("(No title)");
    expect(e.start.toISOString().slice(0, 10)).toBe("2026-11-26");
    expect(e.end.toISOString().slice(0, 10)).toBe("2026-11-27");
  });
  it("skips cancelled, working-location and our own task events", () => {
    expect(mapEvent({ id: "3", status: "cancelled", start: { date: "2026-11-01" }, end: { date: "2026-11-02" } })).toBeNull();
    expect(mapEvent({ id: "4", eventType: "workingLocation", start: { date: "2026-11-01" }, end: { date: "2026-11-02" } })).toBeNull();
    expect(mapEvent({ id: "5", start: { date: "2026-11-01" }, end: { date: "2026-11-02" }, extendedProperties: { private: { ludTaskId: "t1" } } })).toBeNull();
  });
  it("builds the task event body", () => {
    const b = taskEventBody({ id: "t1", title: "Write spec", start: new Date("2026-11-05T15:00:00Z"), durationMin: 45 }, "https://app.example.com/");
    expect(b.end.dateTime).toBe("2026-11-05T15:45:00.000Z");
    expect(b.extendedProperties.private.ludTaskId).toBe("t1");
    expect(b.description).toContain("https://app.example.com/tasks?task=t1");
  });
  it("asks for offline access and account choice", () => {
    const u = new URL(calendarAuthorizeUrl({ clientId: "id", redirectUri: "https://x/api/google/callback", state: "s" }));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toContain("consent");
    expect(u.searchParams.get("scope")).toContain("calendar.events");
  });
});
