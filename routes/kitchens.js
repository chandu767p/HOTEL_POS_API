const express = require('express');
const router = express.Router();
const {
  getKitchens,
  getKitchen,
  createKitchen,
  updateKitchen,
  deleteKitchen,
  getKitchenOrders,
  updateKitchenOrderStatus,
} = require('../controllers/kitchenController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Kitchen CRUD
router.get('/', getKitchens);
router.get('/:id', getKitchen);
router.post('/', authorize('admin', 'manager'), createKitchen);
router.put('/:id', authorize('admin', 'manager'), updateKitchen);
router.delete('/:id', authorize('admin', 'manager'), deleteKitchen);

// KDS — orders for a kitchen
router.get('/:id/orders', getKitchenOrders);

// Update kitchen sub-order status (kitchen display → PATCH)
// Note: also accessible via orders router for RESTful clarity
router.patch('/:id/orders/:orderId/status', (req, res, next) => {
  req.params.kitchenId = req.params.id;
  req.params.orderId = req.params.orderId;
  next();
}, updateKitchenOrderStatus);

module.exports = router;
