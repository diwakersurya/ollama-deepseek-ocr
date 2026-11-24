import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "./global.css";
import "./tokens.stylex"; // side-effect import: keeps the token definitions in the bundle
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { queryClient } from "./queries";

// "/" jumps to the search box, as in most tools.
document.addEventListener("keydown", (e) => {
  const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, dialog");
  if (e.key !== "/" || typing || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  document.getElementById("search")?.focus();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
