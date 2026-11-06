import { describe, expect, it } from "vitest";
import type { Outcome } from "./stats";
import { diagnoseSocketUrl, isValidSocketUrl, lastRounds, parseKickout, parseRoadMessage, roadCounts, winnerToOutcome } from "./road";

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

  const base = "wss://5dhbt5lk.example.link/public/bacbo/player/game/PorBacBo00000001/socket?messageFormat=json&tableConfig=abc";
  const realSession = "twmi4gabfh5qsguxugxg7ellcgqbdmmqcd01575a635d827f720bb3f9b2d305b6a698411e286c8dca";

  it("accepts a complete table address with a real EVOSESSIONID", () => {
    expect(diagnoseSocketUrl(`${base}&EVOSESSIONID=${realSession}&instance=x`)).toEqual([]);
  });

  it("flags the misspelled EVOSSESSIONID parameter", () => {
    const p = diagnoseSocketUrl(`${base}&EVOSSESSIONID=${realSession}`);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("misspelled");
  });

  it("flags a placeholder session such as [TOKEN DE SESSÃO]", () => {
    const p = diagnoseSocketUrl(`${base}&EVOSESSIONID=${encodeURIComponent("[TOKEN DE SESSÃO]")}`);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("placeholder");
  });

  it("flags a missing session and a non-wss address", () => {
    expect(diagnoseSocketUrl(base)[0]).toContain("missing");
    expect(diagnoseSocketUrl(`https://x.link/socket?EVOSESSIONID=${realSession}`)[0]).toContain("wss://");
  });

  it("reads the kickout reason sent when the casino rejects the session", () => {
    expect(parseKickout(JSON.stringify({ type: "connection.kickout", args: { reason: "notAuthorised" } }))).toBe("notAuthorised");
    expect(parseKickout(JSON.stringify({ type: "bacbo.road", args: {} }))).toBeNull();
  });
});
