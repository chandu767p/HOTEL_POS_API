const express = require('express');
const router = express.Router();
const { getStats, getBestSellers } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/stats', getStats);
router.get('/best-sellers', getBestSellers);

module.exports = router;
