import { Obj, Required } from "@apparts/types";
import { ManyModel as BaseModel } from "./manyModel";
export * from "./errors";
export { BaseModel };

type ModelOptions<TypeSchema extends Obj<Required, any>> = {
  typeSchema: TypeSchema;
  collection: string;
};

export const useModel = <
  TypeSchema extends Obj<Required, any>,
  Clazz extends new (...ps: any[]) => BaseModel<TypeSchema>
>(
  Clazz: Clazz,
  { typeSchema, collection }: ModelOptions<TypeSchema>
) => {
  // @ts-expect-error hack
  Clazz.getCollection = () => collection;
  // @ts-expect-error hack
  Clazz.getSchema = () => typeSchema;
};

export const getModelCollection = <
  TypeSchema extends Obj<Required, any>,
  Clazz extends new (...ps: any[]) => BaseModel<TypeSchema>
>(
  Clazz: Clazz
) => {
  // @ts-expect-error hack
  const { getCollection } = Clazz;

  if (!getCollection) {
    throw new Error(
      "getCollection not defined. Did you forget to use useModel?"
    );
  }
  return getCollection();
};

export const getModelSchema = <
  TypeSchema extends Obj<Required, any>,
  Clazz extends new (...ps: any[]) => BaseModel<TypeSchema>
>(
  Clazz: Clazz
) => {
  // @ts-expect-error hack
  const { getSchema } = Clazz;

  if (!getSchema) {
    throw new Error("getSchema not defined. Did you forget to use useModel?");
  }
  return getSchema();
};
