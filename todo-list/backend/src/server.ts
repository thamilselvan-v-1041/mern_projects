import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDatabase } from './config/database';
import todoRoutes from './routes/todoRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Parse CORS origins (comma-separated string to array)
const allowedOrigins = CORS_ORIGIN.split(',').map(origin => origin.trim());

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/todos', todoRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Connect to database and start server
const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Middleware to ensure database connection for Vercel serverless functions
app.use(async (req, res, next) => {
  if (process.env.VERCEL === 'true') {
    try {
      await connectDatabase();
    } catch (error) {
      console.error('Database connection error in serverless:', error);
      return res.status(500).json({ error: 'Database connection failed' });
    }
  }
  next();
});

// Start server only if not in Vercel serverless environment
if (process.env.VERCEL !== 'true') {
  startServer();
}

// Export app for Vercel serverless functions
export default app;
