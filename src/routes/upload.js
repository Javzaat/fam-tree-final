// Media upload хийх Express router
const express = require("express");
const multer = require("multer");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const r2 = require("../r2");

const router = express.Router();

// Файлыг memory дээр түр хадгалаад R2 руу шууд илгээнэ
const upload = multer({ storage: multer.memoryStorage() });

// Файл upload хийх endpoint
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    // Файл ирээгүй тохиолдол
    if (!file) {
      return res.status(400).json({ ok: false, error: "NO_FILE" });
    }

    // R2 дээр хадгалах unique key
    const key = `media/${Date.now()}-${file.originalname}`;

    // Файлыг R2 bucket руу upload хийх
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    // Public URL үүсгэх
    const url = `${process.env.R2_PUBLIC_BASE}/${key}`;

    // Амжилттай upload хийсний хариу
    res.json({
      ok: true,
      url,
      key,
      type: file.mimetype,
    });
  } catch (err) {
    // Алдаа гарсан үед
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Router-ийг export хийнэ
module.exports = router;
