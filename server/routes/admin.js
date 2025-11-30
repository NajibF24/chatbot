import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Bot from '../models/Bot.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .populate('assignedBots')
      .select('-password');
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all bots
router.get('/bots', requireAdmin, async (req, res) => {
  try {
    const bots = await Bot.find();
    res.json({ bots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADD THESE ROUTES ====================

// Create user
router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, isAdmin, assignedBots } = req.body;

    console.log('🔍 Creating user:', username);

    // Check if user exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log('❌ Username already exists');
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      password: hashedPassword,
      isAdmin: isAdmin || false,
      assignedBots: assignedBots || []
    });

    await user.save();
    await user.populate('assignedBots');

    console.log('✅ User created:', user.username);

    res.status(201).json({
      user: {
        id: user._id,
        username: user.username,
        isAdmin: user.isAdmin,
        assignedBots: user.assignedBots
      }
    });
  } catch (error) {
    console.error('❌ Create user error:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Update user
router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { username, password, isAdmin, assignedBots } = req.body;
    
    console.log('🔍 Updating user:', req.params.id);

    const updateData = { 
      username, 
      isAdmin, 
      assignedBots 
    };

    // Only hash password if provided
    if (password && password.trim() !== '') {
      console.log('🔐 Updating password...');
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('assignedBots').select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ User updated:', user.username);

    res.json({ user });
  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    console.log('🔍 Deleting user:', req.params.id);

    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ User deleted:', user.username);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
