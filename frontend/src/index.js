// frontend/src/index.js
// DLMS – Riba & Company Limited — React entry point

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Global reset — remove default browser margins/padding
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif;
    background: #F5F7FA;
    -webkit-font-smoothing: antialiased;
  }
  a { text-decoration: none; }
  button { font-family: inherit; }
  input, select, textarea { font-family: inherit; }
`;
document.head.appendChild(style);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
