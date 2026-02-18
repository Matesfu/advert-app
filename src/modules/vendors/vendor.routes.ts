import { Router } from 'express';
import * as vendorController from './vendor.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { protect } from '../../middlewares/auth.middleware';
import {
    idParamSchema,
    serviceIdParamSchema,
    createVendorSchema,
    updateVendorSchema,
    createServiceSchema,
    listVendorsQuerySchema,
    updatePortfolioImagesSchema,
} from './vendor.schema';

const router = Router();

/**
 * Vendor Routes
 * Base path: /api/v1/vendors
 */

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

/**
 * @route   GET /api/v1/vendors
 * @desc    List all vendor profiles with filtering
 * @access  Public
 */
router.get(
    '/',
    validateRequest(listVendorsQuerySchema, 'query'),
    vendorController.getAllVendors
);

/**
 * @route   GET /api/v1/vendors/:id
 * @desc    Get a single vendor profile
 * @access  Public
 */
router.get(
    '/:id',
    validateRequest(idParamSchema, 'params'),
    vendorController.getVendorById
);

/**
 * @route   GET /api/v1/vendors/:id/services
 * @desc    Get all services for a vendor
 * @access  Public
 */
router.get(
    '/:id/services',
    validateRequest(idParamSchema, 'params'),
    vendorController.getVendorServices
);

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

/**
 * @route   POST /api/v1/vendors
 * @desc    Create a new vendor profile
 * @access  Private (VENDOR role only)
 */
router.post(
    '/',
    protect,
    validateRequest(createVendorSchema),
    vendorController.createVendor
);

/**
 * @route   PATCH /api/v1/vendors/:id
 * @desc    Update a vendor profile
 * @access  Private (Owner only - verified in service layer)
 */
router.patch(
    '/:id',
    protect,
    validateRequest(idParamSchema, 'params'),
    validateRequest(updateVendorSchema),
    vendorController.updateVendor
);

/**
 * @route   DELETE /api/v1/vendors/:id
 * @desc    Delete a vendor profile
 * @access  Private (Owner or Admin)
 */
router.delete(
    '/:id',
    protect,
    validateRequest(idParamSchema, 'params'),
    vendorController.deleteVendor
);

// ============================================
// PORTFOLIO IMAGE MANAGEMENT
// ============================================

/**
 * @route   PATCH /api/v1/vendors/:id/images
 * @desc    Add/remove portfolio images (granular management)
 * @access  Private (Owner only)
 */
router.patch(
    '/:id/images',
    protect,
    validateRequest(idParamSchema, 'params'),
    validateRequest(updatePortfolioImagesSchema),
    vendorController.updatePortfolioImages
);

// ============================================
// SERVICE MANAGEMENT ROUTES (nested)
// ============================================

/**
 * @route   POST /api/v1/vendors/:id/services
 * @desc    Add a service to vendor profile
 * @access  Private (Owner only)
 */
router.post(
    '/:id/services',
    protect,
    validateRequest(idParamSchema, 'params'),
    validateRequest(createServiceSchema),
    vendorController.addService
);

/**
 * @route   DELETE /api/v1/vendors/:id/services/:serviceId
 * @desc    Remove a service from vendor profile
 * @access  Private (Owner only)
 */
router.delete(
    '/:id/services/:serviceId',
    protect,
    validateRequest(serviceIdParamSchema, 'params'),
    vendorController.removeService
);

export default router;
