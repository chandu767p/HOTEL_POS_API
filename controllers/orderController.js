const Order = require('../models/Order');
const Table = require('../models/Table');
const Kitchen = require('../models/Kitchen');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const inventoryService = require('../services/inventoryService');

// ─────────────────────────────────────────────────────────────────────────────
// POS PRINT helper — prints a KOT (Kitchen Order Ticket) to the server console
// ─────────────────────────────────────────────────────────────────────────────
function posPrint(ticket) {
  const line = '─'.repeat(40);
  const dline = '═'.repeat(40);

  console.log(`\n${dline}`);
  console.log(`  🖨️  AJARK POS — KITCHEN ORDER TICKET`);
  console.log(dline);
  console.log(`  Table   : ${ticket.tableNumber || 'Walk-in'}`);
  console.log(`  Waiter  : ${ticket.waiterName}`);
  console.log(`  Order # : ${ticket.orderId.toString().slice(-6).toUpperCase()}`);
  if (ticket.wave > 1) console.log(`  Wave    : ${ticket.wave}  (ADDITION)`);
  console.log(`  Time    : ${new Date().toLocaleTimeString()}`);
  console.log(`  Kitchen : ${ticket.kitchenName}`);
  console.log(line);
  ticket.items.forEach((item, idx) => {
    console.log(`  ${String(idx + 1).padStart(2, '0')}. ${item.name.padEnd(24)} x${item.quantity}`);
    if (item.notes) console.log(`      NOTE: ${item.notes}`);
  });
  console.log(`${dline}\n`);
}

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) {
      const statuses = req.query.status.split(',');
      filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    // Add date range filtering
    if (req.query.startDate && req.query.endDate) {
      filter.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    } else if (req.query.startDate) {
      filter.createdAt = { $gte: new Date(req.query.startDate) };
    } else if (req.query.endDate) {
      filter.createdAt = { $lte: new Date(req.query.endDate) };
    }

    const orders = await Order.find(filter)
      .populate('table', 'number status')
      .populate('waiter', 'name email')
      .populate('kitchenOrders.kitchen', 'name type displayColor')
      .sort('-createdAt');
    res.json(orders);
  } catch (err) {
    next(err);
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('table', 'number status')
      .populate('waiter', 'name email')
      .populate('items.menuItem', 'name price')
      .populate('kitchenOrders.kitchen', 'name type displayColor');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json(order);
  } catch (err) {
    next(err);
  }
};

// @desc    Create order — auto-splits into kitchenOrders, prints KOT, sets preparing
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res, next) => {
  try {
    const { tableId, items, totalAmount, orderType = 'DINE_IN', source = 'DIRECT' } = req.body;

    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Order must have at least one item' });

    let table = null;
    if (tableId && orderType === 'DINE_IN') {
      table = await Table.findById(tableId);
      if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    }

    const MenuItem = require('../models/MenuItem');

    // ── Build kitchenOrders by grouping items (and bundle components) by kitchen ──
    const kitchenMap = {};
    const processedOrderItems = [];

    for (const item of items) {
      const dbItem = await MenuItem.findById(item.menuItem).populate('bundleItems.item');

      // Add the master item to the order snapshot
      processedOrderItems.push({
        menuItem: item.menuItem,
        name: item.name || dbItem?.name || 'Unknown',
        price: Number(item.price) || dbItem?.price || 0,
        quantity: Number(item.quantity) || 1,
        notes: item.notes || '',
        kitchen: item.kitchen || dbItem?.kitchen || null,
      });

      // Handle kitchen routing
      if (dbItem?.isBundle && dbItem.bundleItems?.length > 0) {
        // Expand bundle for kitchen
        for (const bundleEntry of dbItem.bundleItems) {
          const component = bundleEntry.item;
          if (component?.kitchen) {
            const kId = component.kitchen.toString();
            if (!kitchenMap[kId]) kitchenMap[kId] = [];
            kitchenMap[kId].push({
              name: `${component.name} (from ${dbItem.name})`,
              quantity: bundleEntry.quantity * (Number(item.quantity) || 1),
              price: 0, // Components are included in the bundle price
              notes: item.notes,
              menuItem: component._id,
            });
          }
        }
      } else if (item.kitchen || dbItem?.kitchen) {
        const kId = (item.kitchen || dbItem.kitchen).toString();
        if (!kitchenMap[kId]) kitchenMap[kId] = [];
        kitchenMap[kId].push({
          menuItem: item.menuItem,
          name: item.name || dbItem?.name || 'Unknown',
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || dbItem?.price || 0,
          notes: item.notes || '',
        });
      }
    }

    const calculatedTotal = processedOrderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const kitchenOrders = Object.entries(kitchenMap).map(([kitchenId, kitItems]) => ({
      kitchen: kitchenId,
      items: kitItems,
      status: 'preparing',
    }));

    // Create order with status 'preparing'
    const order = await Order.create({
      table: tableId,
      waiter: req.user.id,
      items: processedOrderItems,
      kitchenOrders,
      totalAmount: calculatedTotal,
      status: kitchenOrders.length > 0 ? 'preparing' : 'pending',
      orderType,
      source,
    });

    const io = req.app.get('io');

    // Update table
    if (table) {
      table.status = 'occupied';
      table.currentOrder = order._id;
      await table.save();
      if (io) io.emit('table-status-changed', table);
    }

    const populated = await Order.findById(order._id)
      .populate('table', 'number status')
      .populate('waiter', 'name')
      .populate('kitchenOrders.kitchen', 'name type displayColor');

    // ── POS PRINT: one ticket per kitchen ──
    for (const ko of populated.kitchenOrders) {
      posPrint({
        orderId: order._id,
        tableNumber: populated.table?.number,
        waiterName: populated.waiter?.name || req.user.name || 'Waiter',
        kitchenName: ko.kitchen?.name || 'Kitchen',
        wave: 1,
        items: ko.items,
      });
    }

    // Emit new-order event
    if (io) {
      io.emit('new-order', populated);
      console.log('📡 Socket: emitted new-order for ID:', order._id);
    }

    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
};

// @desc    Create Public order (QR Code)
// @route   POST /api/orders/public
// @access  Public
exports.createPublicOrder = async (req, res, next) => {
  try {
    const { tableId, items } = req.body;

    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Order must have at least one item' });

    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

    // Use a specific "System" or "QR" user ID if available, or handle null waiter in model
    // For now, I'll assume we have a system user or we allow null waiter for QR orders.
    // Let's check User model for an admin or system user.
    // Actually, I'll just find the first Admin to assign as waiter for now, or use a placeholder.
    const User = require('../models/User');
    const systemUser = await User.findOne({ email: 'admin@edensoft.com' }); // Placeholder fallback

    const MenuItem = require('../models/MenuItem');
    const kitchenMap = {};
    const processedOrderItems = [];

    for (const item of items) {
      const dbItem = await MenuItem.findById(item.menuItem).populate('bundleItems.item');
      processedOrderItems.push({
        menuItem: item.menuItem,
        name: item.name || dbItem?.name,
        price: dbItem?.price || 0,
        quantity: item.quantity,
        kitchen: dbItem?.kitchen,
      });

      if (dbItem?.kitchen) {
        const kId = dbItem.kitchen.toString();
        if (!kitchenMap[kId]) kitchenMap[kId] = [];
        kitchenMap[kId].push({
          menuItem: item.menuItem,
          name: dbItem.name,
          quantity: item.quantity,
          price: dbItem.price,
        });
      }
    }

    const calculatedTotal = processedOrderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const kitchenOrders = Object.entries(kitchenMap).map(([kitchenId, kitItems]) => ({
      kitchen: kitchenId,
      items: kitItems,
      status: 'preparing',
    }));

    const order = await Order.create({
      table: tableId,
      waiter: systemUser?._id, // Assign to system admin
      items: processedOrderItems,
      kitchenOrders,
      totalAmount: calculatedTotal,
      status: 'preparing',
      orderType: 'DINE_IN',
      source: 'DIRECT',
    });

    table.status = 'occupied';
    table.currentOrder = order._id;
    await table.save();
    
    const io = req.app.get('io');
    if (io) io.emit('table-status-changed', table);

    const populated = await Order.findById(order._id)
      .populate('table', 'number status')
      .populate('waiter', 'name')
      .populate('kitchenOrders.kitchen', 'name type displayColor');

    if (io) {
      io.emit('new-customer-order', populated);
      io.emit('new-order', populated); // Also notify KDS
    }

    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
};

// @desc    Update order items — wave-based: appends new KDS cards for additions, prints new wave
// @route   PUT /api/orders/:id
// @access  Private
exports.updateOrder = async (req, res, next) => {
  try {
    const { items } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (['paid', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Cannot edit a closed order' });
    }

    const MenuItem = require('../models/MenuItem');
    const orderItems = [];
    const additionsByKitchen = {};

    // ── Determine the next wave number ──
    const maxWave = order.kitchenOrders.reduce((max, ko) => Math.max(max, ko.wave || 1), 1);
    const nextWave = maxWave + 1;

    // ── Snapshot existing items: menuItemId → { quantity } ──
    const existingItemsMap = {};
    for (const item of order.items) {
      const key = (item.menuItem?._id || item.menuItem).toString();
      existingItemsMap[key] = item.quantity;
    }

    for (const item of items) {
      const dbItem = await MenuItem.findById(item.menuItem);
      const kitchenId = (item.kitchen || dbItem?.kitchen)?.toString();

      const processedItem = {
        menuItem: item.menuItem,
        name: item.name || dbItem?.name || 'Unknown',
        price: Number(item.price) || dbItem?.price || 0,
        quantity: Number(item.quantity) || 1,
        notes: item.notes || '',
        kitchen: kitchenId || null,
      };
      orderItems.push(processedItem);

      const key = processedItem.menuItem.toString();
      const prevQty = existingItemsMap[key] || 0;

      if (processedItem.quantity > prevQty && kitchenId) {
        if (!additionsByKitchen[kitchenId]) additionsByKitchen[kitchenId] = [];
        additionsByKitchen[kitchenId].push({
          ...processedItem,
          quantity: processedItem.quantity - prevQty,
        });
      }
    }

    // ── Append new wave kitchenOrders for each kitchen with additions ──
    for (const [kitchenId, addItems] of Object.entries(additionsByKitchen)) {
      order.kitchenOrders.push({
        kitchen: kitchenId,
        items: addItems,
        status: 'preparing', // auto-preparing after print
        wave: nextWave,
        isAddition: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Update the master items list and total
    order.items = orderItems;
    order.totalAmount = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // Keep order status as preparing
    if (!['paid', 'cancelled', 'served'].includes(order.status)) {
      order.status = 'preparing';
    }

    await order.save();

    const populated = await Order.findById(order._id)
      .populate('table', 'number status')
      .populate('waiter', 'name')
      .populate('kitchenOrders.kitchen', 'name type displayColor');

    // ── POS PRINT: only for the new addition wave ──
    for (const [kitchenId, addItems] of Object.entries(additionsByKitchen)) {
      const koKitchen = populated.kitchenOrders.find(
        ko => ko.kitchen?._id?.toString() === kitchenId || ko.kitchen?.toString() === kitchenId
      );
      posPrint({
        orderId: order._id,
        tableNumber: populated.table?.number,
        waiterName: populated.waiter?.name || 'Waiter',
        kitchenName: koKitchen?.kitchen?.name || kitchenId,
        wave: nextWave,
        items: addItems,
      });
    }

    // Emit order-updated event
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', populated);
      console.log('📡 Socket: emitted order-updated for ID:', order._id);
    }

    res.json(populated);
  } catch (err) {
    next(err);
  }
};


// @desc    Update kitchen sub-order status by sub-document _id
// @route   PATCH /api/orders/:orderId/kitchen-order/:koId
// @access  Private
exports.updateKitchenOrderStatus = async (req, res, next) => {
  try {
    const { orderId, koId } = req.params;
    const { status } = req.body;

    const ALLOWED_TRANSITIONS = {
      pending: 'preparing',
      preparing: 'ready',
      ready: 'completed',
      completed: null,
    };

    if (!Object.keys(ALLOWED_TRANSITIONS).includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status.` });
    }

    const order = await Order.findById(orderId).populate('table', 'number');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const ko = order.kitchenOrders.id(koId);
    if (!ko) return res.status(404).json({ success: false, message: 'Kitchen sub-order not found' });

    // If already in requested status, return success (idempotent)
    if (ko.status === status) {
      const populated = await Order.findById(orderId)
        .populate('table', 'number status')
        .populate('waiter', 'name')
        .populate('kitchenOrders.kitchen', 'name type displayColor');
      return res.json(populated);
    }

    const allowedNext = ALLOWED_TRANSITIONS[ko.status];
    if (status !== allowedNext) {
      return res.status(400).json({
        success: false,
        message: `Status is currently "${ko.status}". Expected next transition is "${allowedNext}".`,
      });
    }

    ko.status = status;
    ko.updatedAt = new Date();
    order.syncStatus();
    await order.save();

    const populated = await Order.findById(orderId)
      .populate('table', 'number status')
      .populate('waiter', 'name')
      .populate('kitchenOrders.kitchen', 'name type displayColor');

    // Emit kitchen-status-updated event
    const io = req.app.get('io');
    if (io) {
      io.emit('kitchen-status-updated', populated);
      console.log('📡 Socket: emitted kitchen-status-updated for ID:', orderId);
    }

    res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};


// @desc    Update order status manually
// @route   PUT /api/orders/:id/status
// @access  Private
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'preparing', 'ready', 'served', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const order = await Order.findById(req.params.id)
      .populate('table', 'number status')
      .populate('waiter', 'name');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'paid') return res.status(400).json({ success: false, message: 'Cannot change status of a paid order' });

    order.status = status;
    await order.save();

    // Free up the table if cancelled
    if (status === 'cancelled' && order.table) {
      const table = await Table.findById(order.table._id || order.table);
      if (table) {
        table.status = 'available';
        table.currentOrder = null;
        await table.save();
        const io = req.app.get('io');
        if (io) io.emit('table-status-changed', table);
      }
    }

    res.json(order);
  } catch (err) {
    next(err);
  }
};

// @desc    Pay and close order
// @route   POST /api/orders/:id/pay
// @access  Private
exports.payOrder = async (req, res, next) => {
  try {
    const { paymentMethod, discount = 0, tax = 5 } = req.body;

    const validMethods = ['cash', 'card', 'online'];
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Valid paymentMethod is required (cash, card, online)' });
    }

    const order = await Order.findById(req.params.id).populate('table');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'paid') return res.status(400).json({ success: false, message: 'Order is already paid' });

    const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const discountAmt = (subtotal * Number(discount)) / 100;
    const taxAmt = ((subtotal - discountAmt) * Number(tax)) / 100;
    const finalTotal = subtotal - discountAmt + taxAmt;

    order.status = 'paid';
    order.paymentMethod = paymentMethod;
    order.totalAmount = parseFloat(finalTotal.toFixed(2));
    await order.save();

    // Deduct stock
    await inventoryService.deductStockForOrder(order);

    const io = req.app.get('io');

    // Free up the table
    if (order.table) {
      const table = await Table.findById(order.table._id || order.table);
      if (table) {
        table.status = 'available';
        table.currentOrder = null;
        await table.save();
        if (io) io.emit('table-status-changed', table);
      }
    }

    // Emit payment-success event
    if (io) {
      io.emit('payment-success', { orderId: order._id, tableNumber: order.table?.number });
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// @desc    Create Razorpay Order
// @route   POST /api/orders/:id/razorpay-order
// @access  Private
exports.createRazorpayOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: Math.round(order.totalAmount * 100), // amount in the smallest currency unit
      currency: "INR",
      receipt: `order_rcptid_${order._id.toString().slice(-6)}`,
    };

    const rzpOrder = await razorpay.orders.create(options);

    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.json({ success: true, rzpOrder });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify Razorpay Payment
// @route   POST /api/orders/:id/razorpay-verify
// @access  Private
exports.verifyRazorpayPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      const order = await Order.findById(req.params.id).populate('table');
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

      order.status = 'paid';
      order.paymentMethod = 'online';
      order.razorpayPaymentId = razorpay_payment_id;
      await order.save();

      // Deduct stock
      await inventoryService.deductStockForOrder(order);

      const io = req.app.get('io');

      // Free up the table
      if (order.table) {
        const table = await Table.findById(order.table._id || order.table);
        if (table) {
          table.status = 'available';
          table.currentOrder = null;
          await table.save();
          if (io) io.emit('table-status-changed', table);
        }
      }

      // Emit payment-success event
      if (io) {
        io.emit('payment-success', { orderId: order._id, tableNumber: order.table?.number });
      }

      res.json({ success: true, message: "Payment verified successfully" });
    } else {
      res.status(400).json({ success: false, message: "Invalid signature" });
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Get top selling items (best sellers)
// @route   GET /api/orders/best-sellers
// @access  Private
exports.getBestSellers = async (req, res, next) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;
    const filter = { status: 'paid' }; // Only count paid orders

    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const bestSellers = await Order.aggregate([
      { $match: filter },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.menuItem',
          name: { $first: '$items.name' },
          totalSold: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json(bestSellers);
  } catch (err) {
    next(err);
  }
};
