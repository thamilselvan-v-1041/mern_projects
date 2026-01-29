# Todo List Web Application

A full-stack todo list application with CRUD functionality built with TypeScript, Vite, React, Express, MongoDB, and Axios.

## Tech Stack

### Frontend
- **React** with TypeScript
- **Vite** for build tooling
- **Axios** for HTTP requests

### Backend
- **Node.js** with **Express**
- **TypeScript**
- **MongoDB** with **Mongoose**
- **CORS** for cross-origin requests

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (running locally or MongoDB Atlas connection string)
- npm or yarn

## Installation

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (already created) with the following variables:
```
PORT=5001
MONGODB_URI=mongodb://localhost:27017/todo-list
CORS_ORIGIN=http://localhost:5173
```

4. Make sure MongoDB is running on your system.

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

### Start MongoDB

Make sure MongoDB is running. If using a local installation:
```bash
# macOS (using Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Or use MongoDB Atlas connection string in .env
```

### Start Backend Server

In the `backend` directory:
```bash
npm run dev
```

The backend server will run on `http://localhost:5001`

### Start Frontend Development Server

In a new terminal, navigate to the `frontend` directory:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## API Endpoints

### Base URL: `http://localhost:5001/api/todos`

- **GET** `/api/todos` - Get all todos
- **GET** `/api/todos/:id` - Get a single todo by ID
- **POST** `/api/todos` - Create a new todo
  ```json
  {
    "title": "Todo title",
    "description": "Optional description",
    "completed": false
  }
  ```
- **PUT** `/api/todos/:id` - Update a todo
  ```json
  {
    "title": "Updated title",
    "description": "Updated description",
    "completed": true
  }
  ```
- **DELETE** `/api/todos/:id` - Delete a todo

## Features

- ✅ Create new todos with title and optional description
- ✅ Read/View all todos
- ✅ Update todo title, description, and completion status
- ✅ Delete todos
- ✅ Toggle completion status with checkbox
- ✅ Edit todos inline
- ✅ Modern, responsive UI
- ✅ Real-time updates

## Project Structure

```
todo-list/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts
│   │   ├── models/
│   │   │   └── Todo.ts
│   │   ├── routes/
│   │   │   └── todoRoutes.ts
│   │   └── server.ts
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── TodoForm.tsx
│   │   │   └── TodoItem.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── types/
│   │   │   └── todo.ts
│   │   ├── App.tsx
│   │   ├── App.css
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Development

### Backend Development
- Uses `ts-node-dev` for hot reloading
- TypeScript compilation on the fly
- MongoDB connection with Mongoose

### Frontend Development
- Vite for fast HMR (Hot Module Replacement)
- TypeScript for type safety
- Axios for API communication

## Troubleshooting

1. **MongoDB Connection Error**: Make sure MongoDB is running and the connection string in `.env` is correct.

2. **CORS Errors**: Verify that `CORS_ORIGIN` in backend `.env` matches your frontend URL (default: `http://localhost:5173`).

3. **Port Already in Use**: Change the `PORT` in backend `.env` if port 5001 is already in use (default changed from 5000 to avoid macOS AirPlay conflict).

4. **Frontend Can't Connect to Backend**: Ensure the backend server is running and check the API base URL in `frontend/src/services/api.ts`.
