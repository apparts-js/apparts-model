"use strict";

const { makeManyModel } = require("./manyModel");
const errors = require("./errors");

module.exports = {
  ...errors,
  useModel({ typeSchema, collection }) {
    return makeManyModel({ typeSchema, collection });
  },
};
