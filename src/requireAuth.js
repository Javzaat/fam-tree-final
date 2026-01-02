// Firebase Admin initialize хийх функц импорт
const { initFirebaseAdmin } = require("./firebaseAdmin");

// Authorization header-ээс Bearer token салгаж авах
function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// Auth middleware: нэвтэрсэн эсэхийг шалгана
async function requireAuth(req, res, next) {
  try {
    // Token шалгах
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "NO_TOKEN" });
    }

    // Firebase Admin-аар token баталгаажуулах
    const admin = initFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);

    // Баталгаажсан хэрэглэгчийн мэдээллийг req дээр суулгана
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
    };

    return next();
  } catch (e) {
    // Token буруу эсвэл хугацаа дууссан үед
    console.error("INVALID_TOKEN:", e.message);
    return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
  }
}

module.exports = { requireAuth };
