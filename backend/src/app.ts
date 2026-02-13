// Using this file to create and export the express server

import express from 'express';
import cors from 'cors';

import nutritionRoutes from './routes/nutrition.routes';
import healthRoutes from './routes/health.routes';
import authRoutes from './auth/auth.routes';
import protectTestRoute from "./routes/protect.routes"
import trainingRoutes from './routes/training.routes';
import mealsRoutes from './routes/meals.routes';
import dashboardRoutes from './routes/dashboard.routes';
import measurementsRoutes from './routes/measurements.routes';

const app = express();

// 🔹 global middleware
app.use(cors());
app.use(express.json());

// 🔹 routes
app.use('/health', healthRoutes);
app.use('/api', nutritionRoutes);
app.use('/api', trainingRoutes);
app.use('/api', mealsRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', measurementsRoutes);
app.use('/auth', authRoutes);
app.use('/protect', protectTestRoute)
export default app;
