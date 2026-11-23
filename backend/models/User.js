const mongoose = require("mongoose");
const { addCodeSupport } = require("../utils/code");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // Basic Info
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    // Profile
    firstName: { type: String, trim: true, maxlength: 50 },
    lastName: { type: String, trim: true, maxlength: 50 },
    phone: { type: String, trim: true },
    avatar: { type: String, default: "default-avatar.png" },

    // Role & Permissions (Updated as per Chat Context)
    // No schema enum: roles created from Settings → Users & Roles are
    // valid too. The user create/update controllers validate the value
    // against the known role names (built-ins + custom roles).
    role: {
      type: String,
      default: "Customer",
    },
    permissions: {
      settings: {
        view: { type: Boolean, default: false },
        edit: { type: Boolean, default: false },
        sections: {
          general: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
          storeInformation: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
          paymentMethods: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
          shipping: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
          notifications: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
          usersAndRoles: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
          security: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
          apiSettings: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
          integrations: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
          appearance: {
            view: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
          },
        },
      },
    },

    // Security Settings (Two-Factor Auth)
    twoFactorEnabled: { type: Boolean, default: false },
    // TOTP secret (base32). select:false — it must never ride along in a
    // normal query/response; auth flows opt in with .select('+twoFactorSecret').
    // A secret can exist while enabled is still false (enrolment started,
    // waiting for the first code to confirm).
    twoFactorSecret: { type: String, default: null, select: false },

    // Address (Embedded)
    addresses: [
      {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, required: true, default: "Pakistan" },
        isDefault: { type: Boolean, default: false },
      },
    ],

    // Account Status
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },

    // Wishlist
    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],

    // Shopping Profile — the customer's OWN storefront data, stored on
    // the record. (Transactional facts — purchased history, total
    // spend, used coupons — are NOT stored here; they are derived from
    // Orders by GET /api/users/:id/profile so they can never go stale.)
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    liked: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    cart: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        quantity: { type: Number, default: 1, min: 1 },
      },
    ],
    // At most 3 — enforced here as a backstop and, with a clearer
    // message, in the user create/update controllers.
    favoriteCategories: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
        },
      ],
      validate: {
        validator: (value) => !Array.isArray(value) || value.length <= 3,
        message: "Favorite categories are limited to 3.",
      },
    },
  },
  {
    timestamps: true,
  },
);

// The dashboard counts sign-ups inside date windows and lists the newest
// customers first — both sort/filter on createdAt.
userSchema.index({ createdAt: -1 });

// Password Hashing Middleware
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Password Verification Method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual field for full name
userSchema.virtual("fullName").get(function () {
  return `${this.firstName || ""} ${this.lastName || ""}`.trim();
});

// Short public code (6 chars, A–Z0–9) — see utils/code.js.
addCodeSupport(userSchema);

module.exports = mongoose.model("User", userSchema);
