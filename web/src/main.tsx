import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlannerApp } from "./planner/PlannerApp";
import "@fontsource-variable/inter";
import "./styles.css";
import "./planner/planner.css";

createRoot(document.getElementById("root")!).render(<StrictMode><PlannerApp /></StrictMode>);
