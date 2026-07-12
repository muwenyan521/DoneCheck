import { describe, expect, it, vi } from "vitest";
import { applyUserInput, saveHistoryWithFeedback } from "./app-feedback.js";

describe("app feedback", () => {
  it("clears a transient notice when the user changes an analysis input", () => {
    const setValue = vi.fn();
    const setNotice = vi.fn();

    applyUserInput({ setNotice, setValue, value: "new value" });

    expect(setValue).toHaveBeenCalledWith("new value");
    expect(setNotice).toHaveBeenCalledWith("");
  });

  it("does not overwrite a persistence failure with a success notice", async () => {
    const notices: string[] = [];

    const saved = await saveHistoryWithFeedback({
      locale: "en",
      persist: async () => false,
      setNotice: (notice) => notices.push(notice),
    });

    expect(saved).toBe(false);
    expect(notices).toEqual(["Saving..."]);
    expect(notices).not.toContain("Report saved.");
  });
});
