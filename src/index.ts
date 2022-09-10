import { Required, Obj } from "@apparts/types";

import { makeManyModel } from "./manyModel";
import { makeOneModel } from "./oneModel";
import { makeNoneModel } from "./noneModel";
export * from "./errors";

export const useModel = <TypeSchema extends Obj<Required, any>>(params: {
  typeSchema: TypeSchema;
  collection: string;
}) => {
  return [makeManyModel(params), makeOneModel(params), makeNoneModel(params)];
};

export const makeModel = (name: string, models) => {
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
