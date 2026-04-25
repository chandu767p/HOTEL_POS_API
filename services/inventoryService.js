const InventoryItem = require('../models/InventoryItem');
const InventoryLog = require('../models/InventoryLog');
const MenuItem = require('../models/MenuItem');

exports.deductStockForOrder = async (order) => {
  try {
    for (const item of order.items) {
      // Find the menu item with ingredients populated
      const dbItem = await MenuItem.findById(item.menuItem).populate('ingredients.inventoryItem');
      
      if (dbItem && dbItem.ingredients && dbItem.ingredients.length > 0) {
        for (const ingredient of dbItem.ingredients) {
          const invItem = ingredient.inventoryItem;
          if (!invItem) continue;

          const quantityToDeduct = ingredient.quantity * item.quantity;
          const previousStock = invItem.stock;
          invItem.stock -= quantityToDeduct;
          await invItem.save();

          // Log the deduction
          await InventoryLog.create({
            inventoryItem: invItem._id,
            type: 'out',
            quantity: quantityToDeduct,
            previousStock,
            newStock: invItem.stock,
            reason: `Order #${order._id.toString().slice(-6).toUpperCase()}`,
            order: order._id,
            user: order.waiter,
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to deduct stock:', err);
    // Don't throw to avoid blocking payment completion, but log it
  }
};
