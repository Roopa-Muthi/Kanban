import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { LoginPage } from "./LoginPage";

const auth = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: null, login: auth.login }),
}));

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Username"), "alice");
  await user.type(screen.getByLabelText("Password"), "secret");
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});
describe("LoginPage", () => {
  it("sends the credentials", async () => {
    const user = userEvent.setup();
    auth.login.mockResolvedValueOnce(undefined);
    renderPage();
    await submit(user);
    expect(auth.login).toHaveBeenCalledWith("alice", "secret");
  });

  it("shows the server's message for a wrong password", async () => {
    const user = userEvent.setup();
    auth.login.mockRejectedValueOnce(
      new ApiError(401, { detail: "No active account found with the given credentials" }),
    );
    renderPage();
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("No active account found");
  });

  it("explains when the server can't be reached", async () => {
    const user = userEvent.setup();
    auth.login.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderPage();
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server");
  });

  it("disables the button while logging in", async () => {
    const user = userEvent.setup();
    auth.login.mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    await submit(user);
    expect(await screen.findByRole("button", { name: "Logging in…" })).toBeDisabled();
  });
    it("hides the demo login hint by default", () => {
    renderPage();
    expect(screen.queryByText(/demo account/i)).not.toBeInTheDocument();
  });

  it("shows the demo login hint when enabled", () => {
    vi.stubEnv("VITE_SHOW_DEMO_LOGIN", "true");
    renderPage();
    expect(screen.getByText(/demo account/i)).toBeInTheDocument();
    expect(screen.getByText("kanban-demo-2026")).toBeInTheDocument();
  });
});