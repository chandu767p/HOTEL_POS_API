const Role = require('../models/Role');

exports.getRoles = async (req, res, next) => {
  try {
    const roles = await Role.find();
    res.json({ success: true, data: roles });
  } catch (err) {
    next(err);
  }
};

exports.getRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    res.json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
};

exports.createRole = async (req, res, next) => {
  try {
    const role = await Role.create(req.body);
    res.status(201).json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const role = await Role.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    res.json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
};

exports.deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    if (role.isDefault) {
      return res.status(400).json({ success: false, message: 'Cannot delete default system roles' });
    }
    await role.deleteOne();
    res.json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

exports.initializeRoles = async (req, res, next) => {
  try {
    const defaults = [
      { name: 'admin', description: 'Full system access', permissions: ['manage_orders', 'manage_menu', 'manage_tables', 'manage_staff', 'view_reports', 'manage_kitchen', 'manage_roles'], isDefault: true },
      { name: 'manager', description: 'Store management', permissions: ['manage_orders', 'manage_menu', 'manage_tables', 'view_reports', 'manage_kitchen'], isDefault: true },
      { name: 'chef', description: 'Kitchen access', permissions: ['manage_orders', 'manage_kitchen'], isDefault: true },
      { name: 'waiter', description: 'Order taking', permissions: ['manage_orders'], isDefault: true }
    ];
    
    for (const d of defaults) {
      await Role.findOneAndUpdate({ name: d.name }, d, { upsert: true });
    }
    
    res.json({ success: true, message: 'Default roles initialized' });
  } catch (err) {
    next(err);
  }
};
