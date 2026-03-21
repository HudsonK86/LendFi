import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @type {import("eslint").Linter.Config[]} */
const config = require("eslint-config-next/core-web-vitals");

export default config;
