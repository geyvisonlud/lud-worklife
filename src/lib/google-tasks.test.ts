import { describe, expect, it } from "vitest";
import { applyRemote, friendlyGoogleError, googleTaskBody, hasTasksScope, mapGoogleTask, TASKS_SCOPE } from "./google-tasks";

describe("Google Tasks", () => {
  it("knows the scope", () => {
    expect(hasTasksScope(`openid ${TASKS_SCOPE}`)).toBe(true);
    expect(hasTasksScope("openid https://www.googleapis.com/auth/tasks.readonly")).toBe(false);
    expect(hasTasksScope(null)).toBe(false);
  });
  it("maps a Google task", () => {
    const r = mapGoogleTask({ id: "a", title: " Send slides ", notes: "  ", due: "2026-11-09T00:00:00.000Z", status: "needsAction", updated: "2026-11-06T20:00:00.000Z" });
    expect(r).toMatchObject({ externalId: "a", title: "Send slides", notes: null, dueDate: "2026-11-09", done: false, deleted: false });
    expect(r.updated.toISOString()).toBe("2026-11-06T20:00:00.000Z");
    expect(mapGoogleTask({ id: "b", status: "completed", completed: "2026-11-05T10:00:00.000Z", deleted: true })).toMatchObject({ done: true, deleted: true, dueDate: null });
  });
  it("builds the body sent to Google", () => {
    expect(googleTaskBody({ title: "Call", notes: null, dueDate: "2026-11-10", status: "doing" })).toEqual({ title: "Call", notes: null, due: "2026-11-10T00:00:00.000Z", status: "needsAction", completed: null });
    const at = new Date("2026-11-06T12:00:00Z");
    expect(googleTaskBody({ title: "Call", notes: "n", dueDate: null, status: "done", completedAt: at })).toMatchObject({ status: "completed", completed: at.toISOString(), due: null });
  });
  it("applies changes made in Google", () => {
    const local = { title: "Call", notes: null, dueDate: null, status: "doing" };
    const now = new Date("2026-11-06T12:00:00Z");
    expect(applyRemote(local, mapGoogleTask({ id: "a", title: "Call", status: "needsAction" }), now)).toEqual({});
    expect(applyRemote(local, mapGoogleTask({ id: "a", title: "Call Ana", due: "2026-11-08T00:00:00.000Z", status: "completed" }), now)).toEqual({
      title: "Call Ana",
      dueDate: "2026-11-08",
      status: "done",
      completedAt: now,
    });
    expect(applyRemote({ ...local, status: "done" }, mapGoogleTask({ id: "a", title: "Call", status: "needsAction" }))).toEqual({ status: "todo", completedAt: null });
    // An empty title in Google never blanks the task here.
    expect(applyRemote(local, mapGoogleTask({ id: "a", title: "", status: "needsAction" }))).toEqual({});
  });
  it("explains disabled APIs", () => {
    const raw = "Google Calendar API has not been used in project 98843220895 before or it is disabled. Enable it by visiting https://console…";
    expect(friendlyGoogleError(raw)).toBe("Google Calendar API is turned off in your Google Cloud project (98843220895). Enable it there, wait a few minutes and sync again.");
    expect(friendlyGoogleError("Tasks API has not been used in project 1 before or it is disabled.")).toMatch(/^Tasks API is turned off/);
    expect(friendlyGoogleError("Other")).toBe("Other");
  });
});
