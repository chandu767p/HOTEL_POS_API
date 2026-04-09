const Order  = require('../models/Order');
const Table  = require('../models/Table');
const Kitchen = require('../models/Kitchen');

// ─────────────────────────────────────────────────────────────────────────────
// POS PRINT helper — prints a KOT (Kitchen Order Ticket) to the server console
// ─────────────────────────────────────────────────────────────────────────────
function posPrint(ticket) {
  const line  = '─'.repeat(40);
  const dline = '═'.repeat(40);

  console.log(`\n${dline}`);
  console.log(`  🖨️  AJARK POS — KITCHEN ORDER TICKET`);
  console.log(dline);
  console.log(`  Table   : ${ticket.tableNumber}`);
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
    if (req.query.status) filter.status = req.query.status;

    const orders = await Order.find(filter)
      .populate('table',  'number status')
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
      .populate('table',  'number status')
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
    const { tableId, items, totalAmount } = req.body;

    if (!tableId) return res.status(400).json({ success: false, message: 'tableId is required' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Order must have at least one item' });

    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

    // Snapshot items (name, price from cart)
    const orderItems = items.map(i => ({
      menuItem: i.menuItem,
      name:     i.name     || 'Unknown',
      price:    Number(i.price)    || 0,
      quantity: Number(i.quantity) || 1,
      notes:    i.notes    || '',
      kitchen:  i.kitchen  || null,
    }));

    const calculatedTotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // ── Build kitchenOrders by grouping items by kitchen ──
    const kitchenMap = {};
    for (const item of orderItems) {
      if (item.kitchen) {
        const key = item.kitchen.toString();
        if (!kitchenMap[key]) kitchenMap[key] = [];
        kitchenMap[key].push(item);
      }
    }

    const kitchenOrders = Object.entries(kitchenMap).map(([kitchenId, kitItems]) => ({
      kitchen: kitchenId,
      items:   kitItems,
      status:  'preparing', // auto-advance to preparing after print
    }));

    // Create order with status 'preparing' (kitchen has been notified via print)
    const order = await Order.create({
      table:      tableId,
      waiter:     req.user.id,
      items:      orderItems,
      kitchenOrders,
      totalAmount: calculatedTotal,
      status:     kitchenOrders.length > 0 ? 'preparing' : 'pending',
    });

    // Update table
    table.status       = 'occupied';
    table.currentOrder = order._id;
    await table.save();

    const populated = await Order.findById(order._id)
      .populate('table',  'number status')
      .populate('waiter', 'name')
      .populate('kitchenOrders.kitchen', 'name type displayColor');

    // ── POS PRINT: one ticket per kitchen ──
    for (const ko of populated.kitchenOrders) {
      posPrint({
        orderId:     order._id,
        tableNumber: populated.table?.number,
        waiterName:  populated.waiter?.name || req.user.name || 'Waiter',
        kitchenName: ko.kitchen?.name || 'Kitchen',
        wave:        1,
        items:       ko.items,
      });
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

    const orderItems = items.map(i => ({
      menuItem: i.menuItem,
      name:     i.name     || 'Unknown',
      price:    Number(i.price)    || 0,
      quantity: Number(i.quantity) || 1,
      notes:    i.notes    || '',
      kitchen:  i.kitchen  || null,
    }));

    // ── Snapshot existing items: menuItemId → { quantity, kitchenId } ──
    const existingItemsMap = {};
    for (const item of order.items) {
      const key = (item.menuItem?._id || item.menuItem).toString();
      existingItemsMap[key] = {
        quantity: item.quantity,
        kitchen:  item.kitchen ? item.kitchen.toString() : null,
      };
    }

    // ── Determine the next wave number ──
    const maxWave  = order.kitchenOrders.reduce((max, ko) => Math.max(max, ko.wave || 1), 1);
    const nextWave = maxWave + 1;

    // ── Compute delta: what's truly new or increased ──
    const additionsByKitchen = {};
    for (const item of orderItems) {
      const key      = (item.menuItem?._id || item.menuItem).toString();
      const existing = existingItemsMap[key];
      const kitchenId = item.kitchen ? item.kitchen.toString() : null;

      if (!kitchenId) continue;

      if (!existing) {
        if (!additionsByKitchen[kitchenId]) additionsByKitchen[kitchenId] = [];
        additionsByKitchen[kitchenId].push(item);
      } else if (item.quantity > existing.quantity) {
        if (!additionsByKitchen[kitchenId]) additionsByKitchen[kitchenId] = [];
        additionsByKitchen[kitchenId].push({
          ...item,
          quantity: item.quantity - existing.quantity,
        });
      }
    }

    // ── Append new wave kitchenOrders for each kitchen with additions ──
    for (const [kitchenId, addItems] of Object.entries(additionsByKitchen)) {
      order.kitchenOrders.push({
        kitchen:    kitchenId,
        items:      addItems,
        status:     'preparing', // auto-preparing after print
        wave:       nextWave,
        isAddition: true,
        createdAt:  new Date(),
        updatedAt:  new Date(),
      });
    }

    // Update the master items list and total
    order.items       = orderItems;
    order.totalAmount = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // Keep order status as preparing
    if (!['paid', 'cancelled', 'served'].includes(order.status)) {
      order.status = 'preparing';
    }

    await order.save();

    const populated = await Order.findById(order._id)
      .populate('table',  'number status')
      .populate('waiter', 'name')
      .populate('kitchenOrders.kitchen', 'name type displayColor');

    // ── POS PRINT: only for the new addition wave ──
    for (const [kitchenId, addItems] of Object.entries(additionsByKitchen)) {
      const koKitchen = populated.kitchenOrders.find(
        ko => ko.kitchen?._id?.toString() === kitchenId || ko.kitchen?.toString() === kitchenId
      );
      posPrint({
        orderId:     order._id,
        tableNumber: populated.table?.number,
        waiterName:  populated.waiter?.name || 'Waiter',
        kitchenName: koKitchen?.kitchen?.name || kitchenId,
        wave:        nextWave,
        items:       addItems,
      });
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
      pending:   'preparing',
      preparing: 'ready',
      ready:     'completed',
      completed:  null,
    };

    if (!Object.keys(ALLOWED_TRANSITIONS).includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status.` });
    }

    const order = await Order.findById(orderId).populate('table', 'number');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const ko = order.kitchenOrders.id(koId);
    if (!ko) return res.status(404).json({ success: false, message: 'Kitchen sub-order not found' });

    const allowedNext = ALLOWED_TRANSITIONS[ko.status];
    if (status !== allowedNext) {
      return res.status(400).json({
        success: false,
        message: `Invalid transition: "${ko.status}" → "${allowedNext}" only.`,
      });
    }

    ko.status    = status;
    ko.updatedAt = new Date();
    order.syncStatus();
    await order.save();

    const populated = await Order.findById(orderId)
      .populate('table',  'number status')
      .populate('waiter', 'name')
      .populate('kitchenOrders.kitchen', 'name type displayColor');

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
      .populate('table',  'number status')
      .populate('waiter', 'name');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'paid') return res.status(400).json({ success: false, message: 'Cannot change status of a paid order' });

    order.status = status;
    await order.save();

    // Free up the table if cancelled
    if (status === 'cancelled' && order.table) {
      const table = await Table.findById(order.table._id || order.table);
      if (table) {
        table.status       = 'available';
        table.currentOrder = null;
        await table.save();
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

    const subtotal   = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const discountAmt = (subtotal * Number(discount)) / 100;
    const taxAmt     = ((subtotal - discountAmt) * Number(tax)) / 100;
    const finalTotal = subtotal - discountAmt + taxAmt;

    order.status        = 'paid';
    order.paymentMethod = paymentMethod;
    order.totalAmount   = parseFloat(finalTotal.toFixed(2));
    await order.save();

    // Free up the table
    if (order.table) {
      const table = await Table.findById(order.table._id || order.table);
      if (table) {
        table.status       = 'available';
        table.currentOrder = null;
        await table.save();
      }
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};
