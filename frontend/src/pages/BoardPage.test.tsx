import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../api";
import { makeBoard, makeCard, makeColumn } from "../test/factories";
import { BoardPage } from "./BoardPage";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/boards/1"]}>
      <Routes>
        <Route path="/" element={<p>Boards home</p>} />
        <Route path="/boards/:boardId" element={<BoardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const board = makeBoard([makeColumn(1, [makeCard(10, 1, { title: "Write README" })], "To do")]);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("BoardPage", () => {
  it("shows a loading message while the board loads", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading board…")).toBeInTheDocument();
  });

  it("shows the board once it loads", async () => {
    vi.mocked(api.get).mockResolvedValue(board);
    renderPage();
    expect(await screen.findByRole("heading", { name: "Test board", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Write README")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/boards/1");
  });

  it("says so when the board doesn't exist", async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(404, { detail: "Not found." }));
    renderPage();
    expect(await screen.findByText("Board not found.")).toBeInTheDocument();
  });

  it("shows an error and recovers on retry", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(board);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server");
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Test board", level: 1 })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("explains a board with no columns", async () => {
    vi.mocked(api.get).mockResolvedValue(makeBoard([]));
    renderPage();
    expect(await screen.findByText(/no columns yet/i)).toBeInTheDocument();
  });
});