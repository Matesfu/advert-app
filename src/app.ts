import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import 'express-async-errors'; // Handle async errors automatically
import { globalErrorHandler } from './middlewares/error.middleware';
import { AppError } from './utils/AppError';

// Initialize App
const app = express();

// 1. Global Middlewares
app.use(helmet()); // Security Headers
app.use(cors()); // CORS
app.use(express.json()); // Body Parser
app.use(morgan('dev')); // HTTP Logger

// 2. Routes
// Mount all routes under /api/v1
// import userRoutes from './routes/user.routes';
// app.use('/api/v1/users', userRoutes);

// Health Check
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Server is running 🚀' });
});

// 3. 404 Handler (for undefined routes)
app.all('*', (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 4. Global Error Handler
app.use(globalErrorHandler);

export default app;
