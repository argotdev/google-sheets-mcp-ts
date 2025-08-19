import { registerListRowsPub } from "./list-rows-pub.js";
import { registerQueryRowsPub } from "./query-rows-pub.js";
import { registerExportSubsetPub } from "./export-subset-pub.js";
export function registerAllTools(server) {
    registerListRowsPub(server);
    registerQueryRowsPub(server);
    registerExportSubsetPub(server);
}
