import { describe, expect, it } from "vitest";
import { allowedEmails, checkState, createSessionToken, signState, verifySessionToken } from "./auth";

describe("auth", () => {
  it("round-trips a session and rejects tampering", async () => {
    const t = await createSessionToken("Geyvison|me@example.com");
    expect(await verifySessionToken(t)).toBe("Geyvison|me@example.com");
    expect(await verifySessionToken(t.slice(0, -1) + (t.endsWith("a") ? "b" : "a"))).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });
  it("signs OAuth state per purpose", async () => {
    const s = await signState("google");
    expect(await checkState(s, "google")).toBe(true);
    expect(await checkState(s, "notion")).toBe(false);
    expect(await checkState(null, "google")).toBe(false);
  });
  it("parses the allowlist", () => {
    expect(allowedEmails(" A@x.com, b@y.com ,")).toEqual(["a@x.com", "b@y.com"]);
  });
});
