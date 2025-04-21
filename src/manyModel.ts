import { GenericQueriable } from "@apparts/db";
import {
  InferNotDerivedType,
  Obj,
  Required,
  Schema,
  obj,
} from "@apparts/types";
import { Model } from "./modelType";

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object | undefined
    ? RecursivePartial<T[P]>
    : T[P];
};

export abstract class ManyModel<
  TypeSchema extends Obj<Required, any>
> extends Model<TypeSchema> {
  // TODO: Should contents really be Partial?
  constructor(
    dbs: GenericQueriable,
    contents?: RecursivePartial<InferNotDerivedType<TypeSchema>>[]
  ) {
    super(dbs);

    // @ts-expect-error hack
    const { getCollection, getSchema } = this.constructor;
    if (!getSchema || !getCollection)
      throw new Error(
        "getSchema or getCollection not defined. Did you forget to use useModel?"
      );
    this._collection = getCollection();
    const types = getSchema().getModelType();
    this._schema = getSchema();
    this._types = types;

    const schemaWODerived: Record<string, Schema<any, any>> = {};
    for (const key in this._schema.getKeys()) {
      if (!this._schema.getKeys()[key].getType().derived) {
        schemaWODerived[key] = this._schema.getKeys()[key];
      }
    }

    this._schemaWODerived = obj(schemaWODerived);
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
}
