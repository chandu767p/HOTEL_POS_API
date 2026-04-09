const Kitchen = require('../models/Kitchen');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');

// @desc    Get all kitchens
// @route   GET /api/kitchens
// @access  Private
exports.getKitchens = async (req, res, next) => {
  try {
    const kitchens = await Kitchen.find().sort('name');
    res.json({ success: true, data: kitchens });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single kitchen
// @route   GET /api/kitchens/:id
// @access  Private
exports.getKitchen = async (req, res, next) => {
  try {
    const kitchen = await Kitchen.findById(req.params.id);
    if (!kitchen) return res.status(404).json({ success: false, message: 'Kitchen not found' });
    res.json({ success: true, data: kitchen });
  } catch (err) {
    next(err);
  }
};

// @desc    Create kitchen
// @route   POST /api/kitchens
// @access  Private/Admin
exports.createKitchen = async (req, res, next) => {
  try {
    const { name, type, displayColor, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Kitchen name is required' });
    const kitchen = await Kitchen.create({ name: name.trim(), type, displayColor, description });
    res.status(201).json({ success: true, data: kitchen });
  } catch (err) {
    next(err);
  }
};

// @desc    Update kitchen
// @route   PUT /api/kitchens/:id
// @access  Private/Admin
exports.updateKitchen = async (req, res, next) => {
  try {
    const kitchen = await Kitchen.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!kitchen) return res.status(404).json({ success: false, message: 'Kitchen not found' });
    res.json({ success: true, data: kitchen });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete kitchen
// @route   DELETE /api/kitchens/:id
// @access  Private/Admin
exports.deleteKitchen = async (req, res, next) => {
  try {
    const itemCount = await MenuItem.countDocuments({ kitchen: req.params.id });
    if (itemCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${itemCount} menu item(s) are assigned to this kitchen.`,
      });
    }
    const kitchen = await Kitchen.findByIdAndDelete(req.params.id);
    if (!kitchen) return res.status(404).json({ success: false, message: 'Kitchen not found' });
    res.json({ success: true, message: 'Kitchen deleted' });
  } catch (err) {
    next(err);
  }
};

// @desc    Get active orders for a specific kitchen — flat list, one card per wave
// @route   GET /api/kitchens/:id/orders
// @access  Private
exports.getKitchenOrders = async (req, res, next) => {
  try {
    const kitchenId = req.params.id;

    const orders = await Order.find({
      'kitchenOrders.kitchen': kitchenId,
      status: { $nin: ['paid', 'cancelled'] },
    })
      .populate('table', 'number')
      .populate('waiter', 'name')
      .populate('kitchenOrders.kitchen', 'name type displayColor')
      .sort('createdAt');

    // Flatten: one result card per kitchenOrder sub-doc for this kitchen
    const result = [];
    for (const order of orders) {
      const matchingKOs = order.kitchenOrders.filter(
        ko => (ko.kitchen?._id || ko.kitchen).toString() === kitchenId
      );
      for (const ko of matchingKOs) {
        result.push({
          _id: order._id,           // parent order _id (for display)
          koId: ko._id,             // sub-doc _id — used in PATCH URL
          tableNumber: order.table?.number,
          waiter: order.waiter?.name,
          orderStatus: order.status,
          createdAt: ko.createdAt || order.createdAt,
          wave: ko.wave || 1,
          isAddition: ko.isAddition || false,
          kitchenOrder: ko,
        });
      }
    }

    // Sort by wave so Wave 1 appears before Wave 2 etc.
    result.sort((a, b) =>
      new Date(a.createdAt) - new Date(b.createdAt)
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// @desc    Update kitchen sub-order status
// @route   PATCH /api/orders/:orderId/kitchen/:kitchenId
// @access  Private
exports.updateKitchenOrderStatus = async (req, res, next) => {
  try {
    const { orderId, kitchenId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'preparing', 'ready', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be: ${validStatuses.join(', ')}` });
    }

    const order = await Order.findById(orderId).populate('table', 'number');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const ko = order.kitchenOrders.find(k => k.kitchen.toString() === kitchenId);
    if (!ko) return res.status(404).json({ success: false, message: 'Kitchen sub-order not found' });

    ko.status = status;
    ko.updatedAt = new Date();

    // Sync parent order status from kitchenOrders
    order.syncStatus();
    await order.save();

    const populated = await Order.findById(orderId)
      .populate('table', 'number status')
      .populate('waiter', 'name')
      .populate('kitchenOrders.kitchen', 'name type displayColor');

    res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};
