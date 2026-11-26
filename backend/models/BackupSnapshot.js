const mongoose = require('mongoose');

// ── Pre-restore safety snapshots (GAP C) ────────────────────────────
// Immediately before a backup restore replaces the store's data,
// the CURRENT state is captured server-side in exactly the backup
// file's format, so a restore can always be undone by restoring the
// snapshot. Only the newest few are kept. The payload carries the
// same integration secrets a backup file does — which is why this
// collection is reachable ONLY through the Super-Admin + Settings
// per-save-password gated download route, and never leaves in any
// ordinary API response.
const backupSnapshotSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reason: { type: String, default: 'pre-restore', trim: true },
    payload: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('BackupSnapshot', backupSnapshotSchema);
