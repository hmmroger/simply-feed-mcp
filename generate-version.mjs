import fs from "fs";
import packageJson from "./package.json" with { type: "json" };

const versionContent = `export const VERSION = '${packageJson.version}';\n`;
fs.writeFileSync("./src/version.ts", versionContent);
