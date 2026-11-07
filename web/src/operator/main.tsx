import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkflowApp } from "./WorkflowApp";
import "@fontsource-variable/inter";
import "../styles.css";
import "../planner/planner.css";
import "./workflow.css";

createRoot(document.getElementById("root")!).render(<StrictMode><WorkflowApp /></StrictMode>);
