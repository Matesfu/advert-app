import { Request, Response } from 'express';
import { vendorService } from './vendor.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { logger } from '../../utils/logger';
import type {
    IdParam,
    ServiceIdParam,
    CreateVendorInput,
    UpdateVendorInput,
    CreateServiceInput,
    ListVendorsQuery,
} from './vendor.schema';

/**
 * Vendor Controller - Handles HTTP request/response for vendor profiles.
 * 
 * Note: Uses express-async-errors, so no try/catch blocks are needed.
 */

// ============================================
// VENDOR PROFILE CRUD
// ============================================

/**
 * @route   GET /api/v1/vendors
 * @desc    Get all vendors with filtering and pagination
 * @access  Public
 */
export const getAllVendors = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as ListVendorsQuery;

    logger.info(`[VendorController] List vendors request with filters: ${JSON.stringify(query)}`);

    const result = await vendorService.findAll(query);

    sendSuccess(res, result, 200, undefined, {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
    });
};

/**
 * @route   GET /api/v1/vendors/:id
 * @desc    Get a single vendor profile by ID
 * @access  Public
 */
export const getVendorById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as IdParam;

    logger.info(`[VendorController] Get vendor by ID: ${id}`);

    const vendor = await vendorService.findById(id);

    sendSuccess(res, { vendor });
};

/**
 * @route   POST /api/v1/vendors
 * @desc    Create a new vendor profile
 * @access  Private (VENDOR role)
 */
export const createVendor = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const data = req.body as CreateVendorInput;

    logger.info(`[VendorController] Create vendor request by user ID: ${userId}`);

    const vendor = await vendorService.create(userId, data);

    logger.info(`[VendorController] Vendor created successfully: ${vendor.id}`);

    sendCreated(res, { vendor }, 'Vendor profile created successfully');
};

/**
 * @route   PATCH /api/v1/vendors/:id
 * @desc    Update a vendor profile
 * @access  Private (Owner only)
 */
export const updateVendor = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { id } = req.params as unknown as IdParam;
    const data = req.body as UpdateVendorInput;

    logger.info(`[VendorController] Update vendor ID: ${id} by user ID: ${userId}`);

    const vendor = await vendorService.update(id, userId, data);

    logger.info(`[VendorController] Vendor updated successfully: ${vendor.id}`);

    sendSuccess(res, { vendor }, 200, 'Vendor profile updated successfully');
};

/**
 * @route   DELETE /api/v1/vendors/:id
 * @desc    Delete a vendor profile
 * @access  Private (Owner or Admin)
 */
export const deleteVendor = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { id } = req.params as unknown as IdParam;

    logger.info(`[VendorController] Delete vendor ID: ${id} by user ID: ${userId}`);

    await vendorService.delete(id, userId);

    logger.info(`[VendorController] Vendor deleted successfully: ${id}`);

    sendNoContent(res);
};

// ============================================
// SERVICE MANAGEMENT (nested under vendor)
// ============================================

/**
 * @route   GET /api/v1/vendors/:id/services
 * @desc    Get all services for a vendor
 * @access  Public
 */
export const getVendorServices = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as IdParam;

    logger.info(`[VendorController] Get services for vendor ID: ${id}`);

    const services = await vendorService.getServices(id);

    sendSuccess(res, { services });
};

/**
 * @route   POST /api/v1/vendors/:id/services
 * @desc    Add a service to a vendor profile
 * @access  Private (Owner only)
 */
export const addService = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { id } = req.params as unknown as IdParam;
    const data = req.body as CreateServiceInput;

    logger.info(`[VendorController] Add service to vendor ID: ${id} by user ID: ${userId}`);

    const service = await vendorService.addService(id, userId, data);

    logger.info(`[VendorController] Service added successfully: ${service.id}`);

    sendCreated(res, { service }, 'Service added successfully');
};

/**
 * @route   DELETE /api/v1/vendors/:id/services/:serviceId
 * @desc    Remove a service from a vendor profile
 * @access  Private (Owner only)
 */
export const removeService = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { id, serviceId } = req.params as unknown as ServiceIdParam;

    logger.info(`[VendorController] Remove service ID: ${serviceId} from vendor ID: ${id}`);

    await vendorService.removeService(id, serviceId, userId);

    logger.info(`[VendorController] Service removed successfully: ${serviceId}`);

    sendNoContent(res);
};
