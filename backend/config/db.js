const mongoose = require('mongoose');
const dns = require('dns');

// Google DNS (8.8.8.8) ya Cloudflare (1.1.1.1) set karne ke liye:
dns.setDefaultResultOrder('ipv4first'); // IPv4 traffic preference
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Serverless (Vercel) par har invocation nayi ho sakti hai, is liye
// connection ko cache karte hain — warm invocations dobara connect
// nahi karti. Local server par bhi yehi ek dafa connect hota hai.
let cachedPromise = null;

const connectDB = () => {
    if (mongoose.connection.readyState >= 1) {
        return Promise.resolve(mongoose.connection);
    }
    if (!cachedPromise) {
        cachedPromise = mongoose
            .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 })
            .then((conn) => {
                console.log(`MongoDB Connected: ${conn.connection.host}`);
                return conn.connection;
            })
            .catch((error) => {
                cachedPromise = null; // agli request par dobara koshish ho
                console.error(`MongoDB connection error: ${error.message}`);
                throw error;
            });
    }
    return cachedPromise;
};

module.exports = connectDB;
