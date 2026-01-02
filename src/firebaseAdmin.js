// Firebase Admin SDK импорт
const admin = require("firebase-admin");

// Firebase Admin-ийг нэг удаа initialize хийх функц
function initFirebaseAdmin() {
  // Хэрвээ өмнө нь initialize хийгдсэн бол шууд буцаана
  if (admin.apps.length) return admin;

  // 1) Service account-ийг Base64 хэлбэрээр унших (илүү найдвартай)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    const json = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_B64,
      "base64"
    ).toString("utf8");
    const serviceAccount = JSON.parse(json);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("Firebase Admin init (B64)");
    return admin;
  }

  // 2) Service account-ийг raw JSON string хэлбэрээр унших
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("Firebase Admin init (JSON)");
    return admin;
  }

  // Service account огт олдохгүй үед алдаа шиднэ
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT_B64 эсвэл FIREBASE_SERVICE_ACCOUNT .env дээр байх ёстой"
  );
}

// Функцийг export хийх
module.exports = { initFirebaseAdmin };
