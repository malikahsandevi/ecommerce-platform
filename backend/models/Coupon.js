// models/Coupon.js
const mongoose = require('mongoose');
const { addCodeSupport } = require('../utils/code');
const { addSoftDeleteSupport } = require('../utils/softDelete');

const couponSchema = new mongoose.Schema({
  // Basic Information
  code: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true,
    trim: true
  },
  description: { 
    type: String 
  },
  
  // Discount Type
  discountType: { 
    type: String, 
    enum: ['percentage', 'fixed'], 
    required: true 
  },
  discountValue: { 
    type: Number, 
    required: true,
    min: 0
  },
  
  // Usage Limits
  minPurchaseAmount: { 
    type: Number, 
    default: 0 
  },
  maxDiscountAmount: { 
    type: Number 
  },
  usageLimit: { 
    type: Number, 
    default: null // null means unlimited
  },
  usedCount: { 
    type: Number, 
    default: 0 
  },
  
  // Validity
  validFrom: { 
    type: Date, 
    required: true 
  },
  validUntil: { 
    type: Date, 
    required: true 
  },
  
  // Applicability
  applicableProducts: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product' 
  }],
  applicableCategories: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category' 
  }],
  applicableUsers: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  
  // Status
  isActive: { 
    type: Boolean, 
    default: true 
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
couponSchema.index({ validFrom: 1, validUntil: 1 });
couponSchema.index({ isActive: 1 });

// Short public ID (6 chars, A–Z0–9) — see utils/code.js. The coupon's
// own `code` field above is the customer-facing REDEEM code, so the
// public ID lives in `publicId` under the same generation/uniqueness
// rules every other resource's `code` follows.
addCodeSupport(couponSchema, { field: 'publicId' });

// Soft delete (Settings → Deleted Items) — see utils/softDelete.js.
addSoftDeleteSupport(couponSchema);

module.exports = mongoose.model('Coupon', couponSchema);