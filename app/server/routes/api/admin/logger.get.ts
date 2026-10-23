import { getLoggerNote } from "../../../apps/logger/dailyLog";
import { defineAdminHandler } from "../../../core/adminHandler";

export default defineAdminHandler(() => getLoggerNote());
