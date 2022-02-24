module.exports = {
  env: {
    node: true,
    es6: true,
  },
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
  overrides: [
    {
      files: ["*.test.js"],
      env: {
        jest: true,
      },
    },
    {
      files: ["*.ts"],
      plugins: ["@typescript-eslint", "jest"],
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "prettier",
      ],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: "tsconfig.json",
        sourceType: "module",
      },
    },
  ],
  rules: {
    "no-var": "error",
    "prefer-const": "error",
    "no-unneeded-ternary": "error",
    "prefer-arrow-callback": "error",
    "@typescript-eslint/no-explicit-any": 0,
  },
};
