import 'express-async-errors'; // MUST be imported first to handle async errors
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { globalErrorHandler } from './middlewares/error.middleware';
import { AppError } from './utils/AppError';

// Import Routes
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import vendorRoutes from './modules/vendors/vendor.routes';
import reviewRoutes from './modules/reviews/review.routes';
import favoriteRoutes from './modules/favorites/favorite.routes';
import messageRoutes from './modules/messages/message.routes';
import categoryRoutes from './modules/categories/category.routes';
import eventTypeRoutes from './modules/event-types/event-type.routes';

// Initialize App
const app = express();

// ============================================
// 1. GLOBAL MIDDLEWARES
// ============================================
app.use(helmet()); // Security Headers
app.use(cors()); // CORS
app.use(express.json({ limit: '10kb' })); // Body Parser with size limit
app.use(cookieParser()); // Cookie Parser (for refresh token)
app.use(morgan('dev')); // HTTP Logger

// ============================================
// 2. API ROUTES
// ============================================

// Health Check
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Server is running 🚀' });
});

// Mount Module Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/favorites', favoriteRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/categories', categoryRoutes);

// Admin Module Routes
app.use('/api/v1/admin/event-types', eventTypeRoutes);

// Nested Routes (Reviews under Vendors)
app.use('/api/v1/vendors/:vendorId/reviews', reviewRoutes);

// ============================================
// 3. ERROR HANDLING
// ============================================

// 404 Handler (for undefined routes)
app.all('*', (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler
app.use(globalErrorHandler);

export default app;
