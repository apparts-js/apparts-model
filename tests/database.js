const { Client } = require("pg");
const connect = require("@apparts/db");

const _DB_CONFIG = require("@apparts/config").get("db-test-config");
const DB_CONFIG = {
  ..._DB_CONFIG,
  postgresql: {
    ..._DB_CONFIG.postgresql,
    password: _DB_CONFIG.postgresql.pw,
  },
};

let g_pool = null;

const setup = async (schemas, setupSql, dbName) => {
  try {
    await createOrDropDatabase("DROP", DB_CONFIG.postgresql, dbName);
  } catch (e) {
    console.log("DROP DID NOT WORK", e);
    // Can happen, not a problem
  }
  await createOrDropDatabase("CREATE", DB_CONFIG.postgresql, dbName);
  const tempDBConfig = {
    ...DB_CONFIG.postgresql,
    db: dbName,
    database: dbName,
  };
  const pool = new Client(tempDBConfig);
  await pool.connect();
  for (const schema of schemas) {
    await pool.query(schema);
  }
  if (setupSql) {
    await pool.query(setupSql);
  }
  await pool.end();
  const dbs = await new Promise((res) => {
    connect({ use: "postgresql", postgresql: tempDBConfig }, (e, dbs) => {
      if (e) {
        /* istanbul ignore next */
        console.log("DB ERROR");
        throw e;
      }
      console.log("Connected to DB " + dbName);
      res(dbs);
    });
  });
  g_pool = dbs;
  return g_pool;
};

const getPool = () => {
  return g_pool;
};

const teardown = async () => {
  if (g_pool) {
    await new Promise((res) => g_pool.shutdown(() => res()));
    g_pool = null;
  }
};

const singleEntry = async (dbName, sql) => {
  const tempDBConfig = { ...DB_CONFIG.postgresql, database: dbName };
  const pool = new Client(tempDBConfig);
  await pool.connect();
  const response = await pool.query(sql);
  await pool.end();
  return response;
};

const createOrDropDatabase = async (action, opts, dbName) => {
  const config = opts;
  config.database = "postgres";

  const client = new Client(config);
  //disconnect client when all queries are finished
  //  client.on('drain', client.end.bind(client));
  client.on("error", (err) => {
    client.end.bind(client);
    throw "COULD NOT " + action + " DATABASE " + dbName + ": " + err;
  });
  await client.connect();

  const escapedDbName = dbName.replace(/"/g, '""');
  const sql = action + ' DATABASE "' + escapedDbName + '"';
  await client.query(sql);
  await client.end();
};

module.exports = { setup, teardown, singleEntry, getPool };
