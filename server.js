// server.js
const dotenv = require('dotenv');
dotenv.config(); // ✅ must be first before anything reads process.env

const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const messageRoutes = require('./routes/messageRoutes');
const { initSocket } = require('./socket/socket');
const connectionRoutes = require('./routes/connectionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

connectDB();

const app = express();

// =========================
// MIDDLEWARE
// =========================
app.use(cors());
app.use(express.json());

// =========================
// ROUTES
// =========================
app.use('/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/connections', connectionRoutes);
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);


// =========================
// TEST ROUTE
// =========================
app.get('/', (req, res) => {
    res.json({ success: true, message: 'Matrimony backend running' });
});

// =========================
// HTTP SERVER + SOCKET
// =========================
const server = http.createServer(app);
initSocket(server); // ✅ socket initialized before server.listen

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});