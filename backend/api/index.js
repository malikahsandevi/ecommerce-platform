// Vercel serverless entry — poori Express app ek function ke tor par.
// Saari requests vercel.json ki rewrites se yahan aati hain aur Express
// apne /api/... routes khud handle karta hai.
module.exports = require('../app');
