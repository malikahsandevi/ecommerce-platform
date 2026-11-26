// models/Order.js
const mongoose = require('mongoose');
const { addCodeSupport } = require('../utils/code');
const { addSoftDeleteSupport } = require('../utils/softDelete');

const orderSchema = new mongoose.Schema({
  // Order Information
  orderNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  
  // Customer
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  
  // Order Items
  items: [{
    product: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product',
      required: true 
    },
    name: { 
      type: String, 
      required: true 
    },
    sku: { type: String },
    price: { 
      type: Number, 
      required: true 
    },
    quantity: { 
      type: Number, 
      required: true, 
      min: 1 
    },
    variant: { type: String },
    image: { type: String }
  }],
  
  // Pricing
  subtotal: { 
    type: Number, 
    required: true 
  },
  tax: { 
    type: Number, 
    default: 0 
  },
  shippingCost: { 
    type: Number, 
    default: 0 
  },
  discount: { 
    type: Number, 
    default: 0 
  },
  coupon: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Coupon' 
  },
  // Whether this order's coupon redemption is currently inside the
  // coupon's usedCount. The redemption counts exactly while the order
  // is live (not trashed) and its status is not cancelled/refunded;
  // every state crossing moves the counter and this marker together,
  // so a release or a re-record can never happen twice. Orders saved
  // before this field existed carry no marker — the order controller
  // treats a missing marker on a coupon order as "counted" (the old
  // code recorded the use at creation and never released it).
  couponCounted: {
    type: Boolean
  },
  total: { 
    type: Number, 
    required: true 
  },
  
  // Shipping Address
  shippingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, required: true }
  },
  
  // Billing Address
  billingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, required: true }
  },
  
  // Payment
  paymentMethod: { 
    type: String, 
    required: true 
  },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'paid', 'failed', 'refunded'], 
    default: 'pending' 
  },
  paymentId: { type: String },
  paymentDate: { type: Date },
  
  // Order Status
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending' 
  },
  
  // Tracking
  trackingNumber: { type: String },
  shippingCarrier: { type: String },
  // The Settings → Shipping courier profile this order rides with
  // (its `id`); shippingCarrier above stays the name snapshot the
  // orders list has always shown. The courier profile supplies the
  // tracking link template and the live-sync API configuration.
  courierId: { type: String, default: '' },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  // When the post-delivery review-request email was claimed/sent.
  // The claim is atomic (orderController.maybeSendReviewRequest),
  // so the invitation goes out exactly once per order, however
  // the Delivered transition was reached.
  reviewRequestSentAt: { type: Date },

  // Shipping choice snapshots — what the shared calculator priced at
  // placement (utils/shipping): the method / delivery option the
  // order was placed with and the delivery zone its city matched.
  // Names are snapshotted so the order's money breakdown keeps
  // reading correctly even if the settings entries are later renamed
  // or removed. Empty on orders placed before the Shipping centre
  // existed (and on any order placed with no methods configured).
  shippingMethodId: { type: String, default: '' },
  shippingMethodName: { type: String, default: '' },
  deliveryOptionId: { type: String, default: '' },
  deliveryOptionName: { type: String, default: '' },
  deliveryZoneName: { type: String, default: '' },
  
  // Notes
  customerNote: { type: String },
  adminNote: { type: String },
  
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

// Indexes for better performance
orderSchema.index({ user: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

// Short public code (6 chars, A–Z0–9) — see utils/code.js.
addCodeSupport(orderSchema);

// Soft delete (Settings → Deleted Items) — see utils/softDelete.js.
addSoftDeleteSupport(orderSchema);

module.exports = mongoose.model('Order', orderSchema);