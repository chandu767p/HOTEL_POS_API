const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const Category = require('../models/Category');
const Kitchen = require('../models/Kitchen');
const MenuItem = require('../models/MenuItem');
const Table = require('../models/Table');
const User = require('../models/User');
const Role = require('../models/Role');

dotenv.config();

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pos');
    console.log('🌱 Seeding AJARK POS data...\n');

    // Clear existing data
    await Promise.all([
      Category.deleteMany(),
      Kitchen.deleteMany(),
      MenuItem.deleteMany(),
      Table.deleteMany(),
      User.deleteMany(),
      Role.deleteMany(),
    ]);

    // ── 0. Roles ──
    const roles = await Role.create([
      { 
        name: 'admin', 
        description: 'Super administrator with full access', 
        permissions: ['manage_orders', 'manage_menu', 'manage_tables', 'manage_staff', 'view_reports', 'manage_kitchen', 'manage_roles'], 
        isDefault: true 
      },
      { 
        name: 'manager', 
        description: 'Store manager', 
        permissions: ['manage_orders', 'manage_menu', 'manage_tables', 'view_reports', 'manage_kitchen'], 
        isDefault: true 
      },
      { 
        name: 'chef', 
        description: 'Kitchen head', 
        permissions: ['manage_orders', 'manage_kitchen'], 
        isDefault: true 
      },
      { 
        name: 'waiter', 
        description: 'Floor staff', 
        permissions: ['manage_orders'], 
        isDefault: true 
      },
    ]);
    console.log(`✅ ${roles.length} roles created`);

    const adminRole = roles.find(r => r.name === 'admin')._id;
    const managerRole = roles.find(r => r.name === 'manager')._id;
    const chefRole = roles.find(r => r.name === 'chef')._id;
    const waiterRole = roles.find(r => r.name === 'waiter')._id;

    // ── 1. Users ──
    const users = await User.create([
      { name: 'Admin AJARK', email: 'admin@ajark.com', password: 'password123', role: adminRole },
      { name: 'John Waiter', email: 'waiter@ajark.com', password: 'password123', role: waiterRole },
      { name: 'Maria Chef', email: 'chef@ajark.com', password: 'password123', role: chefRole },
      { name: 'Sam Manager', email: 'manager@ajark.com', password: 'password123', role: managerRole },
    ]);
    console.log(`✅ ${users.length} users created`);

    // ── 2. Kitchens ──
    const kitchens = await Kitchen.create([
      { name: 'Veg Kitchen', type: 'veg', displayColor: '#10b981', description: 'Vegetarian and vegan dishes' },
      { name: 'Non-Veg Kitchen', type: 'non-veg', displayColor: '#ef4444', description: 'Meat and seafood dishes' },
      { name: 'Bar & Beverages', type: 'bar', displayColor: '#8b5cf6', description: 'Drinks, cocktails, mocktails' },
      { name: 'Dessert Station', type: 'dessert', displayColor: '#f59e0b', description: 'Desserts and sweets' },
    ]);
    console.log(`✅ ${kitchens.length} kitchens created`);

    const [vegK, nonVegK, barK, dessertK] = kitchens;

    // ── 3. Categories ──
    const categories = await Category.create([
      { name: 'Appetizers', description: 'Starting delights' },
      { name: 'Main Course', description: 'Hearty meals' },
      { name: 'Desserts', description: 'Sweet endings' },
      { name: 'Beverages', description: 'Refreshing drinks' },
    ]);
    console.log(`✅ ${categories.length} categories created`);

    const [appCat, mainCat, desCat, bevCat] = categories;

    // ── 4. Menu Items (with kitchen assignments) ──
    const menuItems = await MenuItem.create([
      // Appetizers
      { name: 'Bruschetta', price: 8.99, category: appCat._id, kitchen: vegK._id, description: 'Toasted bread with tomatoes and garlic' },
      { name: 'Spring Rolls', price: 7.50, category: appCat._id, kitchen: vegK._id, description: 'Crispy vegetarian spring rolls' },
      { name: 'Calamari', price: 12.50, category: appCat._id, kitchen: nonVegK._id, description: 'Fried squid with dipping sauce' },
      { name: 'Chicken Wings', price: 13.99, category: appCat._id, kitchen: nonVegK._id, description: 'Spicy buffalo wings' },
      // Main Course
      { name: 'Margherita Pizza', price: 14.00, category: mainCat._id, kitchen: vegK._id, description: 'Classic tomato and mozzarella' },
      { name: 'Paneer Tikka Masala', price: 15.50, category: mainCat._id, kitchen: vegK._id, description: 'Creamy paneer in tomato gravy' },
      { name: 'Ribeye Steak', price: 28.50, category: mainCat._id, kitchen: nonVegK._id, description: 'Grilled to perfection' },
      { name: 'Grilled Salmon', price: 24.00, category: mainCat._id, kitchen: nonVegK._id, description: 'Atlantic salmon with herbs' },
      { name: 'Butter Chicken', price: 18.00, category: mainCat._id, kitchen: nonVegK._id, description: 'Tender chicken in butter sauce' },
      // Desserts
      { name: 'Tiramisu', price: 7.50, category: desCat._id, kitchen: dessertK._id, description: 'Coffee-flavoured Italian dessert' },
      { name: 'Chocolate Lava Cake', price: 8.50, category: desCat._id, kitchen: dessertK._id, description: 'Warm cake with molten center' },
      { name: 'Mango Sorbet', price: 6.00, category: desCat._id, kitchen: dessertK._id, description: 'Fresh mango frozen dessert' },
      // Beverages
      { name: 'Fresh Lemonade', price: 4.50, category: bevCat._id, kitchen: barK._id, description: 'Homemade lemon juice' },
      { name: 'Craft Beer', price: 6.00, category: bevCat._id, kitchen: barK._id, description: 'Local brewery selection' },
      { name: 'Mango Mojito', price: 8.00, category: bevCat._id, kitchen: barK._id, description: 'Tropical mocktail' },
      { name: 'Masala Chai', price: 3.50, category: bevCat._id, kitchen: barK._id, description: 'Spiced Indian tea' },
    ]);
    console.log(`✅ ${menuItems.length} menu items created`);

    // ── 5. Tables ──
    const tablesData = [];
    for (let i = 1; i <= 12; i++) {
      tablesData.push({
        number: `${i}`,
        capacity: i <= 4 ? 2 : i <= 9 ? 4 : 6,
        status: 'available',
        position: { x: (i % 4) * 120, y: Math.floor(i / 4) * 120 },
      });
    }
    await Table.insertMany(tablesData);
    console.log(`✅ 12 tables created`);

    console.log('\n✨ Seeding complete!');
    console.log('\n📋 Login credentials:');
    console.log('   Admin:   admin@ajark.com / password123');
    console.log('   Waiter:  waiter@ajark.com / password123');
    console.log('   Chef:    chef@ajark.com / password123');
    console.log('   Manager: manager@ajark.com / password123\n');

    console.log('🍽️  Kitchens created:');
    kitchens.forEach(k => console.log(`   ${k.name} (ID: ${k._id})`));
    console.log('\n');

    process.exit();
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
};

seedDB();
