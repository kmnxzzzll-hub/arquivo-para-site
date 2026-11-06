import { describe, it, expect } from "vitest";
import { theoreticalProbabilities, analyse, winnerFromSums, wilson, percentageTenths, randomDemoOutcome } from "./stats";

describe("motor estatístico", () => {
  it("sorteia vermelho, azul e empate sem alterar as probabilidades", () => {
    const probabilities = theoreticalProbabilities();
    const before = { ...probabilities };
    expect(randomDemoOutcome(() => 0)).toBe("banker");
    expect(randomDemoOutcome(() => 0.5)).toBe("player");
    expect(randomDemoOutcome(() => 0.99)).toBe("tie");
    expect(probabilities).toEqual(before);
  });
  it("permite novas cores em gerações consecutivas", () => {
    const samples = [0.1, 0.4, 0.8, 0.5];
    expect(samples.map((sample) => randomDemoOutcome(() => sample))).toEqual(["banker", "player", "tie", "player"]);
  });
  it("percentagens apresentadas somam exatamente 100% em várias distribuições", () => {
    for (const values of [theoreticalProbabilities(), analyse(["banker", "player", "banker"]).estimate, { player: 0.3333, tie: 0.3333, banker: 0.3334 }]) {
      const t = percentageTenths(values);
      expect(t.player + t.tie + t.banker).toBe(1000);
    }
  });
  it("mantém empate inferior a ambos os lados na distribuição teórica", () => {
    const t = percentageTenths(theoreticalProbabilities());
    expect(t.tie).toBeLessThan(t.player);
    expect(t.tie).toBeLessThan(t.banker);
  });
  it("não altera dados observados para obrigar o empate a ser menor", () => {
    expect(percentageTenths({ player: 0.1, tie: 0.8, banker: 0.1 })).toEqual({ player: 100, tie: 800, banker: 100 });
  });
  it("probabilidade teórica de empate é 146/1296", () => {
    expect(theoreticalProbabilities().tie).toBeCloseTo(146 / 1296, 10);
  });
  it("jogador e banco têm a mesma probabilidade teórica", () => {
    const t = theoreticalProbabilities();
    expect(t.player).toBeCloseTo(575 / 1296, 10);
    expect(t.banker).toBeCloseTo(575 / 1296, 10);
  });
  it("estimativas somam 100%", () => {
    const a = analyse(["player", "player", "tie", "banker", "banker", "banker"]);
    expect(a.estimate.player + a.estimate.tie + a.estimate.banker).toBeCloseTo(1, 10);
    expect(a.observed.banker).toBeCloseTo(0.5, 10);
  });
  it("vencedor pela soma maior", () => {
    expect(winnerFromSums(9, 4)).toBe("player");
    expect(winnerFromSums(7, 7)).toBe("tie");
    expect(winnerFromSums(3, 11)).toBe("banker");
  });
  it("intervalo de Wilson contém a proporção", () => {
    const [lo, hi] = wilson(30, 100);
    expect(lo).toBeLessThan(0.3);
    expect(hi).toBeGreaterThan(0.3);
  });
});

import { leadingSide, validTenths } from "./stats";
describe("leadingSide", () => {
  it("destaca vermelho quando maior", () => expect(leadingSide({ banker: 0.46, player: 0.43, tie: 0.11 })).toBe("banker"));
  it("destaca azul quando maior", () => expect(leadingSide({ banker: 0.4, player: 0.5, tie: 0.1 })).toBe("player"));
  it("igualdade não destaca ninguém, mesmo com empate alto", () => expect(leadingSide({ banker: 0.3, player: 0.3, tie: 0.4 })).toBeNull());
});
describe("validTenths", () => {
  it("aceita soma 1000", () => expect(validTenths({ banker: 444, player: 443, tie: 113 })).toBe(true));
  it("rejeita soma errada e NaN", () => {
    expect(validTenths({ banker: 444, player: 444, tie: 113 })).toBe(false);
    expect(validTenths({ banker: NaN, player: 500, tie: 500 })).toBe(false);
  });
});

import { strategySequence as seq, strategySignals as sig } from "./stats";
describe("estratégias", () => {
  it("alternância", () => expect(seq("alternancia", "banker", 4)).toEqual(["banker", "player", "banker", "player"]));
  it("2X", () => expect(seq("2x", "player", 5)).toEqual(["player", "player", "banker", "banker", "player"]));
  it("3X", () => expect(seq("3x", "banker", 6)).toEqual(["banker", "banker", "banker", "player", "player", "player"]));
  it("sorteio usa estratégia e cor", () => { const r = sig(4, () => 0.9); expect(r.strategy).toBe("3x"); expect(r.signals).toEqual(["player", "player", "player", "banker"]); });
});

import { percentageInts, pickWinner, simulatedFrequencies } from "./stats";
describe("resultado final e inteiros", () => {
  it("inteiros somam 100", () => {
    for (const v of [theoreticalProbabilities(), { player: 1/3, tie: 1/3, banker: 1/3 }, simulatedFrequencies(200)]) {
      const r = percentageInts(v);
      expect(r.player + r.tie + r.banker).toBe(100);
      expect([r.player, r.tie, r.banker].every(Number.isInteger)).toBe(true);
    }
  });
  it("vencedor nunca é empate", () => {
    expect(pickWinner({ banker: 0.1, player: 0.1, tie: 0.8 }, () => 0.1)).toBe("banker");
    expect(pickWinner({ banker: 0.1, player: 0.1, tie: 0.8 }, () => 0.9)).toBe("player");
    expect(pickWinner({ banker: 0.4, player: 0.5, tie: 0.1 })).toBe("player");
  });
});

describe("variação da simulação", () => {
  it("amostras curtas variam fora da faixa dos 40% e somam sempre 100", () => {
    const reds: number[] = [];
    for (let i = 0; i < 300; i++) {
      const r = percentageInts(simulatedFrequencies(20));
      expect(r.player + r.tie + r.banker).toBe(100);
      reds.push(r.banker);
    }
    expect(Math.min(...reds)).toBeLessThan(30);
    expect(Math.max(...reds)).toBeGreaterThan(60);
  });
});

import { strategyConfidence, strategyPredict } from "./stats";
describe("strategyConfidence", () => {
  it("prevê pelas regras das estratégias", () => {
    expect(strategyPredict("alternancia", ["banker"])).toBe("player");
    expect(strategyPredict("2x", ["player", "banker", "banker"])).toBe("player");
    expect(strategyPredict("3x", ["banker", "banker"])).toBe("banker");
  });
  it("concordância total dá confirmação alta e soma 1", () => {
    const h = Array.from({ length: 60 }, (_, i) => (i % 2 ? "banker" : "player")) as any;
    const c = strategyConfidence(h);
    expect(c.banker + c.player + c.tie).toBeCloseTo(1);
    expect(Math.max(c.banker, c.player)).toBeGreaterThan(0.6);
  });
});
