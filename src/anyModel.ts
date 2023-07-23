import { GenericQueriable, GenericQuery } from "@apparts/db";
import {
  checkType,
  Required,
  Obj,
  Type,
  InferType,
  InferNotDerivedType,
  InferPublicType,
  fillInDefaultsStrict,
} from "@apparts/types";
import { TypeMissmatchError, UnexpectedModelError } from "./errors";

export const makeAnyModel = <TypeSchema extends Obj<Required, any>>({
  typeSchema,
  collection,
}: {
  typeSchema: TypeSchema;
  collection: string;
}) => {
  return class AnyModel {
    _dbs: GenericQueriable;
    _fromDB: boolean;
    _collection: string;
    _types: Record<string, Type>;
    _keys: string[];
    _autos: string[];
    _loadedKeys: unknown[][] | undefined;
    _contentWithDerived: InferType<TypeSchema>[] | undefined;

    constructor(dbs: GenericQueriable) {
      this._dbs = dbs;
      this._fromDB = false;
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
    }

    static getCollection() {
      return collection;
    }

    static getSchema() {
      return typeSchema;
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
              collection,
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
  };
};
