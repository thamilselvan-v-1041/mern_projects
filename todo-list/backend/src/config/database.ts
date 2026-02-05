import mongoose from 'mongoose';

let isConnected = false;

export const connectDatabase = async (): Promise<void> => {
  // Return early if already connected (useful for serverless environments)
  if (isConnected && mongoose.connection.readyState === 1) {
    console.log('MongoDB already connected');
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/todo-list';
    
    // Set connection options for better serverless compatibility
    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };

    await mongoose.connect(mongoUri, options);
    isConnected = true;
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    isConnected = false;
    // Don't exit process in serverless environment
    if (process.env.VERCEL !== 'true') {
      process.exit(1);
    }
    throw error;
  }
};
