import { Obj, Required } from "@apparts/types";
import { makeManyModel } from "./manyModel";
export * from "./errors";

export const useModel = <TypeSchema extends Obj<Required, any>>({
  typeSchema,
  collection,
}: {
  typeSchema: TypeSchema;
  collection: string;
}) => {
  return makeManyModel({ typeSchema, collection });
};
