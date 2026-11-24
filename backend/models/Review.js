// models/Review.js
const mongoose = require('mongoose');
const { addCodeSupport } = require('../utils/code');
const { addSoftDeleteSupport } = require('../utils/softDelete');

const reviewSchema = new mongoose.Schema({
  // Review Content
  title: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  content: { 
    type: String, 
    required: true,
    maxlength: 1000
  },
  
  // Rating
  rating: { 
    type: Number, 
    required: true,
    min: 1,
    max: 5
  },
  
  // Relationships
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  product: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product',
    required: true 
  },
  
  // Media (Images/Videos)
  media: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Media' 
  }],
  
  // Helpful Votes
  helpfulVotes: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  helpfulCount: { 
    type: Number, 
    default: 0 
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  
  // Reply (Admin/Vendor)
  reply: {
    content: { type: String },
    repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    repliedAt: { type: Date }
  },
  
  // Timestamps
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date 
  }
}, {
  timestamps: true
});

// Indexes
// One LIVE review per (customer, product). The unique index is
// PARTIAL — it covers only live reviews (`deletedAt: null` matches
// null and missing alike, the codebase's NOT_DELETED shape) — so a
// review sitting in Deleted Items no longer blocks the customer from
// posting a fresh review for the same product. The legacy full
// unique index is dropped at startup (see utils/reviewIndex.js):
// MongoDB will not swap an existing index's options on its own.
reviewSchema.index(
    { user: 1, product: 1 },
    { unique: true, partialFilterExpression: { deletedAt: null } },
);
reviewSchema.index({ product: 1, status: 1 });
reviewSchema.index({ rating: -1 });

// Short public code (6 chars, A–Z0–9) — see utils/code.js.
addCodeSupport(reviewSchema);

// Soft delete (Settings → Deleted Items) — see utils/softDelete.js.
addSoftDeleteSupport(reviewSchema);

module.exports = mongoose.model('Review', reviewSchema);
