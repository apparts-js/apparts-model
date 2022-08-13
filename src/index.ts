import { makeManyModel } from "./manyModel";
import { makeOneModel } from "./oneModel";
import { makeNoneModel } from "./noneModel";
export * from "./errors";

const USAGE = "\nUsage: useModel(<dbs>, <types>, <collection name>);\n\n";

export const useModel = (types, collection) => {
  if (typeof types !== "object") {
    throw new Error("[Model]: Type definition is not an object!" + USAGE);
  }
  if (typeof collection !== "string") {
    throw new Error("[Model]: Collection is not a string!" + USAGE);
  }
  return [
    makeManyModel(types, collection),
    makeOneModel(types, collection),
    makeNoneModel(types, collection),
  ];
};

export const makeModel = (name, models) => {
  return {
    [name + "s"]: models[0],
    [name]: models[1],
    ["No" + name]: models[2],
    ["use" + name]: (dbs) => {
      if (!dbs) {
        return models;
      }
      class DbsModels extends models[0] {
        constructor(...args) {
          super(dbs, ...args);
        }
      }
      class DbsModel extends models[1] {
        constructor(...args) {
          super(dbs, ...args);
        }
      }
      class DbsNoModel extends models[2] {
        constructor(...args) {
          super(dbs, ...args);
        }
      }
      return [DbsModels, DbsModel, DbsNoModel];
    },
  };
};
