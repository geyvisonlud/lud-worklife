import { describe, expect, it } from "vitest";
import { googleCalendarColor, googleEventColor, readableOn } from "./colors";

describe("Google colors", () => {
  it("translates the API's legacy swatches to what Google Calendar shows", () => {
    expect(googleCalendarColor({ colorId: "14", backgroundColor: "#9fe1e7" })).toBe("#039be5"); // Peacock
    expect(googleCalendarColor({ colorId: "8", backgroundColor: "#16A765" })).toBe("#0b8043"); // Basil
    expect(googleCalendarColor({ colorId: "17", backgroundColor: "#9a9cff" })).toBe("#7986cb"); // Lavender
  });
  it("keeps custom colors", () => {
    expect(googleCalendarColor({ colorId: "14", backgroundColor: "#ff00aa" })).toBe("#ff00aa");
  });
  it("falls back to the colorId or Peacock", () => {
    expect(googleCalendarColor({ colorId: "3" })).toBe("#d50000");
    expect(googleCalendarColor({})).toBe("#039be5");
  });
  it("event colors", () => {
    expect(googleEventColor("11")).toBe("#d50000");
    expect(googleEventColor(undefined)).toBeNull();
  });
  it("readable text", () => {
    expect(readableOn("#f6bf26")).toBe("#151513");
    expect(readableOn("#3f51b5")).toBe("#ffffff");
  });
});
