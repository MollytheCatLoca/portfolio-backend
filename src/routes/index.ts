import { Router } from 'express';
import healthRoutes from './health.routes';
import newsletterRoutes from './newsletter.routes';
import adminRoutes from './admin.routes';

const router = Router();

// Health check routes (no authentication required)
router.use('/health', healthRoutes);

// Newsletter routes (authentication required)
router.use('/newsletter', newsletterRoutes);

// Admin routes (authentication required)
router.use('/admin', adminRoutes);

export default router;
