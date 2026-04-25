const express = require('express');
const router = express.Router();
const {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  updateOrderStatus,
  updateKitchenOrderStatus,
  payOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  createPublicOrder,
  getBestSellers,
} = require('../controllers/orderController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/public', createPublicOrder);

// Public kitchen routes (for the non-login kitchen display)
router.get('/', getOrders);
router.patch('/:orderId/kitchen-order/:koId', updateKitchenOrderStatus);

// Protected staff/admin routes
router.use(protect);
router.get('/best-sellers', getBestSellers);
router.get('/:id', getOrder);
router.post('/', createOrder);
router.put('/:id', updateOrder);
router.put('/:id/status', updateOrderStatus);
router.post('/:id/pay', payOrder);
router.post('/:id/razorpay-order', createRazorpayOrder);
router.post('/:id/razorpay-verify', verifyRazorpayPayment);

module.exports = router;

