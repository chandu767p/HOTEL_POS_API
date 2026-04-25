const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem',
    required: true,
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  notes: { type: String },
  kitchen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Kitchen',
    default: null,
  },
});

// Per-kitchen sub-order — supports multiple "waves" per kitchen per order
const kitchenOrderSchema = new mongoose.Schema({
  kitchen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Kitchen',
    required: true,
  },
  items: [orderItemSchema],
  status: {
    type: String,
    enum: ['pending', 'preparing', 'ready', 'completed'],
    default: 'pending',
  },
  // Wave number: 1 = original order, 2+ = additions
  wave: {
    type: Number,
    default: 1,
  },
  // Flag additions so KDS can display "ADDITION" badge
  isAddition: {
    type: Boolean,
    default: false,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema(
  {
    table: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Table',
      required: false,
    },
    waiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [orderItemSchema],
    kitchenOrders: [kitchenOrderSchema],
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'preparing', 'ready', 'served', 'paid', 'cancelled'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'online', 'none'],
      default: 'none',
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    orderType: {
      type: String,
      enum: ['DINE_IN', 'TAKEAWAY', 'ONLINE'],
      default: 'DINE_IN',
    },
    source: {
      type: String,
      enum: ['SWIGGY', 'ZOMATO', 'DIRECT'],
      default: 'DIRECT',
    },
  },
  { timestamps: true }
);

// Auto-derive order status from ALL kitchenOrders (including multi-wave)
orderSchema.methods.syncStatus = function () {
  if (!this.kitchenOrders || this.kitchenOrders.length === 0) return;
  if (['paid', 'cancelled'].includes(this.status)) return;

  const statuses = this.kitchenOrders.map(k => k.status);
  if (statuses.every(s => s === 'completed')) {
    this.status = 'served';
  } else if (statuses.some(s => s === 'ready')) {
    this.status = 'ready';
  } else if (statuses.some(s => s === 'preparing')) {
    this.status = 'preparing';
  } else {
    this.status = 'pending';
  }
};

module.exports = mongoose.model('Order', orderSchema);
