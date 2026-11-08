import { describe, expect, it } from "vitest";
import * as ops from "./boardOps";
import { makeBoard, makeCard, makeColumn } from "./test/factories";
import type { BoardDetail } from "./types";

function sample(): BoardDetail {
  return makeBoard([
    makeColumn(1, [makeCard(10, 1), makeCard(11, 1), makeCard(12, 1)]),
    makeColumn(2, [makeCard(20, 2)]),
    makeColumn(3),
  ]);
}

function ids(board: BoardDetail, columnId: number): number[] {
  return board.columns.find((c) => c.id === columnId)?.cards.map((c) => c.id) ?? [];
}

function findCard(board: BoardDetail, cardId: number) {
  return board.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
}

describe("column operations", () => {
  it("addColumn appends an empty column", () => {
    const next = ops.addColumn(sample(), { id: 4, board: 1, title: "Review", position: 4000 });
    expect(next.columns.map((c) => c.id)).toEqual([1, 2, 3, 4]);
    expect(next.columns[3]).toEqual({ id: 4, title: "Review", position: 4000, cards: [] });
  });

  it("renameColumn changes only the title", () => {
    const next = ops.renameColumn(sample(), { id: 2, board: 1, title: "Doing", position: 2000 });
    expect(next.columns.find((c) => c.id === 2)?.title).toBe("Doing");
    expect(ids(next, 2)).toEqual([20]);
    expect(next.columns.find((c) => c.id === 1)?.title).toBe("Column 1");
  });

  it("removeColumn drops the column and its cards", () => {
    const next = ops.removeColumn(sample(), 1);
    expect(next.columns.map((c) => c.id)).toEqual([2, 3]);
  });
});

describe("card operations", () => {
  it("addCard appends to the bottom of its column", () => {
    const next = ops.addCard(sample(), makeCard(13, 1));
    expect(ids(next, 1)).toEqual([10, 11, 12, 13]);
  });

  it("replaceCard swaps in the server's version of a card", () => {
    const next = ops.replaceCard(sample(), makeCard(11, 1, { title: "Renamed", version: 2 }));
    expect(findCard(next, 11)?.title).toBe("Renamed");
    expect(findCard(next, 11)?.version).toBe(2);
    expect(findCard(next, 10)?.title).toBe("Card 10");
    expect(ids(next, 1)).toEqual([10, 11, 12]);
  });

  it("removeCard removes just that card", () => {
    const next = ops.removeCard(sample(), 11);
    expect(ids(next, 1)).toEqual([10, 12]);
    expect(ids(next, 2)).toEqual([20]);
  });
});

describe("placeCard", () => {
  it("reorders within a column", () => {
    const next = ops.placeCard(sample(), 12, 1, [12, 10, 11]);
    expect(ids(next, 1)).toEqual([12, 10, 11]);
  });

  it("moves a card to another column", () => {
    const next = ops.placeCard(sample(), 10, 2, [20, 10]);
    expect(ids(next, 1)).toEqual([11, 12]);
    expect(ids(next, 2)).toEqual([20, 10]);
    expect(findCard(next, 10)?.column).toBe(2);
  });

  it("moves a card into an empty column", () => {
    const next = ops.placeCard(sample(), 20, 3, [20]);
    expect(ids(next, 2)).toEqual([]);
    expect(ids(next, 3)).toEqual([20]);
  });

  it("returns the same board when the card doesn't exist", () => {
    const board = sample();
    expect(ops.placeCard(board, 999, 1, [999])).toBe(board);
  });
});

describe("syncCard", () => {
  it("copies only the server-owned fields and keeps local placement", () => {
    const server = makeCard(11, 2, {
      title: "SERVER TITLE",
      position: 9999,
      version: 5,
      updated_at: "2026-02-02T00:00:00Z",
    });
    const next = ops.syncCard(sample(), server);
    const card = findCard(next, 11);
    expect(card?.version).toBe(5);
    expect(card?.position).toBe(9999);
    expect(card?.updated_at).toBe("2026-02-02T00:00:00Z");
    expect(card?.column).toBe(1); // local placement wins
    expect(card?.title).toBe("Card 11");
    expect(ids(next, 1)).toEqual([10, 11, 12]);
  });
});

describe("immutability", () => {
  it("never mutates its input", () => {
    const board = sample();
    const snapshot = JSON.parse(JSON.stringify(board)) as BoardDetail;
    ops.placeCard(board, 12, 2, [12, 20]);
    ops.removeCard(board, 10);
    ops.addCard(board, makeCard(99, 3));
    ops.removeColumn(board, 1);
    expect(board).toEqual(snapshot);
  });
});