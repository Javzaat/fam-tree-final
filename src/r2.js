// Cloudflare R2-д холбогдох S3 client
const { S3Client } = require("@aws-sdk/client-s3");

// R2 ашиглах S3Client тохиргоо
const r2 = new S3Client({
  region: "auto",
  // Cloudflare R2 endpoint
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  // Access key, secret key-ийг .env-ээс уншина
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

// R2 client-ийг export хийх
module.exports = r2;
