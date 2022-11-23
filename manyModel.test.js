const { setup, teardown } = require("./tests/database");
const { useModel } = require("./index.js");
const { UnexpectedModelError, TypeMissmatchError } = require("./errors");

const SETUPDB = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  test INT NOT NULL,
  a INT
);

CREATE TABLE users2 (
  id SERIAL NOT NULL,
  test INT NOT NULL,
  a INT,
  PRIMARY KEY (id, test)
);

CREATE TABLE users3 (
  email VARCHAR(128) NOT NULL,
  name VARCHAR(128) NOT NULL,
  a INT,
  PRIMARY KEY (name, email)
);

CREATE TABLE comment (
  id SERIAL NOT NULL,
  userid INT NOT NULL,
  comment TEXT,
  PRIMARY KEY (id, userid),
  FOREIGN KEY (userid) REFERENCES users(id)
);

CREATE TABLE derived (
  id SERIAL PRIMARY KEY,
  test INT NOT NULL
);

CREATE TABLE wdefault (
  id SERIAL PRIMARY KEY,
  "hasDefault" INT NOT NULL,
  "hasDefaultFn" INT NOT NULL,
  "objWithDefault" JSON NOT NULL
);
`;

const type = {
  id: { type: "id", key: true, auto: true },
  test: { type: "int" },
  a: { type: "int", optional: true },
};
const multiKeyType = {
  id: { type: "id", key: true, auto: true },
  test: { type: "int", key: true },
  a: { type: "int", optional: true },
};
const noAutoType = {
  email: { type: "email", key: true },
  name: { type: "string", key: true },
  a: { type: "int", optional: true },
};
const foreignType = {
  id: { type: "id", key: true, auto: true },
  userid: { type: "id", key: true },
  comment: { type: "string", optional: true },
};
const derivedType = {
  id: { type: "id", key: true, auto: true },
  test: { type: "int", public: true },
  derivedId: {
    type: "id",
    derived: (c) => c.id,
    public: true,
  },
  derivedAsync: {
    type: "string",
    derived: async () => new Promise((res) => res("test")),
    public: true,
  },
};

const defaultType = {
  id: { type: "id", key: true, auto: true },
  hasDefault: { type: "int", default: 3 },
  hasDefaultFn: { type: "int", default: () => 4 },
  objWithDefault: {
    type: "object",
    keys: {
      deepHasDefault: { type: "string", default: "inner" },
      deepHasDefaultFn: { type: "string", default: () => "inner fn" },
    },
  },
};

const [Models, Model] = useModel(type, "users");
const [Models2, Model2] = useModel(multiKeyType, "users2");
const [Models3, Model3] = useModel(noAutoType, "users3");
const [Models4, Model4] = useModel(foreignType, "comment");
const [Models5] = useModel(derivedType, "derived");
const [Models6] = useModel(defaultType, "wdefault");

let dbs;
beforeAll(async () => {
  dbs = await setup([SETUPDB], null, "appartsmanymodeltests");
});
afterAll(async () => {
  await teardown();
});

describe("Creation", () => {
  test("creation of one", async () => {
    await expect(() => new Models(dbs, { test: 1 })).toThrow({
      message: "[ManyModel], contents should be an array",
    });
  });

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
        objWithDefault: {
          deepHasDefault: "yay",
          deepHasDefaultFn: "nay",
        },
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
          deepHasDefault: "yay",
          deepHasDefaultFn: "nay",
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

    const { id: id1 } = (await new Model(dbs, { test: 10, a: 4 }).store())
      .content;
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
    const { id: id1 } = (await new Model(dbs, { test: 10, a: 4000 }).store())
      .content;
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
    const { id: id1 } = (await new Model(dbs, { test: 10, a: 4001 }).store())
      .content;
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
    const { id: id1 } = (await new Model(dbs, { test: 10, a: 4002 }).store())
      .content;
    const [{ id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 11, a: 4002 },
        { test: 12, a: 4002 },
      ]).store()
    ).contents;
    const ms = await new Models(dbs).load({ a: 4002 });
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
    ).rejects.toMatchObject({
      message: "[Model] Object fails to meet constraints",
    });
  });

  test("deleteAll of referenced fails", async () => {
    const ms = await new Models(dbs, [
      { test: 50 },
      { test: 50 },
      { test: 50 },
    ]).store();
    await new Model4(dbs, { userid: ms.contents[1].id }).store();

    const m2 = await new Models(dbs).load({ test: 50 });
    await expect(async () => await m2.deleteAll()).rejects.toMatchObject({
      message: "[Model] Object is still reference",
    });

    const msNew = await new Models(dbs).load({ test: 50 });
    await expect(msNew.contents).toMatchObject(ms.contents);
    await expect(new Model4(dbs).load({ userid: ms.contents[1].id }));
  });
});

describe("loadByIds", () => {
  test("loadByIds, one key", async () => {
    const [{ id: id1 }, { id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 99, a: 1 },
        { test: 100, a: 2 },
        { test: 101, a: 3 },
      ]).store()
    ).contents;

    const ms = await new Models(dbs).loadByIds({ id: [id1, id2, id3] });
    const ms2 = await new Models(dbs).loadByIds([id1, id2, id3]);
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
    expect(ms2.contents).toMatchObject(result);
  });

  test("loadByIds, with limit", async () => {
    const [{ id: id1 }, { id: id2 }, { id: id3 }] = (
      await new Models(dbs, [
        { test: 778, a: 1 },
        { test: 779, a: 2 },
        { test: 776, a: 3 },
      ]).store()
    ).contents;

    const ids1 = { id: [id1, id2, id3] };
    const ids2 = [id1, id2, id3];
    const ms_1 = await new Models(dbs).loadByIds(ids1, 2);
    const ms2_1 = await new Models(dbs).loadByIds(ids2, 2);
    const ms_2 = await new Models(dbs).loadByIds(ids1, 2, 2);
    const ms2_2 = await new Models(dbs).loadByIds(ids2, 2, 2);
    const ms_3 = await new Models(dbs).loadByIds(ids1, 2, 4);
    const ms2_3 = await new Models(dbs).loadByIds(ids2, 2, 4);
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
    expect(ms2_1.contents).toMatchObject(result1);
    expect(ms_2.contents).toMatchObject(result2);
    expect(ms2_2.contents).toMatchObject(result2);
    expect(ms_3.contents).toMatchObject(result3);
    expect(ms2_3.contents).toMatchObject(result3);
  });

  test("loadByIds, multi key", async () => {
    const m1 = await new Model2(dbs, { test: 1, a: 7 }).store();
    const m3 = await new Model2(dbs, { test: 1 }).store();

    const mres = await new Models2(dbs).loadByIds({
      id: [m1.content.id, m3.content.id],
      test: 1,
    });

    expect(mres.contents.length).toBe(2);
    expect(mres.contents).toMatchObject([
      {
        test: 1,
        id: m1.content.id,
        a: 7,
      },
      {
        test: 1,
        id: m3.content.id,
      },
    ]);
    await expect(new Models2(dbs).loadByIds([m1.content.id])).rejects.toThrow({
      message: `[ManyModel] loadByIds not all keys given, E50.
Collection: "users2", Keys: "["id","test"]", Id: "[${m1.content.id}]"`,
    });
    await expect(
      new Models2(dbs).loadByIds({ id: [m1.content.id] })
    ).rejects.toThrow({
      message: `[ManyModel] loadByIds not all keys given, E50.
Collection: "users2", Keys: "["id","test"]", Id: "{"id":[${m1.content.id}]}"`,
    });
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
});

describe("Multi key", () => {
  test("insert, multi key, no auto", async () => {
    await expect(
      new Models3(dbs, [
        { email: "test1@test.de", name: "Peter", a: 12 },
        { email: "test1@test.de", name: "Peter", a: 12 },
      ]).store()
    ).rejects.toMatchObject({ message: "[Model] Object not unique" });
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
    tests.set("a", 101);
    await expect(tests.update()).resolves.toBe(tests);
    await expect(
      (
        await new Model3(dbs).loadById({
          email: "test1@test.de",
          name: "Peter",
        })
      ).content
    ).toMatchObject({ email: "test1@test.de", name: "Peter", a: 101 });
    await expect(
      (
        await new Model3(dbs).loadById({
          email: "test1@test.de",
          name: "Franz",
        })
      ).content
    ).toMatchObject({ email: "test1@test.de", name: "Franz", a: 101 });
    await expect(
      (
        await new Model3(dbs).loadById({
          email: "test1@test.de",
          name: "Fritz",
        })
      ).content
    ).toMatchObject({ email: "test1@test.de", name: "Fritz" });
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
    tests.set("email", "juu");
    await expect(async () => await tests.update()).rejects.toThrow(
      UnexpectedModelError
    );

    const tests2 = await new Models3(dbs).load({
      email: "test1brr@test.de",
    });
    tests2.set("name", "juu");
    await expect(async () => await tests2.update()).rejects.toThrow(
      UnexpectedModelError
    );

    await expect(
      (
        await new Model3(dbs).loadById({
          email: "test1brr@test.de",
          name: "Peter",
        })
      ).content
    ).toMatchObject({ email: "test1brr@test.de", name: "Peter" });
    await expect(
      (
        await new Model3(dbs).loadById({
          email: "test1brr@test.de",
          name: "Franz",
        })
      ).content
    ).toMatchObject({ email: "test1brr@test.de", name: "Franz" });
    await expect(
      (
        await new Model3(dbs).loadById({
          email: "test1brr@test.de",
          name: "Fritz",
        })
      ).content
    ).toMatchObject({ email: "test1brr@test.de", name: "Fritz" });
  });
});

describe("Get public", () => {
  test("getPublic with derived but not generated", async () => {
    const m2 = await new Models5(dbs).load({ test: 1 });
    await expect(() => m2.getPublic()).toThrow(
      "[AnyModel] getPublic called without generating derived first."
    );
  });

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
    await m1.generateDerived();
    await m2.generateDerived();
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
