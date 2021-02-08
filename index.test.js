const { setup, teardown } = require("./tests/database");
const { useModel } = require("./index.js");
const { NotUnique, NotFound, DoesExist } = require("./errors");

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
);`;

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
const [Models, Model, NoModel] = useModel(type, "users");
const [Models2, Model2, NoModel2] = useModel(multiKeyType, "users2");
const [Models3, Model3, NoModel3] = useModel(noAutoType, "users3");

let dbs;
beforeAll(async () => {
  dbs = await setup([SETUPDB], null, "appartsmodeltests");
});
afterAll(async () => {
  await teardown();
});

describe("OneModel", () => {
  test("creation of one", async () => {
    let m = new Model(dbs, { test: 1 });
    await expect(m.store()).resolves.toBeTruthy();
    expect(m.content).toMatchObject({ test: 1, id: 1 });
  });

  test("creation of many", async () => {
    await expect(() => new Model(dbs, [{ test: 1 }, { test: 2 }])).toThrow({
      message: "[OneModel] cannot create multiple. Use ManyModel instead!",
    });
  });

  test("loadOne success", async () => {
    const m = new Model(dbs);

    await expect(m.load({ test: 1 })).resolves.toBe(m);
    expect(m.content).toMatchObject({ test: 1, id: 1 });
  });

  test("loadOne fail (too many)", async () => {
    await new Model(dbs, { test: 1, a: 2 }).store();

    const m = new Model(dbs);
    await expect(m.load({ test: 1 })).rejects.toMatchObject({
      message: "[Model] Object not unique",
    });
  });

  test("loadOne fail (too few)", async () => {
    const m = new Model(dbs);
    await expect(m.load({ test: 8 })).rejects.toMatchObject({
      message: "[Model] Object not found",
    });
  });

  test("update", async () => {
    const m = new Model(dbs);

    await new Model(dbs, { test: 4, a: 1 }).store();
    await m.load({ test: 4 });
    m.content.a = 2;
    await m.update();
    const m2 = await new Model(dbs).load({ test: 4 });

    expect(m2.content).toMatchObject({
      test: 4,
      a: 2,
    });
  });

  test("delete", async () => {
    await new Model(dbs, { test: 5 }).store();
    await (await new Model(dbs).load({ test: 5 })).delete();

    await expect(new Model(dbs).load({ test: 5 })).rejects.toMatchObject({
      message: "[Model] Object not found",
    });
  });

  test("loadById, one key", async () => {
    const m1 = await new Model(dbs, { test: 1 }).store();
    await new Model(dbs, { test: 2 }).store();
    const m2 = await new Model(dbs).loadById(m1.content.id);

    expect(m2.content.test).toBe(1);
    expect(m2.content.id).toBe(m1.content.id);
  });

  test("loadById, multi key", async () => {
    const m1 = await new Model2(dbs, { test: 1, a: 7 }).store();
    const m3 = await new Model2(dbs, { test: 1 }).store();
    await new Model2(dbs, { test: 2 }).store();
    const m2 = await new Model2(dbs).loadById({ id: m1.content.id, test: 1 });

    expect(m2.content).toMatchObject({
      a: 7,
      id: m1.content.id,
      test: 1,
    });
    await expect(new Model2(dbs).loadById(m1.content.id)).rejects.toThrow({
      message: `[OneModel] loadById not all keys given, E49.
Collection: "users2", Keys: "["id","test"]", Id: "${m1.content.id}"`,
    });
    await expect(
      new Model2(dbs).loadById({ id: m1.content.id })
    ).rejects.toThrow({
      message: `[OneModel] loadById not all keys given, E49.
Collection: "users2", Keys: "["id","test"]", Id: "{"id":${m1.content.id}}"`,
    });
  });

  test("insert unique, multi key, no auto", async () => {
    await new Model3(dbs, {
      email: "test@test.de",
      name: "Peter",
      a: 12,
    }).store();
    await expect(
      new Model3(dbs, { email: "test@test.de", name: "Peter" }).store()
    ).rejects.toMatchObject({ message: "[Model] Object does exist" });
  });

  test("delete, multi key, no auto", async () => {
    await new Model3(dbs, { email: "test@test.de", name: "Franz" }).store();
    const m1 = await new Model3(dbs).load({
      email: "test@test.de",
      name: "Franz",
    });
    await expect(m1.delete()).resolves.toBe(m1);
    await expect(
      new Model3(dbs).load({ email: "test@test.de", name: "Franz" })
    ).rejects.toMatchObject({
      message: "[Model] Object not found",
    });
    const peter = await new Model3(dbs).loadById({
      email: "test@test.de",
      name: "Peter",
    });
    expect(peter.content).toMatchObject({
      email: "test@test.de",
      name: "Peter",
      a: 12,
    });
  });

  test("update, multi key, no auto", async () => {
    await new Model3(dbs, { email: "test@test.de", name: "Franz" }).store();
    const peter = await new Model3(dbs).loadById({
      email: "test@test.de",
      name: "Peter",
    });
    peter.content.a = 99;
    await expect(peter.update()).resolves.toBe(peter);
    await expect(
      (
        await new Model3(dbs).loadById({
          email: "test@test.de",
          name: "Peter",
        })
      ).content
    ).toMatchObject({
      email: "test@test.de",
      name: "Peter",
      a: 99,
    });
    await expect(
      (await new Model3(dbs).loadById({ email: "test@test.de", name: "Franz" }))
        .content
    ).toMatchObject({ email: "test@test.de", name: "Franz" });
  });

  test("find by substring", async () => {
    await new Model3(dbs, {
      email: "test1@test.de",
      name: "Hans",
      a: 12,
    }).store();
    await expect(
      (await new Model3(dbs).load({ name: { op: "like", val: "%ans" } }))
        .content
    ).toMatchObject({ email: "test1@test.de", name: "Hans" });
  });
});

describe("ManyModel", () => {
  test("creation of one", async () => {
    await expect(() => new Models(dbs, { test: 1 })).toThrow({
      message: "[ManyModel], contents should be an array",
    });
  });

  test("creation of many", async () => {
    const m = new Models(dbs, [{ test: 1 }, { test: 2 }]);
    await expect(m.store()).resolves.toBe(m);
    const [{ id: id1 }, { id: id2 }] = m.contents;
    expect(m.contents).toMatchObject([
      { test: 1, id: id1 },
      { test: 2, id: id2 },
    ]);
  });

  test("update", async () => {
    const ms = new Models(dbs);

    const { id: id1 } = (
      await new Model(dbs, { test: 10, a: 4 }).store()
    ).content;
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

  test("deleteAll", async () => {
    await new Models(dbs, [
      { test: 1, a: 1 },
      { test: 1, a: 2 },
    ]).store();

    await (await new Models(dbs).load({ test: 1 })).deleteAll();
    const newms = await new Models(dbs).load({ test: 1 });

    expect(newms.contents.length).toBe(0);
  });

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
      (await new Models3(dbs).load({ email: "test1@test.de" })).contents.length
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
});

describe("NoneModel", () => {
  test("loadOne success", async () => {
    const m = new NoModel(dbs);

    await expect(m.loadNone({ test: 777 })).resolves.toBe(m);
  });

  test("loadOne fail (too many)", async () => {
    await new Model(dbs, { test: 777 }).store();

    const m = new NoModel(dbs);
    await expect(m.loadNone({ test: 777 })).rejects.toMatchObject({
      message: "[Model] Object does exist",
    });
  });
});
