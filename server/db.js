// PostgreSQL connection + the crypto keys used for column encryption /
// blind indexes. In production these come from a vault; here they default to
// the demo values used by database/02_seed.sql. Override with env vars.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@127.0.0.1:5432/mahfooz",
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  ENC_KEY: process.env.ENC_KEY || "DEMO-column-encryption-key-REPLACE-IN-PROD",
  IDX_KEY: process.env.IDX_KEY || "DEMO-blind-index-hmac-key-REPLACE-IN-PROD",
};
