// .env файлын тохиргоог уншина
require("dotenv").config();

const { getDB } = require("./mongo");
const { requireAuth } = require("./requireAuth");

const express = require("express");
const cors = require("cors");
const path = require("path");
const uploadRoute = require("./routes/upload");

const app = express();

// Сервер асах үед MongoDB холболтыг шалгана
getDB().catch((err) => {
  console.error("MongoDB connection failed:", err.message);
});

// Нэг удаагийн DB connection 
const pool = require("./db");

/* ================== MIDDLEWARE ================== */
// CORS зөвшөөрөл
app.use(cors());
// JSON body parse хийх
app.use(express.json());
// Upload API route
app.use("/api/upload", uploadRoute);

/* ================== STATIC FILES ================== */
// public хавтасны статик файлуудыг serve хийнэ
app.use(express.static(path.join(__dirname, "..", "public")));

/* ================== HEALTH CHECK ================== */
// Сервер ажиллаж байгаа эсэхийг шалгах endpoint
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Undes backend running" });
});

/* ================== TREE SAVE (Mongo + Auth) ================== */
// Нэвтэрсэн хэрэглэгчийн модны өгөгдлийг хадгална
app.post("/api/tree/save", requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const members = req.body?.members;

  // members массив эсэхийг шалгана
  if (!Array.isArray(members)) {
    return res.status(400).json({ ok: false, error: "INVALID_DATA" });
  }

  try {
    const db = await getDB();

    // uid-аар нь tree өгөгдлийг update / insert хийнэ
    await db.collection("trees").updateOne(
      { uid },
      { $set: { uid, members, updatedAt: new Date(), version: 1 } },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("SAVE TREE ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ================== TREE LOAD (Mongo + Auth) ================== */
// Нэвтэрсэн хэрэглэгчийн модны өгөгдлийг уншина
app.get("/api/tree/load", requireAuth, async (req, res) => {
  const uid = req.user.uid;

  try {
    const db = await getDB();
    const doc = await db.collection("trees").findOne({ uid });

    // Хадгалсан өгөгдөл байхгүй бол хоосон массив буцаана
    res.json({ ok: true, members: doc?.members || [] });
  } catch (err) {
    console.error("LOAD TREE ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ================== START ================== */
// Серверийн порт
const PORT = process.env.PORT || 3000;

// Серверийг асаах
app.listen(PORT, () => {
  console.log(`Undes server running on http://localhost:${PORT}`);
});
