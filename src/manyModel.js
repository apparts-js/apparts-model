"use strict";

const { NotUnique, IsReference, ConstraintFailed } = require("./errors");
const useAnyModel = require("./anyModel");

module.exports = (types, collection) => {
  const AnyModel = useAnyModel(types, collection);

  return class ManyModel extends AnyModel {
    constructor(dbs, contents) {
      super(dbs);
      if (contents) {
        if (!Array.isArray(contents)) {
          throw new Error("[ManyModel], contents should be an array");
        }
        this.contents = this._fillInDefaults(contents);
      } else {
        this.contents = [];
      }
    }

    async load(filter, limit, offset, order) {
      this.contents = await this._load(
        this._dbs
          .collection(this._collection)
          .find(filter, limit, offset, order)
      );
      return this;
    }

    async loadByIds(ids, limit, offset) {
      if (!Array.isArray(ids)) {
        const req = {};
        if (Object.keys(ids).length !== this._keys.length) {
          throw new Error(`[ManyModel] loadByIds not all keys given, E50.
Collection: "${this._collection}", Keys: "${JSON.stringify(
            this._keys
          )}", Id: "${JSON.stringify(ids)}"`);
        }
        this._keys.forEach((key) => {
          if (this._types[key].type === "id") {
            if (Array.isArray(ids[key])) {
              req[key] = ids[key].map((id) => this._dbs.toId(id));
            } else {
              req[key] = this._dbs.toId(ids[key]);
            }
          } else {
            req[key] = ids[key];
          }
        });
        this.contents = await this._load(
          this._dbs.collection(this._collection).findByIds(req, limit, offset)
        );
      } else {
        if (this._keys.length > 1) {
          throw new Error(`[ManyModel] loadByIds not all keys given, E50.
Collection: "${this._collection}", Keys: "${JSON.stringify(
            this._keys
          )}", Id: "${JSON.stringify(ids)}"`);
        }
        this.contents = await this._load(
          this._dbs
            .collection(this._collection)
            .findByIds(
              { [this._keys[0]]: ids.map((id) => this._dbs.toId(id)) },
              limit,
              offset
            )
        );
      }
      return this;
    }

    async store() {
      try {
        this.contents = await this._store(this.contents);
      } catch (err) {
        // MONGO
        if (err._code === 1) {
          throw new NotUnique(this._collection, {
            triedToStore: this.contents,
          });
        } else if (err._code === 3) {
          throw new ConstraintFailed(this._collection, this.contents);
        } else {
          console.log(err);
          throw new Error("[OneModel] Unexpected error in store: ");
        }
      }
      return this;
    }

    async update() {
      await this._update(this.contents);
      return this;
    }

    length() {
      return this.contents.length;
    }

    set(field, val) {
      this.contents.forEach((c) => (c[field] = val));
      return this;
    }

    setF(field, f) {
      this.contents.forEach((c) => (c[field] = f(c)));
      return this;
    }

    async deleteAll() {
      if (this.length() == 0) {
        return;
      }
      const filter = {};
      for (const key of this._keys) {
        filter[key] = { val: this.contents.map((c) => c[key]), op: "in" };
      }
      try {
        await this._dbs.collection(this._collection).remove(filter);
      } catch (err) {
        if (err._code === 2) {
          throw new IsReference(this._collection, this.contents);
        } else {
          console.log(err);
          throw new Error("[OneModel] Unexpected error in store: ");
        }
      }
      return this;
    }

    getPublic() {
      return this._getPublicWithTypes(this.contents, this._types, false);
    }

    async generateDerived() {
      return this._generateDerived(this.contents, this._types, true);
    }
  };
};
