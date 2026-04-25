const Order = require('../models/Order');
const Table = require('../models/Table');

exports.getStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await Order.aggregate([
      { $match: { createdAt: { $gte: today }, status: 'paid' } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          avgOrderVal: { $avg: '$totalAmount' }
        }
      }
    ]);

    const activeOrders = await Order.countDocuments({ status: { $in: ['pending', 'preparing', 'ready', 'served'] } });
    const totalTables = await Table.countDocuments();
    const occupiedTables = await Table.countDocuments({ status: 'occupied' });

    res.json({
      totalSales: stats[0]?.totalSales || 0,
      activeOrders,
      occupiedTables,
      totalTables,
      avgOrderVal: stats[0]?.avgOrderVal || 0
    });
  } catch (err) {
    next(err);
  }
};

exports.getBestSellers = async (req, res, next) => {
  try {
    const bestSellers = await Order.aggregate([
      { $match: { status: 'paid' } },
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
      { $limit: 10 }
    ]);
    res.json({ success: true, data: bestSellers });
  } catch (err) {
    next(err);
  }
};
