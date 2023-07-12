import { GenericQueriable, Order, Params } from "@apparts/db";

import { InferNotDerivedType, InferType, Obj, Required } from "@apparts/types";
import { makeAnyModel } from "./anyModel";
import {
  ConstraintFailed,
  DoesExist,
  IsReference,
  NotAllKeysGivenError,
  NotFound,
  NotUnique,
  UnexpectedModelError,
} from "./errors";

export const makeManyModel = <TypeSchema extends Obj<Required, any>>({
  typeSchema,
  collection,
}: {
  typeSchema: TypeSchema;
  collection: string;
}) => {
  const AnyModel = makeAnyModel({ typeSchema, collection });

  return class ManyModel extends AnyModel {
    contents: InferNotDerivedType<typeof typeSchema>[];

    // TODO: Should contents really be Partial?
    constructor(
      dbs: GenericQueriable,
      contents: Partial<InferNotDerivedType<TypeSchema>>[]
    ) {
      super(dbs);
      if (contents) {
        this.contents = this._fillInDefaults(contents);
      } else {
        this.contents = [];
      }
    }

    async load(filter: Params, limit?: number, offset?: number, order?: Order) {
      this.contents = await this._load(
        this._dbs
          .collection(this._collection)
          .find(filter, limit, offset, order)
      );
      return this;
    }

    async loadOne(filter: Params) {
      const [content, something] = await this._load(
        this._dbs.collection(this._collection).find(filter, 2)
      );
      if (something) {
        throw new NotUnique(this._collection, { filter, content, something });
      } else if (!content) {
        throw new NotFound(this._collection, filter);
      }
      this.contents = [content];
      return this;
    }

    async loadNone(filter: Params) {
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

    protected hasValidKeys(filter: Params) {
      if (
        // currently this has quadratic execution time but the keys
        // list should usually be rather short. Could be optimized later
        Object.keys(filter).reduce(
          (a, b) => a && this._keys.includes(b),
          true
        ) &&
        this._keys.length === Object.keys(filter).length
      ) {
        return true;
      }
      return false;
    }

    async loadByKeys(
      ids: { [u: string]: unknown[] },
      limit?: number,
      offset?: number
    ) {
      const req = {};
      if (!this.hasValidKeys(ids)) {
        throw new NotAllKeysGivenError(this._collection, {
          keys: this._keys,
          filter: ids,
        });
      }

      this.contents = await this._load(
        this._dbs.collection(this._collection).findByIds(ids, limit, offset)
      );
      return this;
    }

    async loadOneByKeys(filter: Params) {
      if (!this.hasValidKeys(filter)) {
        throw new NotAllKeysGivenError(this._collection, {
          keys: this._keys,
          filter,
        });
      }
      const [content, something] = await this._load(
        this._dbs.collection(this._collection).findByIds(filter, 2)
      );
      if (something) {
        throw new NotUnique(this._collection, { filter, content, something });
      } else if (!content) {
        throw new NotFound(this._collection, filter);
      }
      this.contents = [content];
      return this;
    }

    async loadNoneByKeys(filter: Params) {
      if (!this.hasValidKeys(filter)) {
        throw new NotAllKeysGivenError(this._collection, {
          keys: this._keys,
          filter,
        });
      }

      return this.loadNone(filter);
    }

    async store() {
      try {
        this.contents = await this._store(this.contents);
      } catch (err) {
        // MONGO
        if ((err as Record<string, any>)?._code === 1) {
          throw new NotUnique(this._collection, {
            triedToStore: this.contents,
          });
        } else if ((err as Record<string, any>)?._code === 3) {
          throw new ConstraintFailed(this._collection, this.contents);
        } else {
          throw new UnexpectedModelError("[ManyModel]", err);
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

    async deleteAll() {
      if (this.length() == 0) {
        return this;
      }
      const filter = {};
      for (const key of this._keys) {
        filter[key] = { val: this.contents.map((c) => c[key]), op: "in" };
      }
      try {
        await this._dbs.collection(this._collection).remove(filter);
      } catch (err) {
        if ((err as Record<string, any>)?._code === 2) {
          throw new IsReference(this._collection, this.contents);
        } else {
          throw new UnexpectedModelError("[ManyModel]", err);
        }
      }
      return this;
    }

    async getPublic() {
      return await this._getPublicWithTypes(this.contents);
    }

    async getWithDerived(): Promise<InferType<TypeSchema>[]> {
      return await this._getWithDerived(this.contents);
    }
  };
};
