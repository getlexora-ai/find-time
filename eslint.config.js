// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "e2e/*"],
  },
  {
    // The import resolver can't read `exports`-only packages (gsap, lenis,
    // better-auth); tsc already checks every import.
    rules: { "import/no-unresolved": "off" },
  }
]);
