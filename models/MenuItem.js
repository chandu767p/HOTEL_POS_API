const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    // Kitchen assignment for multi-kitchen workflow
    kitchen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Kitchen',
      default: null,
    },
    image: {
      type: String,
      default: '',
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isBundle: {
      type: Boolean,
      default: false,
    },
    bundleItems: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
        quantity: { type: Number, default: 1 },
      },
    ],
    dietary: {
      type: String,
      enum: ['veg', 'non-veg', 'egg', 'none'],
      default: 'none',
    },
    ingredients: [
      {
        inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
        quantity: { type: Number, default: 1 },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('MenuItem', menuItemSchema);
