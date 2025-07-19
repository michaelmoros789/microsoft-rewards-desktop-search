module.exports = {
    parser: "@typescript-eslint/parser",
    extends: ["eslint:recommended", "@typescript-eslint/recommended"],
    plugins: ["@typescript-eslint"],
    env: {
        browser: true,
        es2020: true,
        webextensions: true,
    },
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
    },
    rules: {
        "@typescript-eslint/no-unused-vars": "error",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-non-null-assertion": "warn",
        "prefer-const": "error",
        "no-var": "error",
        "no-console": "warn",
    },
    globals: {
        chrome: "readonly",
    },
};
