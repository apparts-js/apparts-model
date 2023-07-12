"use strict";

const manyModel = require("./manyModel");
const errors = require("./errors");

const USAGE = "\nUsage: useModel(<dbs>, <types>, <collection name>);\n\n";

module.exports = {
  ...errors,
  useModel(types, collection) {
    if (typeof types !== "object") {
      throw new Error("[Model]: Type definition is not an object!" + USAGE);
    }
    if (typeof collection !== "string") {
      throw new Error("[Model]: Collection is not a string!" + USAGE);
    }
    return manyModel(types, collection);
  },
};
