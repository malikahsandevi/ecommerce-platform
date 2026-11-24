// models/Product.js
const mongoose = require('mongoose');
const { addCodeSupport } = require('../utils/code');
const { addSoftDeleteSupport } = require('../utils/softDelete');

const productSchema = new mongoose.Schema({
  // Basic Info
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  sku: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true
  },
  description: { 
    type: String,
    required: true,
    maxlength: 2000
  },
  
  // Pricing
  price: { 
    type: Number, 
    required: true,
    min: 0
  },
  comparePrice: {
    type: Number,
    min: 0,
    validate: {
      validator: function(value) {
        // On findByIdAndUpdate, `this` is the query — not the document —
        // so this.price is undefined there. Only enforce the comparison
        // when both values are actually known (document context);
        // otherwise an unrelated edit carrying a compare price would be
        // rejected with a misleading error.
        if (value == null || this.price == null) return true;
        return value > this.price;
      },
      message: 'Compare price must be greater than price'
    }
  },
  costPrice: { 
    type: Number,
    min: 0
  },
  
  // Inventory
  stock: { 
    type: Number, 
    required: true, 
    default: 0,
    min: 0
  },
  lowStockThreshold: { 
    type: Number, 
    default: 10 
  },
  
  // Category & Brand
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category',
    required: true 
  },
  brand: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Brand' 
  },
  
  // Images — a gallery of at most 7 (enforced in the product controller).
  // Contract: the MAIN image is always the first entry and also carries
  // isMain: true; the top-level `image` below mirrors its URL so older
  // consumers (cards, order snapshots) keep working with one field.
  // altText/isPrimary are the pre-gallery field names — kept so records
  // written before the gallery still load; the controller normalises
  // them into alt/isMain on every read and write.
  image: { type: String, default: '' },
  images: [{
    url: { type: String, required: true },
    publicId: { type: String },
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
    alt: { type: String },
    isMain: { type: Boolean, default: false },
    altText: { type: String },
    isPrimary: { type: Boolean, default: false }
  }],
  
  // Variants (Size, Color, etc.)
  variants: [{
    name: { type: String, required: true }, // e.g., "Size", "Color"
    options: [{ type: String, required: true }], // e.g., ["S", "M", "L"]
    price: { type: Number, min: 0 },
    stock: { type: Number, min: 0, default: 0 },
    sku: { type: String }
  }],
  
  // Attributes
  attributes: [{
    name: { type: String, required: true },
    value: { type: String, required: true }
  }],
  
  // SEO
  metaTitle: { type: String, maxlength: 60 },
  metaDescription: { type: String, maxlength: 160 },
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'draft', 'published', 'pending_review', 'rejected', 'archived'],
    default: 'draft' 
  },
  
  // Shipping
  weight: { type: Number, min: 0 },
  dimensions: {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 }
  },
  
  // Ratings
  averageRating: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: { 
    type: Number, 
    default: 0,
    min: 0
  },
  
  // Tags
  tags: [{ type: String, trim: true }],
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
}, {
  timestamps: true
});

// Indexes for better performance
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ averageRating: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ name: 'text', description: 'text' }); // Text search

// Short public code (6 chars, A–Z0–9) — see utils/code.js.
addCodeSupport(productSchema);

// Soft delete (Settings → Deleted Items) — see utils/softDelete.js.
addSoftDeleteSupport(productSchema);

module.exports = mongoose.model('Product', productSchema);