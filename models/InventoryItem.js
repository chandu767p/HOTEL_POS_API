const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Inventory item name is required'],
      unique: true,
      trim: true,
    },
    unit: {
      type: String,
      required: [true, 'Unit is required (e.g., kg, liters, pcs)'],
      default: 'pcs',
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
    },
    threshold: {
      type: Number,
      default: 10,
      description: 'Alert when stock falls below this level',
    },
    category: {
      type: String,
      enum: ['raw-material', 'beverage', 'packaged', 'other'],
      default: 'other',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
