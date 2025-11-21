import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@radix-ui/themes/styles.css";
import { Theme, ThemePanel } from "@radix-ui/themes";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme accentColor="teal" grayColor="gray" radius="large" appearance="dark">
      <App />
      <ThemePanel />
    </Theme>
  </StrictMode>,
);
