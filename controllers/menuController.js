const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');

// @desc    Get all categories and menu items
// @route   GET /api/menu
// @access  Private
exports.getMenu = async (req, res, next) => {
  try {
    const categories = await Category.find().sort('name');
    const items = await MenuItem.find().populate('category', 'name').sort('name');
    res.json({ categories, items });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a category
// @route   POST /api/menu/categories
// @access  Private/Admin
exports.createCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    const category = await Category.create({ name: name.trim(), description });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
};

// @desc    Update a category
// @route   PUT /api/menu/categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name: name?.trim(), description },
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json(category);
  } catch (err) {
    next(err);
  }
};

// @desc    Delete category
// @route   DELETE /api/menu/categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res, next) => {
  try {
    const itemCount = await MenuItem.countDocuments({ category: req.params.id });
    if (itemCount > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete: ${itemCount} item(s) still in this category. Reassign them first.` });
    }
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a menu item
// @route   POST /api/menu/items
// @access  Private/Admin
exports.createMenuItem = async (req, res, next) => {
  try {
    const { name, price, description, category, isAvailable } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Item name is required' });
    if (!price || isNaN(price)) return res.status(400).json({ success: false, message: 'Valid price is required' });
    if (!category) return res.status(400).json({ success: false, message: 'Category is required' });

    const item = await MenuItem.create({ name: name.trim(), price: Number(price), description, category, isAvailable: isAvailable !== false });
    const populated = await item.populate('category', 'name');
    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
};

// @desc    Update menu item
// @route   PUT /api/menu/items/:id
// @access  Private/Admin
exports.updateMenuItem = async (req, res, next) => {
  try {
    const { name, price, description, category, isAvailable } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (price !== undefined) updates.price = Number(price);
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (isAvailable !== undefined) updates.isAvailable = isAvailable;

    const item = await MenuItem.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).populate('category', 'name');
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
};

// @desc    Delete menu item
// @route   DELETE /api/menu/items/:id
// @access  Private/Admin
exports.deleteMenuItem = async (req, res, next) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    next(err);
  }
};
