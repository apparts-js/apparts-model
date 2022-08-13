"use strict";

const { DoesExist } = require("./errors");
const useAnyModel = require("./anyModel");

module.exports = (types, collection) => {
  const AnyModel = useAnyModel(types, collection);

  return class NoneModel extends AnyModel {
    constructor(dbs) {
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
