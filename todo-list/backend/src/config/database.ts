import mongoose from 'mongoose';

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://thamilselvanv_db_user:<db_password>@webserver.ewtkhfx.mongodb.net/?appName=WebServer';
      //'mongodb://localhost:27017/todo-list';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
