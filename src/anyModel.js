"use strict";
const { checkType } = require("@apparts/types");

const makeAnyModel = (types, collection) => {
  return class AnyModel {
    constructor(dbs) {
      this._dbs = dbs;
      this._fromDB = false;
      this._collection = collection;
      this._types = types;
      this._keys = Object.keys(types).filter((key) => types[key].key);
      this._autos = Object.keys(types).filter((key) => types[key].auto);
      const storedValues = Object.keys(types).filter(
        (key) =>
          !types[key].auto &&
          !types[key].derived &&
          types[key].persisted !== false
      );
      if (!types) {
        throw new Error("[AnyModel] No types given");
      }
      if (this._keys.length === 0) {
        throw new Error("[AnyModel] Types not well defined: No key found");
      }
      if (storedValues.length === 0) {
        throw new Error(
          "[AnyModel] Types not well defined: No stored, not generated key found"
        );
      }
      if (!collection) {
        throw new Error("[AnyModel] No collection given");
      }
      if (!dbs) {
        throw new Error("[AnyModel] No dbs given");
      }
    }

    static getTypes() {
      return types;
    }

    getDefaults(values, key) {
      if (typeof this._types[key].default === "function") {
        return values.map((c) => ({
          ...c,
          [key]: c[key] || this._types[key].default(c),
        }));
      } else if (this._types[key].default !== undefined) {
        return values.map((c) => ({
          ...c,
          [key]: c[key] || this._types[key].default,
        }));
      } else {
        return values;
      }
    }

    _fillInDefaults(values) {
      for (const key in this._types) {
        values = this.getDefaults(values, key);
      }
      return values;
    }

    async _load(f) {
      if (this._fromDB) {
        throw new Error(
          "[AnyModel] load on already loaded model, Can't load twice"
        );
      }
      const cs = await f.toArray();
      this._fromDB = true;
      const contents = cs.map((c) => this._convertIds(c));
      this._loadedKeys = cs.map((c) => this._keys.map((key) => c[key]));
      return contents;
    }

    async _update(contents) {
      const newKeys = contents.map((c) => this._keys.map((key) => c[key]));
      if (
        !(
          this._loadedKeys.length === newKeys.length &&
          this._loadedKeys.every((vs, i) =>
            vs.every((v, j) => newKeys[i][j] === v)
          )
        )
      ) {
        console.log("E46:", contents, this._loadedKeys, newKeys);
        throw new Error(
          "[AnyModel] tried to update but IDs did not match loaded IDs, E46"
        );
      }
      if (!this._checkTypes(contents)) {
        throw new Error(
          "[AnyModel] type-constraints not met: " + JSON.stringify(contents)
        );
      }

      if (contents.length > 1) {
        await Promise.all(contents.map((c) => this._updateOne(c)));
      } else {
        if (contents.length > 0) {
          await this._updateOne(contents[0]);
        }
      }
    }

    _removeAutos(c) {
      const val = { ...c };
      for (const auto of this._autos) {
        delete val[auto];
      }
      return val;
    }

    _getKeyFilter(c) {
      const filter = {};
      for (const key of this._keys) {
        filter[key] = c[key];
      }
      return filter;
    }

    async _updateOne(c) {
      await this._dbs
        .collection(this._collection)
        .updateOne(this._getKeyFilter(c), this._removeAutos(c));
    }

    _convertIds(c) {
      for (const key in this._types) {
        if (!c[key]) {
          continue;
        }
        if (this._types[key].type === "id") {
          c[key] = this._dbs.fromId(c[key]);
        } else if (this._types[key].type === "array_id") {
          c[key] = c[key].map((v) => this._dbs.fromId(v));
        }
      }
      return c;
    }

    async _store(contents) {
      if (contents.length < 1) {
        return Promise.resolve();
      }
      if (!this._checkTypes(contents)) {
        throw new Error(
          "[AnyModel] type-constraints not met: " + JSON.stringify(contents)
        );
      }

      const ids = await this._dbs
        .collection(this._collection)
        .insert(contents, this._autos, this._autos);

      if (ids) {
        contents = contents.map((c, i) => ({
          ...c,
          ...ids[i],
        }));
      }
      this._loadedKeys = contents.map((c) => this._keys.map((key) => c[key]));
      return contents;
    }

    _checkTypes(contents) {
      for (const c of contents) {
        for (const key in this._types) {
          if (this._autos.indexOf(key) !== -1) {
            continue;
          }
          const val = c[key];
          if (
            this._types[key].derived ||
            this._types[key].persisted === false
          ) {
            delete c[key];
            continue;
          }
          const present = val !== undefined && val !== null;
          if (
            (!present && !this._types[key].optional) ||
            (present && !checkType(val, this._types[key]))
          ) {
            console.log(key, val);
            return false;
          }
          if (!present) {
            c[key] = null;
          }
        }
      }
      return true;
    }

    async _generateDerived(contents, types) {
      this._derived = await Promise.all(
        contents.map(async (c) => {
          const ret = {};
          for (const key in types) {
            if (types[key].derived) {
              ret[key] = await types[key].derived(c, this);
            }
          }
          return ret;
        })
      );
    }

    _getPublicWithTypes(contents, types, single) {
      let hasName = false;
      for (const key in types) {
        if (types[key].name) {
          if (hasName) {
            throw new Error("[AnyModel] Multiple Names specified");
          }
          hasName = true;
        }
      }

      let retObj = {};
      if (!hasName) {
        retObj = [];
      }
      let counter = 0;
      for (const c of contents) {
        const obj = {};
        for (const key in types) {
          let val = c[key];
          if (types[key].derived) {
            if (!this._derived) {
              throw new Error(
                "[AnyModel] getPublic called without generating derived first."
              );
            }
            val = this._derived[counter][key];
          }
          if (types[key].public && val !== undefined && val !== null) {
            if (types[key].mapped) {
              obj[types[key].mapped] = val;
            } else {
              obj[key] = val;
            }
          }
          if (types[key].name) {
            if (types[key].groupBy) {
              retObj[val] = retObj[val] || [];
              retObj[val].push(obj);
            } else {
              retObj[val] = obj;
            }
          }
        }
        if (!hasName) {
          retObj.push(obj);
        }
        counter++;
      }
      if (single) {
        if (!hasName) {
          return retObj[0];
        } else {
          return retObj[Object.keys(retObj)[0]];
        }
      }
      return retObj;
    }
  };
};

module.exports = { makeAnyModel };
