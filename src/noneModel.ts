import { GenericDBS } from "@apparts/db";
import { Required, Obj } from "@apparts/types";
import { DoesExist } from "./errors";
import { makeAnyModel } from "./anyModel";

export const makeNoneModel = <TypeSchema extends Obj<Required, any>>(props: {
  typeSchema: TypeSchema;
  collection: string;
}) => {
  const AnyModel = makeAnyModel(props);

  return class NoneModel extends AnyModel {
    constructor(dbs: GenericDBS) {
      super(dbs);
    }

    async loadNone(filter) {
      const contents = await this._load(
        this._dbs.collection(this._collection).find(filter, 2)
      );
      if (contents.length > 0) {
        throw new DoesExist(this._collection, {
          shouldNotExist: filter,
          butDoes: contents,
        });
      }
      return this;
    }
  };
};
