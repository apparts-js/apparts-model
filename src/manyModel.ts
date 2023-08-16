import { GenericQueriable } from "@apparts/db";
import { InferNotDerivedType, Obj, Required } from "@apparts/types";
import { Model } from "./modelType";

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object | undefined
    ? RecursivePartial<T[P]>
    : T[P];
};

export const makeManyModel = <TypeSchema extends Obj<Required, any>>({
  typeSchema,
  collection,
}: {
  typeSchema: TypeSchema;
  collection: string;
}): new (
  dbs: GenericQueriable,
  contents?: RecursivePartial<InferNotDerivedType<TypeSchema>>[]
) => Model<TypeSchema> => {
  class ManyModel extends Model<TypeSchema> {
    // TODO: Should contents really be Partial?
    constructor(
      dbs: GenericQueriable,
      contents?: RecursivePartial<InferNotDerivedType<TypeSchema>>[]
    ) {
      super(dbs, contents);
      this._collection = collection;
      const types = typeSchema.getModelType();
      this._types = types;

      this._keys = Object.keys(types).filter((key) => types[key].key);
      this._autos = Object.keys(types).filter((key) => types[key].auto);
      const storedValues = Object.keys(types).filter(
        (key) => !types[key].auto && !types[key].derived
        /* && types[key].persisted !== false */
      );
      if (this._keys.length === 0) {
        throw new Error("[AnyModel] Types not well defined: No key found");
      }
      if (storedValues.length === 0) {
        throw new Error(
          "[AnyModel] Types not well defined: No stored, not generated key found"
        );
      }

      if (contents) {
        this._contents = this._fillInDefaults(contents);
        if (contents.length === 1) {
          this.isOne = true;
        }
      } else {
        this._contents = [];
      }
    }

    static getCollection() {
      return collection;
    }

    static getSchema() {
      return typeSchema;
    }
  }
  return ManyModel;
};
