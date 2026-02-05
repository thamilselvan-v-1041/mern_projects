# Deployment Guide - MongoDB Atlas & Vercel

This guide will help you deploy your Todo List application to Vercel with MongoDB Atlas.

## Prerequisites

1. **MongoDB Atlas Account**: Sign up at [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. **Vercel Account**: Sign up at [https://vercel.com](https://vercel.com)
3. **GitHub Account**: Your code should be pushed to a GitHub repository

## Step 1: Set Up MongoDB Atlas

### 1.1 Create a MongoDB Atlas Cluster

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com)
2. Click **"Create"** or **"Build a Database"**
3. Choose a free tier (M0) cluster
4. Select your preferred cloud provider and region
5. Click **"Create Cluster"**

### 1.2 Configure Database Access

1. Go to **"Database Access"** in the left sidebar
2. Click **"Add New Database User"**
3. Choose **"Password"** authentication
4. Create a username and password (save these securely!)
5. Set user privileges to **"Read and write to any database"**
6. Click **"Add User"**

### 1.3 Configure Network Access

1. Go to **"Network Access"** in the left sidebar
2. Click **"Add IP Address"**
3. Click **"Allow Access from Anywhere"** (or add specific IPs for production)
4. Click **"Confirm"**

### 1.4 Get Your Connection String

1. Go to **"Database"** in the left sidebar
2. Click **"Connect"** on your cluster
3. Choose **"Connect your application"**
4. Copy the connection string
5. Replace `<password>` with your database user password
6. Replace `<database>` with `todo-list` (or your preferred database name)

**Example connection string:**
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/todo-list?retryWrites=true&w=majority
```

## Step 2: Prepare Your Code

### 2.1 Update Backend Environment Variables

Your `.env` file should look like this (for local development):

```env
PORT=5001
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/todo-list?retryWrites=true&w=majority
CORS_ORIGIN=http://localhost:5173
```

### 2.2 Update Frontend Environment Variables

Your frontend `.env` file should look like this (for local development):

```env
VITE_API_URL=http://localhost:5001/api
```

## Step 3: Deploy Backend to Vercel

### 3.1 Push Code to GitHub

Make sure your code is pushed to GitHub:

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### 3.2 Deploy Backend

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Configure the project:
   - **Root Directory**: Select `todo-list/backend`
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### 3.3 Set Environment Variables in Vercel

In your Vercel project settings, go to **"Environment Variables"** and add:

```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/todo-list?retryWrites=true&w=majority
CORS_ORIGIN=https://your-frontend-app.vercel.app,http://localhost:5173
PORT=5001
```

**Important**: Replace `your-frontend-app.vercel.app` with your actual frontend Vercel URL (you'll get this after deploying the frontend).

### 3.4 Deploy

Click **"Deploy"** and wait for the build to complete.

**Note**: Your backend URL will be something like: `https://your-backend-app.vercel.app`

## Step 4: Deploy Frontend to Vercel

### 4.1 Create Frontend Project in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New Project"**
3. Import the same GitHub repository
4. Configure the project:
   - **Root Directory**: Select `todo-list/frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `dist` (auto-detected)
   - **Install Command**: `npm install`

### 4.2 Set Environment Variables in Vercel

In your frontend Vercel project settings, go to **"Environment Variables"** and add:

```
VITE_API_URL=https://your-backend-app.vercel.app/api
```

**Important**: Replace `your-backend-app.vercel.app` with your actual backend Vercel URL from Step 3.

### 4.3 Deploy

Click **"Deploy"** and wait for the build to complete.

## Step 5: Update CORS Configuration

After deploying both frontend and backend:

1. Go to your **backend** Vercel project settings
2. Update the `CORS_ORIGIN` environment variable to include your frontend URL:
   ```
   CORS_ORIGIN=https://your-frontend-app.vercel.app,http://localhost:5173
   ```
3. Redeploy the backend (Vercel will auto-redeploy when you save environment variables)

## Step 6: Verify Deployment

1. Visit your frontend URL: `https://your-frontend-app.vercel.app`
2. Test creating, reading, updating, and deleting todos
3. Check the browser console for any errors
4. Check Vercel function logs if there are issues

## Troubleshooting

### MongoDB Connection Issues

- Verify your MongoDB Atlas connection string is correct
- Check that your IP address is whitelisted in MongoDB Atlas
- Verify database user credentials are correct
- Check Vercel function logs for connection errors

### CORS Errors

- Ensure `CORS_ORIGIN` includes your frontend URL (without trailing slash)
- Make sure both URLs are correct (no typos)
- Redeploy backend after changing CORS_ORIGIN

### API Connection Issues

- Verify `VITE_API_URL` in frontend environment variables matches your backend URL
- Check that backend routes are accessible: `https://your-backend-app.vercel.app/api/todos`
- Check browser network tab for failed requests

### Build Failures

- Ensure `npm run build` works locally before deploying
- Check that all dependencies are in `package.json`
- Review Vercel build logs for specific errors

## Environment Variables Summary

### Backend (Vercel)
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/todo-list?retryWrites=true&w=majority
CORS_ORIGIN=https://your-frontend-app.vercel.app,http://localhost:5173
PORT=5001
```

### Frontend (Vercel)
```
VITE_API_URL=https://your-backend-app.vercel.app/api
```

## Continuous Deployment

Once set up, Vercel will automatically deploy when you push to your GitHub repository's main branch. Make sure to:

1. Update environment variables in Vercel if needed
2. Test locally before pushing
3. Monitor Vercel deployment logs

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
