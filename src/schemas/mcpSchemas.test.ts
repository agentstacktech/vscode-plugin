import { describe, expect, it } from "vitest";
import { parseProjectsResponse } from "./mcpSchemas";

describe("mcpSchemas", () => {
  it("parseProjectsResponse accepts valid payload", () => {
    const r = parseProjectsResponse({ projects: [{ project_id: 1, name: "A" }], count: 1 });
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.projects).toHaveLength(1);
      expect(r.count).toBe(1);
    }
  });

  it("parseProjectsResponse rejects invalid payload", () => {
    const r = parseProjectsResponse({ projects: "not-array" });
    expect("error" in r).toBe(true);
  });
});
