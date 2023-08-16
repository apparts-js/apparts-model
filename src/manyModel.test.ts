import { SETUPDB } from "./tests/databaseSetup";
import {
  type,
  multiKeyType,
  noAutoType,
  foreignType,
  derivedType,
  defaultType,
} from "./tests/testTypes";
import { setup, teardown } from "./tests/database";
import { useModel } from "./index";
import {
  TypeMissmatchError,
  ConstraintFailed,
  DoesExist,
  IsReference,
  NotAllKeysGivenError,
  NotFound,
  NotUnique,
  UnexpectedModelError,
} from "./errors";

const Models = useModel({ typeSchema: type, collection: "users" });
const Models2 = useModel({
  typeSchema: multiKeyType,
  collection: "users2",
});
const Models3 = useModel({
  typeSchema: noAutoType,
  collection: "users3",
});
const Models4 = useModel({
  typeSchema: foreignType,
  collection: "comment",
});
const Models5 = useModel({ typeSchema: derivedType, collection: "derived" });
const Models6 = useModel({ typeSchema: defaultType, collection: "wdefault" });

let dbs;
beforeAll(async () => {
  dbs = await setup([SETUPDB], null, "appartsmanymodeltests");
});
afterAll(async () => {
  await teardown();
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
    const m = new Models5(dbs, [{ test: 1 }, { test: 2 }]);
    await expect(m.store()).resolves.toBeTruthy();
    expect(m.contents).toStrictEqual([
      { id: 1, test: 1 },
      { id: 2, test: 2 },
    ]);
  });

  test("creation of many with default", async () => {
    const m = new Models6(dbs, [
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
});

describe("Constrained", () => {
  test("insert constrained", async () => {
    await expect(
      new Models4(dbs, [{ userid: 1000, comment: "a" }]).store()
    ).rejects.toThrow(ConstraintFailed);
  });

  test("deleteAll of referenced fails", async () => {
    const ms = await new Models(dbs, [
      { test: 50 },
      { test: 50 },
      { test: 50 },
    ]).store();
    await new Models4(dbs, [{ userid: ms.contents[1].id }]).store();

    const m2 = await new Models(dbs).load({ test: 50 });
    await expect(async () => await m2.deleteAll()).rejects.toThrow(IsReference);

    const msNew = await new Models(dbs).load({ test: 50 });
    await expect(msNew.contents).toMatchObject(ms.contents);
    await expect(new Models4(dbs).load({ userid: ms.contents[1].id }));
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
    const m1 = await new Models2(dbs, [{ test: 1, a: 7 }]).store();
    const m3 = await new Models2(dbs, [{ test: 1 }]).store();

    const mres = await new Models2(dbs).loadByKeys({
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
      new Models2(dbs).loadByKeys(
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
    const m1 = await new Models2(dbs, [
      { test: 1, a: 7 },
      { test: 2, a: 7 },
    ]).store();

    const mres = await new Models2(dbs).loadOneByKeys({
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
      new Models2(dbs).loadOneByKeys(
        // @ts-expect-error test type
        { id: [m1.contents[0].id] }
      )
    ).rejects.toThrow(NotAllKeysGivenError);
    await expect(
      new Models(dbs).loadOneByKeys({
        id: [m1.contents[0].id, m1.contents[1].id],
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

describe("Multi key", () => {
  test("insert, multi key, no auto", async () => {
    await expect(
      new Models3(dbs, [
        { email: "test1@test.de", name: "Peter", a: 12 },
        { email: "test1@test.de", name: "Peter", a: 12 },
      ]).store()
    ).rejects.toThrow(NotUnique);
  });

  test("delete, multi key, no auto", async () => {
    await new Models3(dbs, [{ email: "test1@test.de", name: "Franz" }]).store();
    const m1 = await new Models3(dbs).load({ email: "test1@test.de" });
    await expect(m1.deleteAll()).resolves.toBe(m1);
    await expect(
      (
        await new Models3(dbs).load({ email: "test1@test.de" })
      ).contents.length
    ).toBe(0);
  });

  test("update, multi key, no auto", async () => {
    await new Models3(dbs, [
      { email: "test1@test.de", name: "Franz" },
      { email: "test1@test.de", name: "Peter" },
      { email: "test1@test.de", name: "Fritz" },
    ]).store();
    const tests = await new Models3(dbs).load({
      email: "test1@test.de",
    });
    tests.contents = tests.contents.map((c) => ({ ...c, a: 101 }));
    await expect(tests.update()).resolves.toBe(tests);
    await expect(
      (
        await new Models3(dbs).loadByKeys({
          email: "test1@test.de",
          name: "Peter",
        })
      ).contents
    ).toMatchObject([{ email: "test1@test.de", name: "Peter", a: 101 }]);
    await expect(
      (
        await new Models3(dbs).loadByKeys({
          email: "test1@test.de",
          name: "Franz",
        })
      ).contents
    ).toMatchObject([{ email: "test1@test.de", name: "Franz", a: 101 }]);
    await expect(
      (
        await new Models3(dbs).loadByKeys({
          email: "test1@test.de",
          name: "Fritz",
        })
      ).contents
    ).toMatchObject([{ email: "test1@test.de", name: "Fritz" }]);
  });

  test("update fails, multi key, keys changed", async () => {
    await new Models3(dbs, [
      { email: "test1brr@test.de", name: "Franz" },
      { email: "test1brr@test.de", name: "Peter" },
      { email: "test1brr@test.de", name: "Fritz" },
    ]).store();
    const tests = await new Models3(dbs).load({
      email: "test1brr@test.de",
    });
    tests.contents = tests.contents.map((c) => ({ ...c, email: "juu" }));
    await expect(async () => await tests.update()).rejects.toThrow(
      UnexpectedModelError
    );

    const tests2 = await new Models3(dbs).load({
      email: "test1brr@test.de",
    });
    tests2.contents = tests.contents.map((c) => ({ ...c, name: "juu" }));
    await expect(async () => await tests2.update()).rejects.toThrow(
      UnexpectedModelError
    );

    expect(
      (
        await new Models3(dbs).loadByKeys({
          email: "test1brr@test.de",
          name: "Peter",
        })
      ).contents
    ).toMatchObject([{ email: "test1brr@test.de", name: "Peter" }]);
    expect(
      (
        await new Models3(dbs).loadByKeys({
          email: "test1brr@test.de",
          name: "Franz",
        })
      ).contents
    ).toMatchObject([{ email: "test1brr@test.de", name: "Franz" }]);
    expect(
      (
        await new Models3(dbs).loadByKeys({
          email: "test1brr@test.de",
          name: "Fritz",
        })
      ).contents
    ).toMatchObject([{ email: "test1brr@test.de", name: "Fritz" }]);
  });
});

describe("Get public", () => {
  test("getPublic with derived", async () => {
    const m1 = await new Models5(dbs, [
      {
        test: 100,
      },
      {
        test: 100,
      },
    ]).store();
    const m2 = await new Models5(dbs).load({ test: 100 });
    const publicVals1 = await m1.getPublic();
    const publicVals2 = await m2.getPublic();
    expect(publicVals1).toStrictEqual([
      {
        test: 100,
        derivedId: 3,
        derivedAsync: "test",
      },
      {
        test: 100,
        derivedId: 4,
        derivedAsync: "test",
      },
    ]);
    expect(publicVals1).toStrictEqual(publicVals2);
  });
});
