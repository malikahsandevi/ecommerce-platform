const mongoose = require("mongoose");
const { addCodeSupport } = require("../utils/code");
const { addSoftDeleteSupport } = require("../utils/softDelete");
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

    // 2FA recovery codes (GAP B): ten one-time codes issued at
    // enrolment (and on regeneration), each stored ONLY as a SHA-256
    // hash — the plain codes are shown to the account owner exactly
    // once and exist nowhere else. A used code is dead forever
    // (usedAt set); regenerating replaces the whole set. select:false
    // like every other credential field.
    twoFactorRecoveryCodes: {
      type: [
        {
          hash: { type: String, required: true },
          usedAt: { type: Date, default: null },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      select: false,
    },

    // Password reset (admin "Forgot password" flow). Only the SHA-256
    // HASH of the token is stored — the raw token exists solely in the
    // emailed link. select:false for the hash, same discipline as the
    // TOTP secret. A new request overwrites the previous token, and a
    // successful reset clears both fields (single-use).
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null },

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

// SERIALIZER HARDENING (Claude Section 9 follow-up): credential
// material NEVER serializes. The fields above are select:false, which
// covers ordinary queries — but a document loaded WITH one of them
// (an auth flow's .select('+password'), a freshly saved record) would
// otherwise carry it into any res.json / snapshot that returns the
// document whole. This transform is the model-level guarantee: every
// toJSON (res.json) and toObject of a User drops the password hash,
// the TOTP secret, the recovery-code hashes and the reset-token hash,
// whatever the caller loaded. Internal flows are unaffected — they
// read the fields off the document itself, never off a serialization,
// and the backup export reads .lean() and strips explicitly on top.
const stripCredentialFields = (doc, ret) => {
  delete ret.password;
  delete ret.twoFactorSecret;
  delete ret.twoFactorRecoveryCodes;
  delete ret.passwordResetTokenHash;
  return ret;
};
userSchema.set("toJSON", { transform: stripCredentialFields });
userSchema.set("toObject", { transform: stripCredentialFields });

// Short public code (6 chars, A–Z0–9) — see utils/code.js.
addCodeSupport(userSchema);

// Soft delete (Settings → Deleted Items) — see utils/softDelete.js.
addSoftDeleteSupport(userSchema);

module.exports = mongoose.model("User", userSchema);
