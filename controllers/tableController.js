const Table = require('../models/Table');

// @desc    Get all tables
// @route   GET /api/tables
// @access  Private
exports.getTables = async (req, res, next) => {
  try {
    const tables = await Table.find()
      .populate('currentOrder')
      .sort({ number: 1 })
      .collation({ locale: 'en', numericOrdering: true });
    res.json(tables);
  } catch (err) {
    next(err);
  }
};

// @desc    Create a table
// @route   POST /api/tables
// @access  Private/Admin
exports.createTable = async (req, res, next) => {
  try {
    const table = await Table.create(req.body);
    res.status(201).json(table);
  } catch (err) {
    next(err);
  }
};

// @desc    Update a table
// @route   PUT /api/tables/:id
// @access  Private
exports.updateTable = async (req, res, next) => {
  try {
    const table = await Table.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!table) return res.status(404).json({ message: 'Table not found' });
    res.json(table);
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a table
// @route   DELETE /api/tables/:id
// @access  Private/Admin
exports.deleteTable = async (req, res, next) => {
  try {
    const table = await Table.findByIdAndDelete(req.params.id);
    if (!table) return res.status(404).json({ message: 'Table not found' });
    res.json({ message: 'Table deleted' });
  } catch (err) {
    next(err);
  }
};
