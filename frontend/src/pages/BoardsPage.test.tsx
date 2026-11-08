import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../api";
import type { Board } from "../types";
import { BoardsPage } from "./BoardsPage";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "alice", email: "alice@example.com" },
    logout: vi.fn(),
  }),
}));

const roadmap: Board = { id: 1, name: "Roadmap", created_at: "2026-01-01T00:00:00Z" };

function renderPage() {
  return render(
    <MemoryRouter>
      <BoardsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BoardsPage", () => {
  it("shows a loading message", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading boards…")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/any boards yet/i)).toBeInTheDocument();
  });

  it("lists boards as links to their pages", async () => {
    vi.mocked(api.get).mockResolvedValue([roadmap]);
    renderPage();
    expect(await screen.findByRole("link", { name: "Roadmap" })).toHaveAttribute("href", "/boards/1");
  });

  it("shows an error and recovers on retry", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce([]);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/any boards yet/i)).toBeInTheDocument();
  });

  it("creates a board and puts it first", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce([roadmap]);
    vi.mocked(api.post).mockResolvedValueOnce({ id: 2, name: "Sprint", created_at: "2026-02-01T00:00:00Z" });
    renderPage();
    await screen.findByRole("link", { name: "Roadmap" });

    const create = screen.getByRole("button", { name: "Create board" });
    expect(create).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "New board name" }), "Sprint");
    await user.click(create);

    await screen.findByRole("link", { name: "Sprint" });
    expect(api.post).toHaveBeenCalledWith("/boards", { name: "Sprint" });
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Sprint", "Roadmap"]);
  });

  it("shows the server's message when creating fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce([]);
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(400, { name: ["Name is too long."] }));
    renderPage();
    await screen.findByText(/any boards yet/i);

    await user.type(screen.getByRole("textbox", { name: "New board name" }), "x");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Name is too long.");
  });

  it("deletes a board after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.get).mockResolvedValueOnce([roadmap]);
    vi.mocked(api.delete).mockResolvedValueOnce(undefined);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete board Roadmap" }));

    await waitFor(() => expect(screen.queryByRole("link", { name: "Roadmap" })).not.toBeInTheDocument());
    expect(api.delete).toHaveBeenCalledWith("/boards/1");
  });

  it("keeps the board and shows a message when a delete fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.get).mockResolvedValueOnce([roadmap]);
    vi.mocked(api.delete).mockRejectedValueOnce(new ApiError(404, { detail: "Not found." }));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete board Roadmap" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not found.");
    expect(screen.getByRole("link", { name: "Roadmap" })).toBeInTheDocument();
  });
});