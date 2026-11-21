// models/Category.js
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  description: { type: String, maxlength: 500 },
  image: { type: String },
  
  // Hierarchy (Parent-Child)
  parent: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category',
    default: null 
  },
  
  // SEO
  metaTitle: { type: String, maxlength: 60 },
  metaDescription: { type: String, maxlength: 160 },
  
  // Status
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
}, {
  timestamps: true
});

// Index for better performance
categorySchema.index({ parent: 1 });

// Slug is required + unique, but API callers should not have to invent one:
// derive it from the name when it is missing (document saves only —
// findByIdAndUpdate bypasses this hook, as before).
categorySchema.pre('validate', function () {
  if (!this.slug && this.name) {
    this.slug = this.name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
});

module.exports = mongoose.model('Category', categorySchema);