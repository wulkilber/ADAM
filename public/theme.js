"use strict";
(() => {
  const key = "adam-theme";
  const system = matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try {
    preference = localStorage.getItem(key);
  } catch {
    // The system preference still works when local storage is unavailable.
  }

  function apply() {
    const theme =
      preference === "dark" || preference === "light"
        ? preference
        : system.matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = theme;
    for (const control of document.querySelectorAll("[data-theme-toggle]"))
      control.setAttribute("aria-pressed", String(theme === "dark"));
  }

  apply();
  system.addEventListener("change", apply);
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-theme-toggle]")) return;
    preference =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(key, preference);
    } catch {
      // Keep the selection for the current page.
    }
    apply();
  });
})();
