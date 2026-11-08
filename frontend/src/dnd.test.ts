import { describe, expect, it } from "vitest";
import {
  buildLayout,
  cardKey,
  columnKey,
  columnOfOver,
  findColumnOf,
  parseCardKey,
  parseColumnKey,
  planMove,
  previewLayout,
  sameOrder,
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