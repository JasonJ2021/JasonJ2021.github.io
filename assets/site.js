// Shared page chrome: theme switcher + the live Shanghai clock in the status bar.
// Each page also runs a tiny inline snippet in <head> that sets data-theme before paint.
(() => {
  const storageKey = "site-theme";
  const root = document.documentElement;
  const buttons = Array.from(document.querySelectorAll("[data-theme-option]"));
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const read = () => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === "light" || v === "dark" ? v : "system";
    } catch { return "system"; }
  };
  const isDark = (theme) => theme === "dark" || (theme === "system" && media.matches);

  const apply = (theme) => {
    root.dataset.theme = theme;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeOption === theme)));
    window.dispatchEvent(new CustomEvent("themechange", { detail: { dark: isDark(theme) } }));
  };

  buttons.forEach((b) => b.addEventListener("click", () => {
    const theme = b.dataset.themeOption;
    try {
      if (theme === "system") localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, theme);
    } catch {}
    apply(theme);
  }));
  media.addEventListener?.("change", () => { if (read() === "system") apply("system"); });

  window.siteTheme = { isDark: () => isDark(read()) };
  apply(read());

  const clock = document.querySelector("[data-clock]");
  if (clock) {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const tick = () => { clock.textContent = `SHA ${fmt.format(new Date())} UTC+8`; };
    tick();
    setInterval(tick, 1000);
  }

  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
