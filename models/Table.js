const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: [true, 'Table number is required'],
      unique: true,
    },
    capacity: {
      type: Number,
      default: 2,
    },
    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved'],
      default: 'available',
    },
    currentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Table', tableSchema);
