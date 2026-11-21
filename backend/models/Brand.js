// models/Brand.js
const mongoose = require('mongoose');
const { addCodeSupport } = require('../utils/code');

const brandSchema = new mongoose.Schema({
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
  logo: { type: String },
  website: { type: String },
  
  // SEO
  metaTitle: { type: String, maxlength: 60 },
  metaDescription: { type: String, maxlength: 160 },
  
  // Status
  isActive: { type: Boolean, default: true },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
}, {
  timestamps: true
});

// Slug is required + unique, but API callers should not have to invent one:
// derive it from the name when it is missing (document saves only —
// findByIdAndUpdate bypasses this hook, as before).
brandSchema.pre('validate', function () {
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

// Short public code (6 chars, A–Z0–9) — see utils/code.js.
addCodeSupport(brandSchema);

module.exports = mongoose.model('Brand', brandSchema);