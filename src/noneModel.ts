import { GenericDBS } from "@apparts/db";
import { DoesExist } from "./errors";
import { makeAnyModel } from "./anyModel";

export const makeNoneModel = (Clazz: ReturnType<typeof makeAnyModel>) => {
  return class NoneModel extends Clazz {
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
