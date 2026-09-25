import { describe, expect, it } from "vitest";
import { buildStudyPacksQuery, parseStudyPacksParams } from "@/lib/study-packs-url";

describe("parseStudyPacksParams", () => {
  it("defaults to empty query and 'created' sort for empty params", () => {
    expect(parseStudyPacksParams("")).toEqual({ q: "", sort: "created" });
    expect(parseStudyPacksParams(null)).toEqual({ q: "", sort: "created" });
    expect(parseStudyPacksParams(undefined)).toEqual({ q: "", sort: "created" });
  });

  it("parses valid q and sort parameters from URLSearchParams", () => {
    const params = new URLSearchParams("q=biology&sort=studied");
    expect(parseStudyPacksParams(params)).toEqual({
      q: "biology",
      sort: "studied",
    });
  });

  it("falls back to 'created' sort for unknown sort values", () => {
    const params = new URLSearchParams("q=chem&sort=invalid_sort");
    expect(parseStudyPacksParams(params)).toEqual({
      q: "chem",
      sort: "created",
    });
  });

  it("parses from object format", () => {
    expect(parseStudyPacksParams({ q: "math", sort: "studied" })).toEqual({
      q: "math",
      sort: "studied",
    });
  });
});

describe("buildStudyPacksQuery", () => {
  it("returns empty string when defaults are used", () => {
    expect(buildStudyPacksQuery("", "created")).toBe("");
  });

  it("includes q when non-empty", () => {
    expect(buildStudyPacksQuery("biology", "created")).toBe("?q=biology");
  });

  it("includes sort when 'studied'", () => {
    expect(buildStudyPacksQuery("", "studied")).toBe("?sort=studied");
  });

  it("includes both q and sort when both are non-default", () => {
    expect(buildStudyPacksQuery("biology", "studied")).toBe("?q=biology&sort=studied");
  });
});
