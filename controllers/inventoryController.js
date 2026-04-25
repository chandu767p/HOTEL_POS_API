const InventoryItem = require('../models/InventoryItem');
const InventoryLog = require('../models/InventoryLog');

// @desc    Get all inventory items
// @route   GET /api/inventory
// @access  Private
exports.getInventoryItems = async (req, res, next) => {
  try {
    const items = await InventoryItem.find().sort('name');
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

// @desc    Create inventory item
// @route   POST /api/inventory
// @access  Private
exports.createInventoryItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

// @desc    Update inventory item stock (Manual adjustment)
// @route   PATCH /api/inventory/:id
// @access  Private
exports.updateInventoryStock = async (req, res, next) => {
  try {
    const { quantity, type, reason } = req.body;
    const item = await InventoryItem.findById(req.params.id);

    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const previousStock = item.stock;
    let newStock = previousStock;

    if (type === 'in') newStock += Number(quantity);
    else if (type === 'out') newStock -= Number(quantity);
    else if (type === 'adjustment') newStock = Number(quantity);

    item.stock = newStock;
    await item.save();

    // Create log
    await InventoryLog.create({
      inventoryItem: item._id,
      type,
      quantity,
      previousStock,
      newStock,
      reason,
      user: req.user.id,
    });

    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

// @desc    Get inventory logs
// @route   GET /api/inventory/logs
// @access  Private
exports.getInventoryLogs = async (req, res, next) => {
  try {
    const logs = await InventoryLog.find()
      .populate('inventoryItem', 'name unit')
      .populate('user', 'name')
      .sort('-createdAt')
      .limit(100);
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
};
