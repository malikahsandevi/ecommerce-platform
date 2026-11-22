// Boot-time INITIAL config from the environment. At runtime the
// effective credentials live in the database (the Cloudinary entry in
// Settings → API / Integrations, see utils/credentials.js): the
// resolver re-applies them onto this singleton whenever they change,
// so this env config is only the seed the process starts with —
// never the source of truth afterwards.
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

module.exports = cloudinary;