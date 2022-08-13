"use strict";

const {
  NotUnique,
  NotFound,
  DoesExist,
  IsReference,
  ConstraintFailed,
} = require("./errors");
const useAnyModel = require("./anyModel");

const makeOneModel = (types, collection) => {
  const AnyModel = useAnyModel(types, collection);

  return class OneModel extends AnyModel {
    constructor(dbs, content) {
      super(dbs);
      if (content) {
        if (Array.isArray(content)) {
          throw new Error(
            "[OneModel] cannot create multiple. Use ManyModel instead!"
          );
        }
        this.content = this._fillInDefaults([content])[0];
      }
    }

    async load(filter) {
      await this._loadOne(
        this._dbs.collection(this._collection).find(filter, 2),
        filter
      );
      return this;
    }

    async _loadOne(f, filter) {
      const [content, something] = await this._load(f);
      if (something) {
        throw new NotUnique(this._collection, filter, content, something);
      } else if (!content) {
        throw new NotFound(this._collection, filter);
      }
      this.content = content;
    }

    async loadById(id) {
      if (typeof id === "object") {
        const req = {};
        if (Object.keys(id).length !== this._keys.length) {
          throw new Error(`[OneModel] loadById not all keys given, E49.
Collection: "${this._collection}", Keys: "${JSON.stringify(
            this._keys
          )}", Id: "${JSON.stringify(id)}"`);
        }
        this._keys.forEach((key) => {
          if (this._types[key].type === "id") {
            req[key] = this._dbs.toId(id[key]);
          } else {
            req[key] = id[key];
          }
        });
        await this._loadOne(
          this._dbs.collection(this._collection).findById(req),
          id
        );
      } else {
        if (this._keys.length > 1) {
          throw new Error(`[OneModel] loadById not all keys given, E49.
Collection: "${this._collection}", Keys: "${JSON.stringify(
            this._keys
          )}", Id: "${JSON.stringify(id)}"`);
        }
        await this._loadOne(
          this._dbs
            .collection(this._collection)
            .findById({ [this._keys[0]]: this._dbs.toId(id) }),
          id
        );
      }
      return this;
    }

    async store() {
      try {
        const a = await this._store([this.content]);
        const [x] = a;
        this.content = x;
      } catch (err) {
        // MONGO
        if (err._code === 1) {
          throw new DoesExist(this._collection, { triedToStore: this.content });
        } else if (err._code === 3) {
          throw new ConstraintFailed(this._collection, this.content);
        } else {
          console.log(err);
          throw new Error("[OneModel] Unexpected error in store: ");
        }
      }
      return this;
    }

    async update() {
      await this._update([this.content]);
      return this;
    }

    set(field, val) {
      this.content[field] = val;
      return this;
    }

    async delete() {
      try {
        await this._dbs
          .collection(this._collection)
          .remove(this._getKeyFilter(this.content));
      } catch (err) {
        console.log("IN MODEL", err);
        if (err._code === 2) {
          throw new IsReference(this._collection, this.content);
        } else {
          console.log(err);
          throw new Error("[OneModel] Unexpected error in store: ");
        }
      }
      return this;
    }

    getPublic() {
      return this._getPublicWithTypes([this.content], this._types, true);
    }

    async generateDerived() {
      return this._generateDerived([this.content], this._types, true);
    }
  };
};

module.exports = { makeOneModel };
