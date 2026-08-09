// FIRST import, deliberately, and imported for its side effect rather than a
// value. Every `import` is hoisted and evaluated before any statement in this
// file's body, so calling an installer down there would run *after* the module
// that throws. Import order is the only lever available. Do not move this below
// another import, and do not convert it into a function call.
import "./lib/crashOverlay";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { QueryClientProvider } from "@tanstack/react-query";

import "@fontsource-variable/fraunces";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";
import App from "./App";
import { Toaster } from "./components/ui/sonner";
import store, { persistor } from "./redux/store";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { queryClient } from "./lib/queryClient";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in index.html");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <ThemeProvider>
            <App />
            <Toaster />
          </ThemeProvider>
        </PersistGate>
      </Provider>
    </QueryClientProvider>
  </StrictMode>,
);
