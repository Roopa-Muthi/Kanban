import type { UniqueIdentifier } from "@dnd-kit/core";

export const cardKey = (id: number): string => `card-${id}`;

export function parseCardKey(key: UniqueIdentifier): number | null {
  const match = /^card-(\d+)$/.exec(String(key));
  return match?.[1] ? Number(match[1]) : null;
}