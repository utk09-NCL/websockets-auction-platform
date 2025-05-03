import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// Gets the root DOM element where the React app will be mounted
const rootElement = document.getElementById("root");

// Throws an error if the root element is not found in the HTML
if (!rootElement) {
  throw new Error("Failed to find the root element");
}

// Creates a React root attached to the root DOM element
const root = createRoot(rootElement);

// Renders the main App component wrapped in StrictMode into the root
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
