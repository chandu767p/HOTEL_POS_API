const mongoose = require('mongoose');

const kitchenSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Kitchen name is required'],
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['veg', 'non-veg', 'bar', 'dessert', 'general'],
      default: 'general',
    },
    displayColor: {
      type: String,
      default: '#6366f1', // indigo
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Kitchen', kitchenSchema);
