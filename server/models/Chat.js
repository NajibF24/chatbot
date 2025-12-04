import mongoose from 'mongoose';

// ============================================================================
// 📋 SUB-SCHEMA: Attachment File Object
// ============================================================================
const attachedFileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  path: { type: String, required: true },
  type: { type: String, default: 'other' },
  size: { type: String, default: '0' }
}, { _id: false }); // ← IMPORTANT: No _id for sub-documents

// ============================================================================
// 📋 SUB-SCHEMA: Message in Array (Legacy support)
// ============================================================================
const messageSchema = new mongoose.Schema({
  role: { 
    type: String, 
    required: true, 
    enum: ['user', 'assistant', 'system'] 
  },
  content: { 
    type: String, 
    default: '' 
  },
  attachedFiles: [attachedFileSchema], // ← Use explicit schema
  attachment: {
    filename: String,
    url: String,
    mimetype: String
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// ============================================================================
// 📋 MAIN SCHEMA: Chat Document
// ============================================================================
const chatSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  botId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Bot', 
    required: true,
    index: true
  },
  messages: [messageSchema], 
  
  role: { 
    type: String, 
    enum: ['user', 'assistant', 'system'] 
  },
  content: { 
    type: String, 
    default: '' 
  },
  
  // ✅ CRITICAL FIX: Use explicit schema definition
  attachedFiles: {
    type: [attachedFileSchema],
    default: []
  },
  
  // Legacy field (optional)
  attachment: {
    filename: String,
    url: String,
    mimetype: String
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true,
  // Prevent Mongoose from modifying our data
  strict: true,
  strictQuery: false
});

// ============================================================================
// 🔧 INDEXES for Performance
// ============================================================================
chatSchema.index({ userId: 1, botId: 1, createdAt: -1 });

// ============================================================================
// 🚀 EXPORT MODEL
// ============================================================================
export default mongoose.model('Chat', chatSchema);
