import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../api";
import { makeBoard, makeCard, makeColumn } from "../test/factories";
import type { BoardDetail } from "../types";
import { BoardView } from "./BoardView";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

const noResync = () => Promise.resolve();

// Holds the board in state, like BoardPage does, so updates show up on screen.
function Harness({ initial }: { initial: BoardDetail }) {
  const [board, setBoard] = useState(initial);
  return <BoardView board={board} updateBoard={setBoard} onResync={noResync} />;
}

function sampleBoard(): BoardDetail {
  return makeBoard([
    makeColumn(
      1,
      [
        makeCard(10, 1, { title: "Write README" }),
        makeCard(11, 1, { title: "Add seed command", due_date: "2000-01-01" }),
        makeCard(12, 1, { title: "Deploy", due_date: "2999-12-31" }),
      ],
      "To do",
    ),
    makeColumn(2, [], "Done"),
  ]);
}

function setup(board: BoardDetail = sampleBoard()) {
  const user = userEvent.setup();
  render(<Harness initial={board} />);
  return { user };
}

const column = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BoardView rendering", () => {
  it("renders columns, cards and counts", () => {
    setup();
    expect(screen.getByRole("heading", { name: "To do", level: 2 })).toBeInTheDocument();
    const todo = column("To do");
    expect(within(todo).getByText("Write README")).toBeInTheDocument();
    expect(within(todo).getByText("3")).toBeInTheDocument();
    expect(within(column("Done")).getByText("No cards yet")).toBeInTheDocument();
  });

  it("flags only overdue cards", () => {
    setup();
    expect(screen.getAllByText(/overdue/)).toHaveLength(1);
  });

  it("gives every card a reorder handle", () => {
    setup();
    expect(screen.getAllByRole("button", { name: /^Reorder / })).toHaveLength(3);
  });

  it("explains an empty board", () => {
    setup(makeBoard([]));
    expect(screen.getByText(/no columns yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add a column/i })).toBeInTheDocument();
  });
});

describe("BoardView cards", () => {
  it("adds a card to the bottom of its column", async () => {
    const { user } = setup();
    vi.mocked(api.post).mockResolvedValueOnce(
      makeCard(99, 1, { title: "Brand new card", position: 4000 }),
    );
    const todo = column("To do");

    await user.click(within(todo).getByRole("button", { name: /add a card/i }));
    await user.type(within(todo).getByRole("textbox", { name: "Card title" }), "Brand new card");
    await user.click(within(todo).getByRole("button", { name: "Add card" }));

    expect(await within(todo).findByText("Brand new card")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/cards", { column: 1, title: "Brand new card" });
  });

  it("shows the server's error and keeps what was typed", async () => {
    const { user } = setup();
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(400, { title: ["Title is too long."] }));
    const todo = column("To do");

    await user.click(within(todo).getByRole("button", { name: /add a card/i }));
    await user.type(within(todo).getByRole("textbox", { name: "Card title" }), "Brand new card");
    await user.click(within(todo).getByRole("button", { name: "Add card" }));

    expect(await within(todo).findByRole("alert")).toHaveTextContent("Title is too long.");
    expect(within(todo).getByRole("textbox", { name: "Card title" })).toHaveValue("Brand new card");
    expect(within(todo).queryByText("Brand new card")).not.toBeInTheDocument();
  });

  it("renames a card", async () => {
    const { user } = setup();
    vi.mocked(api.patch).mockResolvedValueOnce(
      makeCard(10, 1, { title: "Write the README", version: 2 }),
    );

    await user.click(screen.getByRole("button", { name: "Edit title of Write README" }));
    const input = screen.getByRole("textbox", { name: "Edit title of Write README" });
    await user.clear(input);
    await user.type(input, "Write the README");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Write the README")).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith("/cards/10", { title: "Write the README" });
  });

  it("doesn't send a request when the title is unchanged", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Edit title of Write README" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.getByText("Write README")).toBeInTheDocument();
  });

  it("deletes a card after confirmation", async () => {
    const { user } = setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.delete).mockResolvedValueOnce(undefined);

    await user.click(screen.getByRole("button", { name: "Delete Write README" }));

    await waitFor(() => expect(screen.queryByText("Write README")).not.toBeInTheDocument());
    expect(api.delete).toHaveBeenCalledWith("/cards/10");
  });

  it("keeps the card when the confirmation is cancelled", async () => {
    const { user } = setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await user.click(screen.getByRole("button", { name: "Delete Write README" }));

    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText("Write README")).toBeInTheDocument();
  });

  it("shows a banner and keeps the card when a delete fails", async () => {
    const { user } = setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.delete).mockRejectedValueOnce(
      new ApiError(404, { detail: "No Card matches the given query." }),
    );

    await user.click(screen.getByRole("button", { name: "Delete Write README" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No Card matches the given query.");
    expect(screen.getByText("Write README")).toBeInTheDocument();
  });
});

describe("BoardView columns", () => {
  it("mentions the card count when deleting a column", async () => {
    const { user } = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    await user.click(screen.getByRole("button", { name: "Delete column To do" }));
    expect(confirm).toHaveBeenLastCalledWith('Delete "To do" and its 3 cards?');

    await user.click(screen.getByRole("button", { name: "Delete column Done" }));
    expect(confirm).toHaveBeenLastCalledWith('Delete "Done"?');
  });

  it("adds a column", async () => {
    const { user } = setup();
    vi.mocked(api.post).mockResolvedValueOnce({ id: 3, board: 1, title: "Review", position: 3000 });

    await user.click(screen.getByRole("button", { name: /add a column/i }));
    await user.type(screen.getByRole("textbox", { name: "Column title" }), "Review");
    await user.click(screen.getByRole("button", { name: "Add column" }));

    expect(await screen.findByRole("region", { name: "Review" })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/columns", { board: 1, title: "Review" });
  });
});
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "alice", email: "alice@example.com" } }),
}));
describe("BoardView card details", () => {
  it("opens the details dialog for a card", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Open details for Write README" }));
    const dialog = screen.getByRole("dialog", { name: "Card details" });
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Write README");
  });

  it("saves details and shows them on the card", async () => {
    const { user } = setup();
    vi.mocked(api.patch).mockResolvedValueOnce(
      makeCard(10, 1, { title: "Write README", description: "Add a screenshot.", version: 2 }),
    );

    await user.click(screen.getByRole("button", { name: "Open details for Write README" }));
    await user.type(screen.getByLabelText("Description"), "Add a screenshot.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.patch).toHaveBeenCalledWith("/cards/10", { description: "Add a screenshot." });
    expect(within(column("To do")).getByText("Add a screenshot.")).toBeInTheDocument();
  });
});