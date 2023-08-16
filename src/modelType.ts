import { GenericQueriable, GenericQuery, Order, Params } from "@apparts/db";
import {
  checkType,
  fillInDefaultsStrict,
  InferNotDerivedType,
  InferPublicType,
  InferType,
  Obj,
  Required,
  Type,
  InferIsKeyType,
} from "@apparts/types";
import {
  ConstraintFailed,
  DoesExist,
  IsReference,
  NotAllKeysGivenError,
  NotFound,
  NotUnique,
  TypeMissmatchError,
  UnexpectedModelError,
} from "./errors";

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object | undefined
    ? RecursivePartial<T[P]>
    : T[P];
};

type _<T> = T extends object ? { [k in keyof T]: T[k] } : T;
type IsKeysParams<TypeSchema extends Obj<Required, any>> = _<{
  [key in keyof InferIsKeyType<TypeSchema>]: any;
}>;

export abstract class Model<TypeSchema extends Obj<Required, any>> {
  _dbs: GenericQueriable;
  _fromDB: boolean;
  _collection: string;
  _types: Record<string, Type>;
  _keys: string[];
  _autos: string[];
  _loadedKeys: unknown[][] | undefined;
  _contentWithDerived: InferType<TypeSchema>[] | undefined;
  isOne = false;
  _contents: InferNotDerivedType<TypeSchema>[];

  // TODO: Should contents really be Partial?
  constructor(
    dbs: GenericQueriable,
    contents?: RecursivePartial<InferNotDerivedType<TypeSchema>>[]
  ) {
    this._dbs = dbs;
    this._fromDB = false;
    this._collection = "";
    this._types = {};

    this._keys = [];
    this._autos = [];
    this._contents = [];
  }

  get content() {
    if (!this.isOne) {
      throw new NotUnique(this._collection, {
        contents: this._contents,
      });
    }
    return this._contents[0];
  }

  set content(c: InferNotDerivedType<TypeSchema>) {
    if (!this.isOne) {
      throw new NotUnique(this._collection, {
        contents: this._contents,
      });
    }
    this._contents = [c];
  }

  set contents(c: InferNotDerivedType<TypeSchema>[]) {
    this._contents = c;
    if (c.length === 1) {
      this.isOne = true;
    }
  }

  get contents() {
    return this._contents;
  }

  async load(
    filter: Params,
    limit?: number,
    offset?: number,
    order?: Order
  ): Promise<this> {
    this._contents = await this._load(
      this._dbs.collection(this._collection).find(filter, limit, offset, order)
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
    this._contents = [content];
    this.isOne = true;
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

  hasValidKeys(filter: Params) {
    if (
      // currently this has quadratic execution time but the keys
      // list should usually be rather short. Could be optimized later
      Object.keys(filter).reduce((a, b) => a && this._keys.includes(b), true) &&
      this._keys.length === Object.keys(filter).length
    ) {
      return true;
    }
    return false;
  }

  async loadByKeys(
    ids: IsKeysParams<TypeSchema>,
    limit?: number,
    offset?: number
  ) {
    if (!this.hasValidKeys(ids)) {
      throw new NotAllKeysGivenError(this._collection, {
        keys: this._keys,
        filter: ids,
      });
    }

    this._contents = await this._load(
      this._dbs.collection(this._collection).findByIds(ids, limit, offset)
    );
    return this;
  }

  async loadOneByKeys(filter: IsKeysParams<TypeSchema>) {
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
    this._contents = [content];
    this.isOne = true;
    return this;
  }

  async loadNoneByKeys(filter: IsKeysParams<TypeSchema>) {
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
      this._contents = await this._store(this._contents);
    } catch (err) {
      // MONGO
      if ((err as Record<string, any>)?._code === 1) {
        throw new NotUnique(this._collection, {
          triedToStore: this._contents,
        });
      } else if ((err as Record<string, any>)?._code === 3) {
        throw new ConstraintFailed(this._collection, this._contents);
      } else {
        throw new UnexpectedModelError("[ManyModel]", err);
      }
    }
    return this;
  }

  async update() {
    await this._update(this._contents);
    return this;
  }

  length() {
    return this._contents.length;
  }

  async deleteAll() {
    if (this.length() == 0) {
      return this;
    }
    const filter = {};
    for (const key of this._keys) {
      filter[key] = { val: this._contents.map((c) => c[key]), op: "in" };
    }
    try {
      await this._dbs.collection(this._collection).remove(filter);
    } catch (err) {
      if ((err as Record<string, any>)?._code === 2) {
        throw new IsReference(this._collection, this._contents);
      } else {
        throw new UnexpectedModelError("[ManyModel]", err);
      }
    }
    return this;
  }

  async getPublic() {
    return await this._getPublicWithTypes(this._contents);
  }

  async getWithDerived(): Promise<InferType<TypeSchema>[]> {
    return await this._getWithDerived(this._contents);
  }

  checkTypes() {
    return this._checkTypes(this._contents);
  }

  getWithDefaults(values: InferNotDerivedType<TypeSchema>[], key) {
    return values.map((value) => ({
      ...value,
      [key]: fillInDefaultsStrict(this._types[key], value[key]),
    }));
  }

  _fillInDefaults(values: InferNotDerivedType<TypeSchema>[]) {
    return values.map((value) =>
      fillInDefaultsStrict(
        {
          type: "object",
          keys: this._types,
        },
        value
      )
    );
  }

  async _load(f: GenericQuery) {
    if (this._fromDB) {
      throw new Error(
        "[AnyModel] load on already loaded model, Refusing to load twice"
      );
    }
    const cs = await f.toArray<InferNotDerivedType<TypeSchema>>();
    this._fromDB = true;
    const contents = cs.map((c) => this._convertIds(c));
    this._loadedKeys = cs.map((c) => this._keys.map((key) => c[key]));
    return contents;
  }

  async _update(contents: InferNotDerivedType<TypeSchema>[]) {
    const newKeys = contents.map((c) => this._keys.map((key) => c[key]));
    if (
      !this._loadedKeys ||
      !(
        this._loadedKeys.length === newKeys.length &&
        this._loadedKeys.every((vs, i) =>
          vs.every((v, j) => newKeys[i][j] === v)
        )
      )
    ) {
      throw new UnexpectedModelError(
        "[AnyModel]",
        "tried to update but IDs did not match loaded IDs. Contents: " +
          JSON.stringify(contents, undefined, 2) +
          " Loaded keys: " +
          JSON.stringify(this._loadedKeys, undefined, 2) +
          " New keys: " +
          JSON.stringify(newKeys, undefined, 2)
      );
    }
    this._checkTypes(contents);

    if (contents.length > 1) {
      await Promise.all(contents.map((c) => this._updateOne(c)));
    } else if (contents.length > 0) {
      await this._updateOne(contents[0]);
    }
  }

  _removeAutos(c: InferNotDerivedType<TypeSchema>) {
    const val = { ...c };
    for (const auto of this._autos) {
      delete val[auto];
    }
    return val;
  }

  _getKeyFilter(c: InferNotDerivedType<TypeSchema>) {
    const filter = {};
    for (const key of this._keys) {
      filter[key] = c[key];
    }
    return filter;
  }

  async _updateOne(c: InferNotDerivedType<TypeSchema>) {
    await this._dbs
      .collection(this._collection)
      .updateOne(this._getKeyFilter(c), this._removeAutos(c));
  }

  _convertIds(c: InferNotDerivedType<TypeSchema>) {
    for (const key in this._types) {
      if (!c[key]) {
        continue;
      }
      const fieldType = this._types[key];
      if ("type" in fieldType && fieldType.type === "id") {
        c[key] = this._dbs.fromId(c[key]);
      }
    }
    return c;
  }

  async _store(
    contents: InferNotDerivedType<TypeSchema>[]
  ): Promise<InferNotDerivedType<TypeSchema>[]> {
    if (contents.length < 1) {
      return Promise.resolve([]);
    }
    this._checkTypes(contents);

    const ids = await this._dbs
      .collection(this._collection)
      .insert(contents, this._autos);

    if (ids) {
      contents = contents.map((c, i) => ({
        ...c,
        ...ids[i],
      }));
    }
    this._loadedKeys = contents.map((c) => this._keys.map((key) => c[key]));
    return contents;
  }

  _checkTypes(contents: InferNotDerivedType<TypeSchema>[]) {
    for (const c of contents) {
      for (const key in this._types) {
        if (this._autos.indexOf(key) !== -1) {
          continue;
        }
        const val = c[key];
        if (
          this._types[key].derived
          /* || this._types[key].persisted === false */
        ) {
          delete c[key];
          continue;
        }
        const present = val !== undefined && val !== null;
        if (
          (!present && !this._types[key].optional) ||
          (present && !checkType(val, this._types[key]))
        ) {
          throw new TypeMissmatchError(
            "[AnyModel]",
            this._collection,
            contents,
            key,
            val
          );
        }
        if (!present) {
          c[key] = null;
        }
      }
    }
    return true;
  }

  async _getWithDerived(
    contents: InferNotDerivedType<TypeSchema>[]
  ): Promise<InferType<TypeSchema>[]> {
    if (this._contentWithDerived) {
      return this._contentWithDerived;
    }

    const types = this._types;
    const derivedData = await Promise.all(
      contents.map(async (c) => {
        const ret = { ...c };
        for (const key in types) {
          const { derived } = types[key];
          if (derived) {
            ret[key] = await derived(c, this);
          }
        }
        return ret;
      })
    );
    this._contentWithDerived = derivedData;
    return derivedData;
  }

  async _getPublicWithTypes(
    contents: InferNotDerivedType<TypeSchema>[]
  ): Promise<InferPublicType<TypeSchema>[]> {
    const contentsDerived = await this._getWithDerived(contents);

    const types = this._types;
    const retArr: InferPublicType<TypeSchema>[] = [];
    for (const c of contentsDerived) {
      const obj: Record<string, unknown> = {};
      for (const key in types) {
        const val = c[key];
        if (types[key].public && val !== undefined && val !== null) {
          const { mapped } = types[key];
          if (mapped) {
            obj[mapped] = val;
          } else {
            obj[key] = val;
          }
        }
      }
      retArr.push(obj);
    }
    return retArr;
  }
}
