"use strict";

import { makeManyModel } from "./manyModel";
export * from "./errors";

export const useModel = ({ typeSchema, collection }) => {
  return makeManyModel({ typeSchema, collection });
};
