const root = document.documentElement;
const supportedModes = new Set(["system", "light", "dark"]);
const supportedAccents = new Set(["blue", "violet", "green", "amber"]);
const storedMode = localStorage.getItem("donecheck.appearance.mode");
const storedAccent = localStorage.getItem("donecheck.appearance.accent");
const mode = supportedModes.has(storedMode) ? storedMode : "system";
const accent = supportedAccents.has(storedAccent) ? storedAccent : "blue";
const resolvedTheme =
  mode === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : mode;

root.dataset.theme = resolvedTheme;
root.dataset.accent = accent;
