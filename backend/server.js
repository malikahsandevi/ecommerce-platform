// Local / classic hosting entry point — app ko ek port par sunta hai.
// Vercel par api/index.js istemal hota hai (serverless), ye file wahan
// use nahi hoti.
const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
