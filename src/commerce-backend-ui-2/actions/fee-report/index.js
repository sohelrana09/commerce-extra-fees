import { handlers } from "../handlers.js";
import { adminAction } from "../http.js";

export const main = adminAction("fee-report", handlers.feeReport);
