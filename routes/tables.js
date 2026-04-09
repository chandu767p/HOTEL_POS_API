const express = require('express');
const router = express.Router();
const {
  getTables,
  createTable,
  updateTable,
  deleteTable,
} = require('../controllers/tableController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getTables);
router.post('/', authorize('admin', 'manager'), createTable);
router.put('/:id', updateTable);
router.delete('/:id', authorize('admin', 'manager'), deleteTable);

module.exports = router;
