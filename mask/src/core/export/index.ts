import type { ExportService } from "./types";
import { createService } from "./service";
export * from "./types";
export { buildReport, CORE_LIMITATION } from "./service";
export function createExportService(): ExportService { return createService(); }
