const eslintrc = require("./.eslintrc.js");

let newRules = {};

for (const key of Object.keys(eslintrc.rules)) {
  newRules[key] = "error";
}

newRules = {
  ...newRules,
  indent: "off",
  "@typescript-eslint/indent": "off",
  "@typescript-eslint/no-explicit-any": "off",
};

module.exports = {
  ...eslintrc,
  rules: newRules,
};
