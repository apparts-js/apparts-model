import { SETUPDB } from "./tests/databaseSetup";
import {
  type,
  multiKeyType,
  noAutoType,
  foreignType,
  derivedType,
  defaultType,
  optionalType,
} from "./tests/testTypes";
import { setup, teardown } from "./tests/database";
import {
  BaseModel,
  useModel,
  getModelCollection,
  getModelSchema,
  ConstructorParams,
} from "./index";
import {
  TypeMissmatchError,
  ConstraintFailed,
  DoesExist,
  IsReference,
  NotAllKeysGivenError,
  NotFound,
  NotUnique,
  UnexpectedModelError,
  ConcurrencyError,
} from "./errors";
import { GenericDBS } from "@apparts/db";

class Models extends BaseModel<typeof type> {}
useModel(Models, { collection: "users", typeSchema: type });

class ModelsMultiKey extends BaseModel<typeof multiKeyType> {}
useModel(ModelsMultiKey, { collection: "users2", typeSchema: multiKeyType });
class ModelsNoAuto extends BaseModel<typeof noAutoType> {}
useModel(ModelsNoAuto, { collection: "users3", typeSchema: noAutoType });
class ModelsForeign extends BaseModel<typeof foreignType> {}
useModel(ModelsForeign, { collection: "comment", typeSchema: foreignType });
class ModelsDerived extends BaseModel<typeof derivedType> {
  constructor(...args: ConstructorParams<typeof derivedType>) {
    super(...args);
    this.derived({
      derivedAsync: async () => new Promise((res) => res("test")),
      derivedId: (c) => c.id,
      derivedObj: () => ({
        prop: "str",
      }),
    });
  }
}
useModel(ModelsDerived, { collection: "derived", typeSchema: derivedType });
class ModelsWDefault extends BaseModel<typeof defaultType> {}
useModel(ModelsWDefault, { collection: "wdefault", typeSchema: defaultType });
class ModelsWOptional extends BaseModel<typeof optionalType> {}
useModel(ModelsWOptional, {
  collection: "optionalType",
  typeSchema: optionalType,
});

let dbs: GenericDBS;
beforeAll(async () => {
  dbs = await setup([SETUPDB], null, "appartsmanymodeltests");
});
afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await new ModelsForeign(dbs).delete({});
  await new Models(dbs).delete({});
  await new ModelsMultiKey(dbs).delete({});
  await new ModelsNoAuto(dbs).delete({});
  await new ModelsDerived(dbs).delete({});
  await new ModelsWDefault(dbs).delete({});
});

describe("Static properties", () => {
  it("should return collection", async () => {
    expect(getModelCollection(Models)).toBe("users");
  });
  it("should return schema", async () => {
    expect(getModelSchema(Models)).toStrictEqual(type);
  });
});

describe("Creation", () => {
  test("creation of many", async () => {
    const m = new Models(dbs, [{ test: 1 }, { test: 2, a: 3 }]);
    await expect(m.store()).resolves.toBe(m);
    const [{ id: id1 }, { id: id2 }] = m.contents;
    expect(m.contents).toMatchObject([
      { test: 1, id: id1 },
      { test: 2, id: id2, a: 3 },
    ]);
    const saved = await new Models(dbs).load({});
    expect(saved.contents).toStrictEqual([
      { test: 1, id: id1, a: null },
      { test: 2, id: id2, a: 3 },
    ]);
  });

  test("creation of many with derived", async () => {
    const m = new ModelsDerived(dbs, [{ test: 1 }, { test: 2 }]);
    await expect(m.store()).resolves.toBeTruthy();
    expect(m.contents).toStrictEqual([
      { id: 1, test: 1 },
      { id: 2, test: 2 },
    ]);
  });

  test("creation of many with default", async () => {
    const m = new ModelsWDefault(dbs, [
      {
        objWithDefault: {},
      },
      {
        hasDefault: 7,
        hasDefaultFn: 8,
        objWithDefault: {
          deepHasDefault: "yay",
          deepHasDefaultFn: "nay",
        },
      },
    ]);
    await expect(m.store()).resolves.toBeTruthy();
    expect(m.contents).toStrictEqual([
      {
        id: 1,
        hasDefault: 3,
        hasDefaultFn: 4,
        objWithDefault: {
          deepHasDefault: "inner",
          deepHasDefaultFn: "inner fn",
        },
      },
      {
        id: 2,
        hasDefault: 7,
        hasDefaultFn: 8,
        objWithDefault: {
          deepHasDefault: "yay",
          deepHasDefaultFn: "nay",
        },
      },
    ]);
  });
});

describe("Update", () => {
  test("update", async () => {
    const ms = new Models(dbs);

    const [{ id: id1 }] = (await new Models(dbs, [{ test: 10, a: 4 }]).store())
      .contents;
    const [{ id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 11, a: 4 },
        { test: 12, a: 4 },
      ]).store()
    ).contents;
    await ms.load({ a: 4 });
    ms.contents.forEach((c) => (c.a = 999));
    await ms.update();
    const newms = await new Models(dbs).load({ a: 999 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 999, id: id1 },
      { test: 11, a: 999, id: id2 },
      { test: 12, a: 999, id: id3 },
    ]);
  });

  test("update with removal of optional value", async () => {
    const ms = new Models(dbs);

    const [{ id: id1 }] = (await new Models(dbs, [{ test: 77, a: 99 }]).store())
      .contents;

    await ms.load({ test: 77, a: 99 });
    ms.contents.forEach((c) => (c.a = undefined));
    await ms.update();
    const newms = await new Models(dbs).load({ test: 77 });

    expect(newms.contents).toMatchObject([{ test: 77, a: null, id: id1 }]);
    expect(newms.contents[0].a).toBe(null);
  });

  test("update with adding of optional value", async () => {
    const ms = new ModelsWOptional(dbs);

    const [{ id: id1 }] = (await new ModelsWOptional(dbs, [{}]).store())
      .contents;

    await ms.load({ id: id1 });
    ms.contents.forEach((c) => (c.objOptional = { a: "test" }));
    await ms.update();
    const newms = await new ModelsWOptional(dbs).load({ id: id1 });

    expect(newms.contents).toMatchObject([
      { id: id1, objOptional: { a: "test" } },
    ]);
  });

  test("update with nested obj", async () => {
    const ms = new ModelsWDefault(dbs);

    const [{ id: id1 }] = (
      await new ModelsWDefault(dbs, [
        {
          objWithDefault: {
            deepHasDefault: "abc",
            deepHasDefaultFn: "def",
          },
        },
      ]).store()
    ).contents;

    await ms.load({ id: id1 });
    ms.contents.forEach((c) => (c.objWithDefault.deepHasDefault = "ghi"));
    await ms.update();
    const newms = await new ModelsWDefault(dbs).load({ id: id1 });

    expect(newms.contents).toMatchObject([
      {
        id: id1,
        objWithDefault: { deepHasDefault: "ghi", deepHasDefaultFn: "def" },
      },
    ]);
  });

  test("update fails, keys changed", async () => {
    const [{ id: id1 }] = (
      await new Models(dbs, [{ test: 10, a: 4000 }]).store()
    ).contents;
    const [{ id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 11, a: 4000 },
        { test: 12, a: 4000 },
      ]).store()
    ).contents;
    const ms = await new Models(dbs).load({ a: 4000 });
    ms.contents.forEach((c, i) => (c.id = 999 + i));
    await expect(async () => await ms.update()).rejects.toThrow(
      UnexpectedModelError
    );
    const newms = await new Models(dbs).load({ a: 4000 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 4000, id: id1 },
      { test: 11, a: 4000, id: id2 },
      { test: 12, a: 4000, id: id3 },
    ]);
  });

  test("update fails, length of content changed", async () => {
    const [{ id: id1 }] = (
      await new Models(dbs, [{ test: 10, a: 4001 }]).store()
    ).contents;
    const [{ id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 11, a: 4001 },
        { test: 12, a: 4001 },
      ]).store()
    ).contents;
    const ms = await new Models(dbs).load({ a: 4001 });
    ms.contents = ms.contents.slice(1);
    await expect(async () => await ms.update()).rejects.toThrow(
      UnexpectedModelError
    );
    const newms = await new Models(dbs).load({ a: 4001 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 4001, id: id1 },
      { test: 11, a: 4001, id: id2 },
      { test: 12, a: 4001, id: id3 },
    ]);
  });

  test("update fails, content does not fit schema", async () => {
    const [{ id: id1 }] = (
      await new Models(dbs, [{ test: 10, a: 4002 }]).store()
    ).contents;
    const [{ id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 11, a: 4002 },
        { test: 12, a: 4002 },
      ]).store()
    ).contents;
    const ms = await new Models(dbs).load({ a: 4002 });
    // @ts-expect-error test type
    ms.contents[1].test = "sheesh";
    await expect(async () => await ms.update()).rejects.toThrow(
      TypeMissmatchError
    );
    const newms = await new Models(dbs).load({ a: 4002 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 4002, id: id1 },
      { test: 11, a: 4002, id: id2 },
      { test: 12, a: 4002, id: id3 },
    ]);
  });
});

describe("Update with concurrency check", () => {
  test("updateWithConcurrencyCheckOn", async () => {
    const ms = new Models(dbs);

    const [{ id: id1 }] = (await new Models(dbs, [{ test: 10, a: 4 }]).store())
      .contents;
    const [{ id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 11, a: 4 },
        { test: 12, a: 4 },
      ]).store()
    ).contents;
    await ms.load({ a: 4 });
    ms.contents.forEach((c) => (c.a = 1001));
    await ms.updateWithConcurrencyCheckOn(["test"]);
    const newms = await new Models(dbs).load({ a: 1001 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 1001, id: id1 },
      { test: 11, a: 1001, id: id2 },
      { test: 12, a: 1001, id: id3 },
    ]);
  });

  test("updateWithConcurrencyCheckOn one", async () => {
    const ms = new Models(dbs);

    const [{ id: id1 }] = (
      await new Models(dbs, [{ test: 10, a: 411 }]).store()
    ).contents;
    await ms.loadOne({ a: 411 });
    ms.contents.forEach((c) => (c.a = 41001));
    await ms.updateWithConcurrencyCheckOn(["test"]);
    const newms = await new Models(dbs).load({ a: 41001 });

    expect(newms.contents).toMatchObject([{ test: 10, a: 41001, id: id1 }]);
  });

  test("updateWithConcurrencyCheckOn on just stored model", async () => {
    const ms = await new Models(dbs, [{ test: 10, a: 99 }]).store();
    ms.contents.forEach((c) => (c.a = 1011));
    await ms.updateWithConcurrencyCheckOn(["test"]);
    const newms = await new Models(dbs).load({ a: 1011 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 1011, id: ms.content.id },
    ]);
  });

  test("updateWithConcurrencyCheckOn on just updated model", async () => {
    const ms = await new Models(dbs, [{ test: 10, a: 99 }]).store();
    ms.contents.forEach((c) => (c.a = 1011));
    await ms.updateWithConcurrencyCheckOn(["a"]);
    ms.contents.forEach((c) => (c.a = 1012));
    await ms.updateWithConcurrencyCheckOn(["a"]);

    const newms = await new Models(dbs).load({ a: 1012 });
    expect(newms.contents).toMatchObject([
      { test: 10, a: 1012, id: ms.content.id },
    ]);
  });

  test("updateWithConcurrencyCheckOn with optional key as unchanged", async () => {
    const ms = await new Models(dbs, [{ test: 10 }]).store();
    ms.contents.forEach((c) => (c.test = 1011));
    await ms.updateWithConcurrencyCheckOn(["a"]);

    // Check, that loaded model can also update with concurrency check
    // on empty key
    const newms = await new Models(dbs).load({ test: 1011 });
    newms.contents.forEach((c) => (c.test = 1012));
    await newms.updateWithConcurrencyCheckOn(["a"]);

    expect(newms.contents).toMatchObject([
      { test: 1012, a: null, id: ms.content.id },
    ]);
  });

  test("updateWithConcurrencyCheckOn fails, keys changed", async () => {
    const [{ id: id1 }] = (
      await new Models(dbs, [{ test: 10, a: 5000 }]).store()
    ).contents;
    const [{ id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 11, a: 5000 },
        { test: 12, a: 5000 },
      ]).store()
    ).contents;
    const ms = await new Models(dbs).load({ a: 5000 });
    ms.contents.forEach((c, i) => (c.id = 1001 + i));
    await expect(
      async () => await ms.updateWithConcurrencyCheckOn(["test"])
    ).rejects.toThrow(UnexpectedModelError);
    const newms = await new Models(dbs).load({ a: 5000 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 5000, id: id1 },
      { test: 11, a: 5000, id: id2 },
      { test: 12, a: 5000, id: id3 },
    ]);
  });

  test("updateWithConcurrencyCheckOn fails, length of content changed", async () => {
    const [{ id: id1 }] = (
      await new Models(dbs, [{ test: 10, a: 5001 }]).store()
    ).contents;
    const [{ id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 11, a: 5001 },
        { test: 12, a: 5001 },
      ]).store()
    ).contents;
    const ms = await new Models(dbs).load({ a: 5001 });
    ms.contents = ms.contents.slice(1);
    await expect(
      async () => await ms.updateWithConcurrencyCheckOn(["test"])
    ).rejects.toThrow(UnexpectedModelError);
    const newms = await new Models(dbs).load({ a: 5001 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 5001, id: id1 },
      { test: 11, a: 5001, id: id2 },
      { test: 12, a: 5001, id: id3 },
    ]);
  });

  test("updateWithConcurrencyCheckOn fails, content does not fit schema", async () => {
    const [{ id: id1 }] = (
      await new Models(dbs, [{ test: 10, a: 5002 }]).store()
    ).contents;
    const [{ id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 11, a: 5002 },
        { test: 12, a: 5002 },
      ]).store()
    ).contents;
    const ms = await new Models(dbs).load({ a: 5002 });
    // @ts-expect-error test type
    ms.contents[1].test = "sheesh";
    await expect(
      async () => await ms.updateWithConcurrencyCheckOn(["test"])
    ).rejects.toThrow(TypeMissmatchError);
    const newms = await new Models(dbs).load({ a: 5002 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 5002, id: id1 },
      { test: 11, a: 5002, id: id2 },
      { test: 12, a: 5002, id: id3 },
    ]);
  });

  test("updateWithConcurrencyCheckOn fails, on current changes", async () => {
    const [{ id: id1 }, { id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 10, a: 5003 },
        { test: 11, a: 5003 },
        { test: 12, a: 5003 },
      ]).store()
    ).contents;

    const ms = await new Models(dbs).load({ a: 5003 });

    const msChanged = await new Models(dbs).load({ a: 5003 });
    msChanged.contents[1].test = 1000;
    await msChanged.update();

    ms.contents.forEach((c) => (c.test = 1001));
    await expect(
      async () => await ms.updateWithConcurrencyCheckOn(["test"])
    ).rejects.toThrow(ConcurrencyError);

    const newms = await new Models(dbs).load({ a: 5003 }, undefined, 0, [
      { dir: "ASC", key: "id" },
    ]);
    expect(newms.contents).toMatchObject([
      { test: 10, a: 5003, id: id1 },
      { test: 1000, a: 5003, id: id2 },
      { test: 12, a: 5003, id: id3 },
    ]);
  });
});

describe("Delete", () => {
  test("deleteAll", async () => {
    await new Models(dbs, [
      { test: 1, a: 1 },
      { test: 1, a: 2 },
    ]).store();

    await (await new Models(dbs).load({ test: 1 })).deleteAll();
    const newms = await new Models(dbs).load({ test: 1 });

    expect(newms.contents.length).toBe(0);
  });

  test("delete", async () => {
    await new Models(dbs, [
      { test: 1, a: 1 },
      { test: 1, a: 2 },
      { test: 2, a: 2 },
    ]).store();

    const result = await new Models(dbs).delete({ test: 1 });
    expect(result).toBe(2);

    const test1 = await new Models(dbs).load({ test: 1 });
    const test2 = await new Models(dbs).load({ test: 2 });

    expect(test1.contents.length).toBe(0);
    expect(test2.contents.length).toBe(1);
  });
});

describe("Constrained", () => {
  test("insert constrained", async () => {
    await expect(
      new ModelsForeign(dbs, [{ userid: 1000, comment: "a" }]).store()
    ).rejects.toThrow(ConstraintFailed);
  });

  test("deleteAll of referenced fails", async () => {
    const ms = await new Models(dbs, [
      { test: 50 },
      { test: 50 },
      { test: 50 },
    ]).store();
    await new ModelsForeign(dbs, [{ userid: ms.contents[1].id }]).store();

    const m2 = await new Models(dbs).load({ test: 50 });
    await expect(async () => await m2.deleteAll()).rejects.toThrow(IsReference);

    const msNew = await new Models(dbs).load({ test: 50 });
    await expect(msNew.contents).toMatchObject(ms.contents);
    await expect(new ModelsForeign(dbs).load({ userid: ms.contents[1].id }));
  });
});

describe("loadByKeys", () => {
  test("loadByKeys, one key", async () => {
    const [{ id: id1 }, { id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 99, a: 1 },
        { test: 100, a: 2 },
        { test: 101, a: 3 },
      ]).store()
    ).contents;

    const ms = await new Models(dbs).loadByKeys({ id: [id1, id2, id3] });
    const result = [
      {
        test: 99,
        a: 1,
        id: id1,
      },
      {
        test: 100,
        a: 2,
        id: id2,
      },
      {
        test: 101,
        a: 3,
        id: id3,
      },
    ];
    expect(ms.contents).toMatchObject(result);
  });

  test("loadByKeys, with limit", async () => {
    const [{ id: id1 }, { id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 778, a: 1 },
        { test: 779, a: 2 },
        { test: 776, a: 3 },
      ]).store()
    ).contents;

    const ids1 = { id: [id1, id2, id3] };
    const ms_1 = await new Models(dbs).loadByKeys(ids1, 2);
    const ms_2 = await new Models(dbs).loadByKeys(ids1, 2, 2);
    const ms_3 = await new Models(dbs).loadByKeys(ids1, 2, 4);
    const result1 = [
      {
        test: 778,
        a: 1,
        id: id1,
      },
      {
        test: 779,
        a: 2,
        id: id2,
      },
    ];
    const result2 = [
      {
        test: 776,
        a: 3,
        id: id3,
      },
    ];
    const result3 = [];
    expect(ms_1.contents).toMatchObject(result1);
    expect(ms_2.contents).toMatchObject(result2);
    expect(ms_3.contents).toMatchObject(result3);
  });

  test("loadByKeys, multi key", async () => {
    const m1 = await new ModelsMultiKey(dbs, [{ test: 1, a: 7 }]).store();
    const m3 = await new ModelsMultiKey(dbs, [{ test: 1 }]).store();

    const mres = await new ModelsMultiKey(dbs).loadByKeys({
      id: [m1.contents[0].id, m3.contents[0].id],
      test: 1,
    });

    expect(mres.contents.length).toBe(2);
    expect(mres.contents).toMatchObject([
      {
        test: 1,
        id: m1.contents[0].id,
        a: 7,
      },
      {
        test: 1,
        id: m3.contents[0].id,
      },
    ]);
    await expect(
      new ModelsMultiKey(dbs).loadByKeys(
        // @ts-expect-error test type
        { id: [m1.contents[0].id] }
      )
    ).rejects.toThrow(NotAllKeysGivenError);
  });
});

describe("loadOneByKeys", () => {
  test("loadOneByKeys, one key", async () => {
    const [{ id: id1 }, { id: id2 }] = (
      await new Models(dbs, [
        { test: 199, a: 1 },
        { test: 200, a: 1 },
      ]).store()
    ).contents;

    const ms = await new Models(dbs).loadOneByKeys({ id: id1 });
    const result = [
      {
        test: 199,
        a: 1,
        id: id1,
      },
    ];
    expect(ms.contents).toMatchObject(result);
    expect(ms.content).toMatchObject(result[0]);
    await expect(
      new Models(dbs).loadOneByKeys({ id: [id1, id2] })
    ).rejects.toThrow(NotUnique);
  });

  test("loadOneByKeys, multi key", async () => {
    const m1 = await new ModelsMultiKey(dbs, [
      { test: 1, a: 7 },
      { test: 2, a: 7 },
    ]).store();

    const mres = await new ModelsMultiKey(dbs).loadOneByKeys({
      id: m1.contents[0].id,
      test: 1,
    });

    expect(mres.contents.length).toBe(1);
    expect(mres.contents).toMatchObject([
      {
        test: 1,
        id: m1.contents[0].id,
        a: 7,
      },
    ]);
    await expect(
      new ModelsMultiKey(dbs).loadOneByKeys(
        // @ts-expect-error test type
        { id: [m1.contents[0].id] }
      )
    ).rejects.toThrow(NotAllKeysGivenError);
    await expect(
      new ModelsMultiKey(dbs).loadOneByKeys({
        id: [m1.contents[0].id, m1.contents[1].id],
        test: [1, 2],
      })
    ).rejects.toThrow(NotUnique);
  });
  test("loadOneByKeys fail (too few)", async () => {
    const m = new Models(dbs);
    await expect(m.loadOneByKeys({ id: 11111111 })).rejects.toThrow(NotFound);
  });
});

describe("lodeNoneByKeys", () => {
  test("loadNoneByKeys success", async () => {
    const m = new Models(dbs);

    await expect(
      new Models(dbs).loadNoneByKeys(
        // @ts-expect-error test type
        {}
      )
    ).rejects.toThrow(NotAllKeysGivenError);

    await expect(m.loadNoneByKeys({ id: 777777 })).resolves.toBe(m);
  });

  test("loadNoneByKeys fail (too many)", async () => {
    await new Models(dbs, [{ id: 7777778, test: 1 }]).store();

    const m = new Models(dbs);
    await expect(m.loadNoneByKeys({ id: 7777778 })).rejects.toThrow(DoesExist);
  });
});

describe("load", () => {
  test("load, with limit", async () => {
    const [{ id: id1 }, { id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 798, a: 1 },
        { test: 799, a: 2 },
        { test: 796, a: 3 },
      ]).store()
    ).contents;

    const ids1 = { id: { op: "in", val: [id1, id2, id3] } };
    const ms_1 = await new Models(dbs).load(ids1, 2);
    const ms_2 = await new Models(dbs).load(ids1, 2, 2);
    const ms_3 = await new Models(dbs).load(ids1, 2, 4);
    const result1 = [
      {
        test: 798,
        a: 1,
        id: id1,
      },
      {
        test: 799,
        a: 2,
        id: id2,
      },
    ];
    const result2 = [
      {
        test: 796,
        a: 3,
        id: id3,
      },
    ];
    const result3 = [];
    expect(ms_1.contents).toMatchObject(result1);
    expect(ms_2.contents).toMatchObject(result2);
    expect(ms_3.contents).toMatchObject(result3);
  });
  it("should reject to retrieve content", async () => {
    const [{ id: id1 }] = (await new Models(dbs, [{ test: 798, a: 1 }]).store())
      .contents;

    const ms = await new Models(dbs).load({ id: id1 });
    expect(() => ms.content).toThrow(NotUnique);
  });
});

describe("loadOne", () => {
  test("loadOne success", async () => {
    const {
      contents: [{ id }],
    } = await new Models(dbs, [{ test: 800, a: 1 }]).store();

    const m = new Models(dbs);

    await expect(m.loadOne({ test: 800 })).resolves.toBe(m);
    expect(m.contents[0]).toMatchObject({ test: 800, id });
    expect(m.content).toMatchObject({ test: 800, id });
  });

  test("loadOne fail (too many)", async () => {
    await new Models(dbs, [
      { test: 1, a: 2 },
      { test: 1, a: 3 },
    ]).store();

    const m = new Models(dbs);
    await expect(m.loadOne({ test: 1 })).rejects.toThrow(NotUnique);
  });

  test("loadOne fail (too few)", async () => {
    const m = new Models(dbs);
    await expect(m.loadOne({ test: 8 })).rejects.toThrow(NotFound);
  });
});

describe("lodeNone", () => {
  test("loadNone success", async () => {
    const m = new Models(dbs);

    await expect(m.loadNone({ test: 777777 })).resolves.toBe(m);
  });

  test("loadNone fail (too many)", async () => {
    await new Models(dbs, [{ test: 777777 }]).store();

    const m = new Models(dbs);
    await expect(m.loadNone({ test: 777777 })).rejects.toThrow(DoesExist);
  });
});

describe("count", () => {
  test("count success", async () => {
    await new Models(dbs, [
      { test: 9991, a: 1 },
      { test: 9991, a: 2 },
      { test: 9991, a: 3 },
    ]).store();

    const m = new Models(dbs);

    await expect(m.count({ test: 9991 })).resolves.toBe(3);
    expect(m.contents.length).toBe(0);
  });

  test("loadOne fail (too many)", async () => {
    await new Models(dbs, [
      { test: 1, a: 2 },
      { test: 1, a: 3 },
    ]).store();

    const m = new Models(dbs);
    await expect(m.loadOne({ test: 1 })).rejects.toThrow(NotUnique);
  });

  test("loadOne fail (too few)", async () => {
    const m = new Models(dbs);
    await expect(m.loadOne({ test: 8 })).rejects.toThrow(NotFound);
  });
});

describe("Multi key", () => {
  test("insert, multi key, no auto", async () => {
    await expect(
      new ModelsNoAuto(dbs, [
        { email: "test1@test.de", name: "Peter", a: 12 },
        { email: "test1@test.de", name: "Peter", a: 12 },
      ]).store()
    ).rejects.toThrow(NotUnique);
  });

  test("delete, multi key, no auto", async () => {
    await new ModelsNoAuto(dbs, [
      { email: "test1@test.de", name: "Franz" },
    ]).store();
    const m1 = await new ModelsNoAuto(dbs).load({ email: "test1@test.de" });
    await expect(m1.deleteAll()).resolves.toBe(m1);
    await expect(
      (
        await new ModelsNoAuto(dbs).load({ email: "test1@test.de" })
      ).contents.length
    ).toBe(0);
  });

  test("update, multi key, no auto", async () => {
    await new ModelsNoAuto(dbs, [
      { email: "test1@test.de", name: "Franz" },
      { email: "test1@test.de", name: "Peter" },
      { email: "test1@test.de", name: "Fritz" },
    ]).store();
    const tests = await new ModelsNoAuto(dbs).load({
      email: "test1@test.de",
    });
    tests.contents = tests.contents.map((c) => ({ ...c, a: 101 }));
    await expect(tests.update()).resolves.toBe(tests);
    await expect(
      (
        await new ModelsNoAuto(dbs).loadByKeys({
          email: "test1@test.de",
          name: "Peter",
        })
      ).contents
    ).toMatchObject([{ email: "test1@test.de", name: "Peter", a: 101 }]);
    await expect(
      (
        await new ModelsNoAuto(dbs).loadByKeys({
          email: "test1@test.de",
          name: "Franz",
        })
      ).contents
    ).toMatchObject([{ email: "test1@test.de", name: "Franz", a: 101 }]);
    await expect(
      (
        await new ModelsNoAuto(dbs).loadByKeys({
          email: "test1@test.de",
          name: "Fritz",
        })
      ).contents
    ).toMatchObject([{ email: "test1@test.de", name: "Fritz" }]);
  });

  test("update fails, multi key, keys changed", async () => {
    await new ModelsNoAuto(dbs, [
      { email: "test1brr@test.de", name: "Franz" },
      { email: "test1brr@test.de", name: "Peter" },
      { email: "test1brr@test.de", name: "Fritz" },
    ]).store();
    const tests = await new ModelsNoAuto(dbs).load({
      email: "test1brr@test.de",
    });
    tests.contents = tests.contents.map((c) => ({ ...c, email: "juu" }));
    await expect(async () => await tests.update()).rejects.toThrow(
      UnexpectedModelError
    );

    const tests2 = await new ModelsNoAuto(dbs).load({
      email: "test1brr@test.de",
    });
    tests2.contents = tests.contents.map((c) => ({ ...c, name: "juu" }));
    await expect(async () => await tests2.update()).rejects.toThrow(
      UnexpectedModelError
    );

    expect(
      (
        await new ModelsNoAuto(dbs).loadByKeys({
          email: "test1brr@test.de",
          name: "Peter",
        })
      ).contents
    ).toMatchObject([{ email: "test1brr@test.de", name: "Peter" }]);
    expect(
      (
        await new ModelsNoAuto(dbs).loadByKeys({
          email: "test1brr@test.de",
          name: "Franz",
        })
      ).contents
    ).toMatchObject([{ email: "test1brr@test.de", name: "Franz" }]);
    expect(
      (
        await new ModelsNoAuto(dbs).loadByKeys({
          email: "test1brr@test.de",
          name: "Fritz",
        })
      ).contents
    ).toMatchObject([{ email: "test1brr@test.de", name: "Fritz" }]);
  });
});

describe("Derived", () => {
  it("should reject wrongly typed derived functions", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    class ModelsDerived1 extends BaseModel<typeof derivedType> {
      constructor(...args: ConstructorParams<typeof derivedType>) {
        super(...args);
        // @ts-expect-error too little
        this.derived({});
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    class ModelsDerived2 extends BaseModel<typeof derivedType> {
      constructor(...args: ConstructorParams<typeof derivedType>) {
        super(...args);
        this.derived({
          derivedAsync: async () => new Promise((res) => res("test")),
          derivedId: (c) => c.id,
          derivedObj: () => ({
            prop: "str",
          }),
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    class ModelsDerived3 extends BaseModel<typeof derivedType> {
      constructor(...args: ConstructorParams<typeof derivedType>) {
        super(...args);
        this.derived({
          derivedAsync: async () => new Promise((res) => res("test")),
          derivedId: (c) => c.id,
          derivedObj: () => ({
            prop: "str",
          }),
          // @ts-expect-error too much
          test: () => 1,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    class ModelsDerived4 extends BaseModel<typeof derivedType> {
      constructor(...args: ConstructorParams<typeof derivedType>) {
        super(...args);
        this.derived({
          derivedAsync: async () => new Promise((res) => res("test")),
          // @ts-expect-error wrong type
          derivedId: () => "str",
          derivedObj: () => ({
            prop: "str",
          }),
        });
      }
    }
  });
});

describe("Get public", () => {
  test("getPublic with derived", async () => {
    const m1 = await new ModelsDerived(dbs, [
      {
        test: 100,
      },
      {
        test: 100,
      },
    ]).store();
    const m2 = await new ModelsDerived(dbs).load({ test: 100 });
    const publicVals1 = await m1.getPublic();
    const publicVals2 = await m2.getPublic();
    expect(publicVals1).toStrictEqual([
      {
        test: 100,
        derivedId: 3,
        derivedAsync: "test",
        derivedObj: { prop: "str" },
      },
      {
        test: 100,
        derivedId: 4,
        derivedAsync: "test",
        derivedObj: { prop: "str" },
      },
    ]);
    expect(publicVals1).toStrictEqual(publicVals2);
  });
});
