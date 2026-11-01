import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@web/app/App";
import "@web/app/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
