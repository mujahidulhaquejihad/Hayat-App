import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as CapApp } from "@capacitor/app";
import App from "./App.jsx";
import "./styles.css";

try {
  CapApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else CapApp.exitApp();
  });
} catch {
  /* web */
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
