import { describe, expect, it } from "vitest";
import type { Outcome } from "./stats";
import { isValidSocketUrl, lastRounds, parseRoadMessage, roadCounts, winnerToOutcome } from "./road";

describe("trend map / WebSocket road", () => {
  it("maps Player to blue (player), Banker to red (banker) and Tie to tie", () => {
    expect(winnerToOutcome("Player")).toBe("player");
    expect(winnerToOutcome("Banker")).toBe("banker");
    expect(winnerToOutcome("Tie")).toBe("tie");
    expect(winnerToOutcome("other")).toBeNull();
  });

  it("parses a bacbo.road message with stats and history", () => {
    const msg = JSON.stringify({
      id: "1", type: "bacbo.road",
      args: { stats: { playerWins: 54, bankerWins: 40, ties: 6 }, history: [{ winner: "Player" }, { winner: "Banker" }, { winner: "Tie" }] },
    });
    const r = parseRoadMessage(msg);
    expect(r?.stats).toEqual({ player: 54, banker: 40, tie: 6 });
    expect(r?.history).toEqual(["player", "banker", "tie"]);
  });

  it("ignores other events and invalid JSON", () => {
    expect(parseRoadMessage(JSON.stringify({ type: "metrics.pong", args: {} }))).toBeNull();
    expect(parseRoadMessage("not json")).toBeNull();
  });

  it("falls back to counting history when stats are missing", () => {
    const r = parseRoadMessage({ type: "bacbo.road", args: { history: [{ winner: "Banker" }, { winner: "Banker" }] } });
    expect(r?.stats).toEqual({ player: 0, banker: 2, tie: 0 });
  });

  it("keeps only the last 40 rounds, newest last", () => {
    const h: Outcome[] = Array.from({ length: 50 }, (_, i) => (i === 49 ? "tie" : "banker"));
    const last = lastRounds(h);
    expect(last).toHaveLength(40);
    expect(last.at(-1)).toBe("tie");
    expect(roadCounts(last)).toEqual({ banker: 39, player: 0, tie: 1 });
  });

  it("only accepts secure wss:// URLs", () => {
    expect(isValidSocketUrl("wss://example.com/socket?x=1")).toBe(true);
    expect(isValidSocketUrl("ws://example.com")).toBe(false);
    expect(isValidSocketUrl("https://example.com")).toBe(false);
  });
});
