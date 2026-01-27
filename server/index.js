import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import corpusRoutes from './routes/corpus.js';
import promptRoutes from './routes/prompt.js';
import recordingRoutes from './routes/recording.js';
import validationRoutes from './routes/validation.js';
import userRoutes from './routes/user.js';
import exportRoutes from './routes/export.js';
import { getDiskSpaceStatus } from './middleware/diskSpace.js';
import { authenticate, requireAdmin } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded audio files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/corpus', corpusRoutes);
app.use('/api/prompt', promptRoutes);
app.use('/api/recording', recordingRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/me', userRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Disk space status (admin only)
app.get('/api/disk-space', authenticate, requireAdmin, getDiskSpaceStatus);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
