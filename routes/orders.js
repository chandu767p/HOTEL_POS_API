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
  getBestSellers,
} = require('../controllers/orderController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getOrders);
router.get('/best-sellers', getBestSellers);
router.get('/:id', getOrder);
router.post('/', createOrder);
router.put('/:id', updateOrder);
router.put('/:id/status', updateOrderStatus);
// Target specific kitchenOrder sub-doc by its _id (supports multi-wave)
router.patch('/:orderId/kitchen-order/:koId', updateKitchenOrderStatus);
router.post('/:id/pay', payOrder);

module.exports = router;

