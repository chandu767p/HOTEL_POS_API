const express = require('express');
const router = express.Router();
const {
  getInventoryItems,
  createInventoryItem,
  updateInventoryStock,
  getInventoryLogs,
} = require('../controllers/inventoryController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getInventoryItems)
  .post(createInventoryItem);

router.get('/logs', getInventoryLogs);

router.patch('/:id', updateInventoryStock);

module.exports = router;
