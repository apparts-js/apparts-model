import { GenericDBS } from "@apparts/db";
import {
  InferType,
  InferNotDerivedType,
  Required,
  Obj,
  HasType,
} from "@apparts/types";
import {
  UnexpectedModelError,
  NotUnique,
  IsReference,
  ConstraintFailed,
  DoesExist,
  NotFound,
} from "./errors";
import { makeAnyModel } from "./anyModel";

export const makeManyModel = <TypeSchema extends Obj<Required, any>>({
  typeSchema,
  collection,
}: {
  typeSchema: TypeSchema;
  collection: string;
}) => {
  const AnyModel = makeAnyModel({ typeSchema, collection });

  type DataComplete = InferType<typeof typeSchema>;

  return class ManyModel extends AnyModel {
    contents: InferNotDerivedType<typeof typeSchema>[];

    // TODO: Should contents really be Partial?
    constructor(
      dbs: GenericDBS,
      contents: Partial<InferNotDerivedType<typeof typeSchema>>[]
    ) {
      super(dbs);
      if (contents) {
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

    async loadOne(filter) {
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
          if ((this._types[key] as HasType).type === "id") {
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

    async getWithDerived(): Promise<DataComplete[]> {
      return await this._getWithDerived(this.contents);
    }
  };
};
