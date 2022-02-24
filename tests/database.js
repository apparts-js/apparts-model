const { Client } = require("pg");
const connect = require("@apparts/db");

let dbs = null;

const setup = async (schemas, setupSql, databaseName) => {
  const { postgresql: pg_config } = {
    ...require("@apparts/config").get("db-test-config"),
  };
  pg_config.db = databaseName;
  pg_config.database = databaseName;
  pg_config.password = pg_config.pw;

  try {
    await createOrDropDatabase("DROP", pg_config, databaseName);
  } catch (e) {
    console.log("DROP DID NOT WORK", e);
    // Can happen, not a problem
  }
  try {
    await createOrDropDatabase("CREATE", pg_config, databaseName);
  } catch (e) {
    console.log("ERROR", e);
    throw e;
  }
  const pool = new Client(pg_config);
  await pool.connect();
  for (const schema of schemas) {
    await pool.query(schema);
  }
  if (setupSql) {
    await pool.query(setupSql);
  }
  await pool.end();
  if (dbs) {
    await new Promise((res) => dbs.shutdown(() => res()));
  }
  dbs = await new Promise((res) => {
    connect({ use: "postgresql", postgresql: pg_config }, (e, newDbs) => {
      if (e) {
        /* istanbul ignore next */
        console.log("DB ERROR");
        throw e;
      }
      console.log("Connected to DB for tests");
      res(newDbs);
    });
  });
  return dbs;
};

const getPool = () => {
  return dbs;
};

const teardown = async () => {
  if (dbs) {
    const tempDbs = dbs;
    dbs = null;
    await new Promise((res) => tempDbs.shutdown(() => res()));
  }
};

const createOrDropDatabase = async (action, db_config, dbName) => {
  const config = { ...db_config };
  config.database = "postgres";

  const client = new Client(config);
  //disconnect client when all queries are finished
  //  client.on('drain', client.end.bind(client));
  client.on("error", async (err) => {
    console.log("COULD NOT " + action + " DATABASE " + dbName + ": " + err);
    await client.end.bind(client);
    throw "COULD NOT " + action + " DATABASE " + dbName + ": " + err;
  });
  await client.connect();

  const escapedDbName = dbName.replace(/"/g, '""');
  const sql = action + ' DATABASE "' + escapedDbName + '"';
  try {
    await client.query(sql);
  } catch (e) {
    await client.end();
    throw e;
  }
  await client.end();
};

module.exports = { setup, teardown, getPool };
