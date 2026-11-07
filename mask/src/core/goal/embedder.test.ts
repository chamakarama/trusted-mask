import { describe, expect, it } from "vitest";
import { HASHED_BOW_DIMS, HASHED_BOW_MODEL, cosine, fnv1a32, hashedBowEmbed, hashedBowFeatures } from "./embedder";
import { createGoalEmbedder } from "./index";

describe("hashed-bow-v1 embedder", () => {
  it("FNV-1a 32 matches reference values", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("features are lowercase unicode tokens plus bigrams", () => {
    expect(hashedBowFeatures("Päivystys ED-load, 2025!")).toEqual(["päivystys", "ed", "load", "2025", "päivystys ed", "ed load", "load 2025"]);
  });

  it("is deterministic and L2-normalised", async () => {
    const e = await createGoalEmbedder();
    expect(e).not.toBeNull();
    expect(e!.model).toBe(HASHED_BOW_MODEL);
    expect(e!.dims).toBe(256);
    const a = await e!.embed("Find contact reason trends with our cloud AI vendor");
    const b = await e!.embed("Find contact reason trends with our cloud AI vendor");
    expect(a).toEqual(b);
    expect(a).toHaveLength(HASHED_BOW_DIMS);
    expect(Math.sqrt(a.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 10);
  });

  it("is case and whitespace insensitive; empty text gives a zero vector", () => {
    expect(hashedBowEmbed("Topic   MINING")).toEqual(hashedBowEmbed("topic mining"));
    expect(hashedBowEmbed("").every((x) => x === 0)).toBe(true);
  });

  it("similar goals are closer than unrelated ones", () => {
    const a = hashedBowEmbed("contact reason trends for an external vendor");
    const b = hashedBowEmbed("contact reason trends with the vendor");
    const c = hashedBowEmbed("publish weekly electricity load per postcode");
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });
});
