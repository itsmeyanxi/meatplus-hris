import next from "eslint-config-next";

/**
 * Flat ESLint config. ESLint 10 dropped legacy `.eslintrc` support and Next 16
 * removed the `next lint` command, so the linter is driven directly via the
 * `eslint .` script. `eslint-config-next` already bundles the Next core-web-vitals
 * rules, the TypeScript config, and the standard ignores (.next, build, out).
 */
const config = [...next];

export default config;
