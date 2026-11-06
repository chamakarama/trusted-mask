import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OperatorApp } from "./OperatorApp";
import "@fontsource-variable/inter";
import "../styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><OperatorApp /></StrictMode>);
