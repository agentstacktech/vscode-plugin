import { describe, expect, it } from "vitest";
import { formatProjectsList } from "./projectFormatters";

describe("projectFormatters", () => {
  it("formatProjectsList includes count", () => {
    const md = formatProjectsList([{ project_id: 1, name: "A" }], 1);
    expect(md).toContain("A");
    expect(md).toContain("1");
  });
});
