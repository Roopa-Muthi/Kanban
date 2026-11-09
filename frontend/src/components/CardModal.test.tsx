import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { makeCard } from "../test/factories";
import type { Card } from "../types";
import { CardModal } from "./CardModal";

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "alice", email: "alice@example.com" } }),
}));

const baseCard = makeCard(10, 1, {
  title: "Write README",
  description: "Screenshot and link.",
  due_date: "2026-12-01",
});

function setup(overrides: Partial<Card> = {}) {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<CardModal card={{ ...baseCard, ...overrides }} onSave={onSave} onClose={onClose} />);
  return { user, onSave, onClose };
}

const saveButton = () => screen.getByRole("button", { name: "Save" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CardModal", () => {
  it("shows the card's current values", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Card details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Write README");
    expect(screen.getByLabelText("Description")).toHaveValue("Screenshot and link.");
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-12-01");
    expect(screen.getByLabelText("Assignee")).toHaveValue("");
  });

  it("keeps Save disabled until something changes", async () => {
    const { user } = setup();
    expect(saveButton()).toBeDisabled();
    await user.type(screen.getByLabelText("Description"), " More.");
    expect(saveButton()).toBeEnabled();
  });

  it("sends only the fields that changed, then closes", async () => {
    const { user, onSave, onClose } = setup();
    const description = screen.getByLabelText("Description");
    await user.clear(description);
    await user.type(description, "New text");
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith({ description: "New text" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("changes the due date", async () => {
    const { user, onSave } = setup();
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2027-01-15" } });
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({ due_date: "2027-01-15" });
  });

  it("clears the due date", async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole("button", { name: "Clear due date" }));
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({ due_date: null });
  });

  it("assigns the card to the current user", async () => {
    const { user, onSave } = setup();
    await user.selectOptions(screen.getByLabelText("Assignee"), "Me (alice)");
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({ assignee: 1 });
  });

  it("unassigns the card", async () => {
    const { user, onSave } = setup({ assignee: 1 });
    expect(screen.getByLabelText("Assignee")).toHaveValue("1");
    await user.selectOptions(screen.getByLabelText("Assignee"), "Unassigned");
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({ assignee: null });
  });

  it("won't save a blank title", async () => {
    const { user } = setup();
    await user.clear(screen.getByLabelText("Title"));
    expect(saveButton()).toBeDisabled();
  });

  it("shows the server's error and keeps the dialog and its values", async () => {
    const { user, onSave, onClose } = setup();
    onSave.mockRejectedValueOnce(
      new ApiError(400, { description: ["Ensure this field has no more than 5000 characters."] }),
    );
    await user.type(screen.getByLabelText("Description"), " more");
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("no more than 5000");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Description")).toHaveValue("Screenshot and link. more");
    expect(saveButton()).toBeEnabled();
  });

  it("closes on Cancel without asking when nothing changed", async () => {
    const { user, onClose } = setup();
    const confirm = vi.spyOn(window, "confirm");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when discarding changes is declined", async () => {
    const { user, onClose } = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.type(screen.getByLabelText("Description"), " more");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledWith("Discard your changes?");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when discarding changes is confirmed", async () => {
    const { user, onClose } = setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.type(screen.getByLabelText("Description"), " more");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});