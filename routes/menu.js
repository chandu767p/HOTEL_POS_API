const express = require('express');
const router = express.Router();
const {
  getMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} = require('../controllers/menuController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getMenu);

router.post('/categories', authorize('admin', 'manager'), createCategory);
router.put('/categories/:id', authorize('admin', 'manager'), updateCategory);
router.delete('/categories/:id', authorize('admin', 'manager'), deleteCategory);

router.post('/items', authorize('admin', 'manager'), createMenuItem);
router.put('/items/:id', authorize('admin', 'manager'), updateMenuItem);
router.delete('/items/:id', authorize('admin', 'manager'), deleteMenuItem);

module.exports = router;
