import { describe, expect, it } from "vitest";
import {
  buildLayout,
  cardKey,
  columnKey,
  columnOfOver,
  describePlacement,
  findColumnOf,
  parseCardKey,
  parseColumnKey,
  planMove,
  previewLayout,
  sameOrder,
  stepLayout,
} from "./dnd"; 
import type { Layout } from "./dnd";
import { makeCard, makeColumn } from "./test/factories";

const layout: Layout = { 1: [10, 11, 12], 2: [20], 3: [] };

describe("keys", () => {
  it("parses its own prefixes", () => {
    expect(parseCardKey("card-12")).toBe(12);
    expect(parseColumnKey("column-3")).toBe(3);
    expect(parseCardKey(cardKey(7))).toBe(7);
    expect(parseColumnKey(columnKey(8))).toBe(8);
  });

  it("rejects other prefixes and junk", () => {
    expect(parseCardKey("column-3")).toBeNull();
    expect(parseColumnKey("card-3")).toBeNull();
    expect(parseCardKey("card-")).toBeNull();
    expect(parseCardKey("card-abc")).toBeNull();
    expect(parseCardKey(12)).toBeNull();
  });
});

describe("layout helpers", () => {
  it("buildLayout maps column ids to ordered card ids", () => {
    const columns = [makeColumn(1, [makeCard(10, 1), makeCard(11, 1)]), makeColumn(2)];
    expect(buildLayout(columns)).toEqual({ 1: [10, 11], 2: [] });
  });

  it("findColumnOf finds the column holding a card", () => {
    expect(findColumnOf(layout, 20)).toBe(2);
    expect(findColumnOf(layout, 999)).toBeNull();
  });

  it("columnOfOver resolves cards and columns, and rejects unknown ones", () => {
    expect(columnOfOver(layout, "card-20")).toBe(2);
    expect(columnOfOver(layout, "column-3")).toBe(3);
    expect(columnOfOver(layout, "card-999")).toBeNull();
    expect(columnOfOver(layout, "column-99")).toBeNull();
    expect(columnOfOver(layout, "junk")).toBeNull();
  });

  it("sameOrder compares order, not just contents", () => {
    expect(sameOrder([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(sameOrder([1, 2, 3], [1, 3, 2])).toBe(false);
    expect(sameOrder([1, 2], [1, 2, 3])).toBe(false);
  });
});

describe("previewLayout", () => {
  it("moves the card above the hovered card in another column", () => {
    expect(previewLayout(layout, 10, "card-20", false)).toEqual({ 1: [11, 12], 2: [10, 20], 3: [] });
  });

  it("moves it below when the pointer is in the lower half", () => {
    expect(previewLayout(layout, 10, "card-20", true)).toEqual({ 1: [11, 12], 2: [20, 10], 3: [] });
  });

  it("puts the card into an empty column", () => {
    expect(previewLayout(layout, 10, "column-3", false)).toEqual({ 1: [11, 12], 2: [20], 3: [10] });
  });

  it("appends when hovering a column's body instead of a card", () => {
    expect(previewLayout(layout, 10, "column-2", false)).toEqual({ 1: [11, 12], 2: [20, 10], 3: [] });
  });

  it("returns null while still over its own column", () => {
    expect(previewLayout(layout, 10, "card-11", false)).toBeNull();
    expect(previewLayout(layout, 10, "column-1", false)).toBeNull();
  });

  it("returns null for unknown targets", () => {
    expect(previewLayout(layout, 10, "card-999", false)).toBeNull();
    expect(previewLayout(layout, 10, "column-99", false)).toBeNull();
  });

  it("never mutates the layout it's given", () => {
    const before = JSON.parse(JSON.stringify(layout)) as Layout;
    previewLayout(layout, 10, "card-20", false);
    expect(layout).toEqual(before);
  });
});

describe("planMove", () => {
  const start: Layout = { 1: [10, 11, 12], 2: [20], 3: [] };

  it("plans a reorder inside a column", () => {
    expect(planMove(start, start, 10, "card-12")).toEqual({
      columnId: 1,
      ids: [11, 12, 10],
      beforeId: 12,
      afterId: null,
    });
  });

  it("plans a move to the top", () => {
    expect(planMove(start, start, 12, "card-10")).toEqual({
      columnId: 1,
      ids: [12, 10, 11],
      beforeId: null,
      afterId: 10,
    });
  });

  it("returns null when the card is dropped where it started", () => {
    expect(planMove(start, start, 10, "card-10")).toBeNull();
  });

  it("keeps the previewed position for a cross-column move", () => {
    const previewed: Layout = { 1: [11, 12], 2: [10, 20], 3: [] };
    expect(planMove(start, previewed, 10, "card-10")).toEqual({
      columnId: 2,
      ids: [10, 20],
      beforeId: null,
      afterId: 20,
    });
  });

  it("plans a move into an empty column", () => {
    const previewed: Layout = { 1: [11, 12], 2: [20], 3: [10] };
    expect(planMove(start, previewed, 10, "column-3")).toEqual({
      columnId: 3,
      ids: [10],
      beforeId: null,
      afterId: null,
    });
  });

  it("returns null for a card that isn't in the layout", () => {
    expect(planMove(start, start, 999, "card-10")).toBeNull();
  });

  it("ignores a target card that lives in another column", () => {
    expect(planMove(start, start, 10, "card-20")).toBeNull();
  });
});
describe("stepLayout", () => {
  const columnIds = [1, 2, 3];
  const wide: Layout = { 1: [10, 11, 12], 2: [20, 21], 3: [] };

  it("moves down within a column", () => {
    expect(stepLayout(wide, columnIds, 10, "down")).toEqual({ 1: [11, 10, 12], 2: [20, 21], 3: [] });
  });

  it("moves up within a column", () => {
    expect(stepLayout(wide, columnIds, 12, "up")).toEqual({ 1: [10, 12, 11], 2: [20, 21], 3: [] });
  });

  it("stops at the top and bottom of a column", () => {
    expect(stepLayout(wide, columnIds, 10, "up")).toBeNull();
    expect(stepLayout(wide, columnIds, 12, "down")).toBeNull();
  });

  it("moves right, keeping its place in the list when the next column is long enough", () => {
    expect(stepLayout(wide, columnIds, 11, "right")).toEqual({ 1: [10, 12], 2: [20, 11, 21], 3: [] });
  });

  it("goes to the end of a shorter column", () => {
    expect(stepLayout(wide, columnIds, 12, "right")).toEqual({ 1: [10, 11], 2: [20, 21, 12], 3: [] });
  });

  it("moves into an empty column", () => {
    expect(stepLayout(wide, columnIds, 20, "right")).toEqual({ 1: [10, 11, 12], 2: [21], 3: [20] });
  });

  it("moves left", () => {
    expect(stepLayout(wide, columnIds, 21, "left")).toEqual({ 1: [10, 21, 11, 12], 2: [20], 3: [] });
  });

  it("stops at the first and last column", () => {
    expect(stepLayout(wide, columnIds, 10, "left")).toBeNull();
    const last: Layout = { 1: [10], 2: [], 3: [30] };
    expect(stepLayout(last, columnIds, 30, "right")).toBeNull();
  });

  it("returns null for unknown cards or columns", () => {
    expect(stepLayout(wide, columnIds, 999, "down")).toBeNull();
    expect(stepLayout(wide, [7, 8, 9], 10, "right")).toBeNull();
  });

  it("never mutates the layout it's given", () => {
    const before = JSON.parse(JSON.stringify(wide)) as Layout;
    stepLayout(wide, columnIds, 11, "right");
    stepLayout(wide, columnIds, 11, "down");
    expect(wide).toEqual(before);
  });
});

describe("describePlacement", () => {
  const columns = [makeColumn(1, [], "To do"), makeColumn(2, [], "Done")];

  it("says where a card is", () => {
    expect(describePlacement(layout, columns, 11)).toBe("position 2 of 3 in To do");
    expect(describePlacement(layout, columns, 20)).toBe("position 1 of 1 in Done");
  });

  it("returns null for a card that isn't in the layout", () => {
    expect(describePlacement(layout, columns, 999)).toBeNull();
  });

  it("falls back when the column isn't known", () => {
    expect(describePlacement(layout, [], 10)).toBe("position 1 of 3 in this column");
  });
});