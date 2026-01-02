// MongoDB client импорт
const { MongoClient } = require("mongodb");

// .env дээрх MongoDB тохиргоонууд
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "undes";

let client;
let db;

// MongoDB-тэй холбогдоод DB instance буцаах
async function getDB() {
  // Хэрвээ өмнө нь холбогдсон бол шууд буцаана
  if (db) return db;

  // URI тохируулагдаагүй бол алдаа өгнө
  if (!uri) throw new Error("MONGODB_URI not set in .env");

  // MongoDB client үүсгээд холбох
  client = new MongoClient(uri);
  await client.connect();

  // Ашиглах database-ийг тодорхой зааж авна
  db = client.db(dbName);

  console.log("MongoDB connected to DB:", dbName);
  return db;
}

module.exports = { getDB };
