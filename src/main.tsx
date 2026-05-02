import React from "react";
import ReactDOM from "react-dom/client";
import "@douyinfe/semi-ui-19/lib/es/_base/base.css";
import App from "./App";
import "./styles/globals.css";
import { ToastProvider } from "./shared/ui/toast";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
