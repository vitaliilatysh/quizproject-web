import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";

// index.html always carries this element, so a miss is a broken build rather
// than a state to render around — which is what the non-null assertion would
// have hidden.
const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing the #root container.");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
