const {
    NOT_DELETED,
    supportsSoftDelete,
    applySoftDelete,
} = require('../utils/softDelete');
const { duplicateKeyMessage } = require('../utils/duplicateKey');
const { detachForDelete } = require('../utils/deleteImpact');

// Delete-impact modules served by this shared controller: deleting a
// category or brand no longer REFUSES while live records point at it
// (the e006341 block) — Ahsan's newer rule supersedes it: the delete
// confirmation WARNS about the links, and the delete DETACHES them
// (products become uncategorized / brandless, subcategories become
// top-level), snapshotting what was removed onto the trashed record
// so a restore re-links exactly (utils/deleteImpact).
const DELETE_IMPACT_MODULES = { Category: 'categories', Brand: 'brands' };

// A duplicate unique field (slug / code / …) answers with a clean
// sentence, never the raw MongoDB E11000 driver text.
const errorMessage = (error, noun) => duplicateKeyMessage(error, noun) || error.message;

// The soft-delete stamps are server-owned: soft delete writes them
// (with the tombstone swap of unique values) and the Deleted Items
// restore clears them. A create/update body carrying them could
// birth a record already trashed — invisible in every list yet still
// holding its unique values — or trash/un-trash a record while
// skipping every side effect and guard on those paths.
const stripServerOwnedFields = (body) => {
    const clean = { ...(body || {}) };
    delete clean.deletedAt;
    delete clean.deletedBy;
    delete clean.deletedUniques;
    delete clean.deletedLinks;
    return clean;
};

// Shared CRUD for the simple catalogue modules. Models carrying the
// soft-delete fields (utils/softDelete) read as if trashed records do
// not exist and their DELETE stamps the record instead of removing
// it — the record waits in Settings → Deleted Items for a restore or
// a permanent delete. Models without the fields (the Setting document
// itself) keep the original hard behaviour, untouched.
const genericController = (Model) => {
    const soft = supportsSoftDelete(Model);
    const liveFilter = soft ? { ...NOT_DELETED } : {};
    const findLiveById = (id) =>
        soft ? Model.findOne({ _id: id, ...NOT_DELETED }) : Model.findById(id);

    return {
        getAll: async (req, res) => {
            try {
                const items = await Model.find(liveFilter);
                // Models with a public `code` backfill it lazily here, so
                // legacy records gain one just by being listed.
                if (typeof Model.withCodes === 'function') await Model.withCodes(items);
                res.json(items);
            } catch (error) { res.status(500).json({ message: error.message }); }
        },
        getById: async (req, res) => {
            try {
                const item = await findLiveById(req.params.id);
                if (!item) return res.status(404).json({ message: 'Not found' });
                if (typeof Model.withCodes === 'function') await Model.withCodes(item);
                res.json(item);
            } catch (error) { res.status(500).json({ message: error.message }); }
        },
        create: async (req, res) => {
            try {
                const item = new Model(stripServerOwnedFields(req.body));
                const saved = await item.save();
                res.status(201).json(saved);
            } catch (error) { res.status(400).json({ message: errorMessage(error, 'record') }); }
        },
        update: async (req, res) => {
            try {
                const body = stripServerOwnedFields(req.body);
                const updated = soft
                    ? await Model.findOneAndUpdate(
                          { _id: req.params.id, ...NOT_DELETED },
                          body,
                          { new: true, runValidators: true }
                      )
                    : await Model.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
                if (!updated) return res.status(404).json({ message: 'Not found' });
                res.json(updated);
            } catch (error) { res.status(400).json({ message: errorMessage(error, 'record') }); }
        },
        remove: async (req, res) => {
            try {
                if (!soft) {
                    const deleted = await Model.findByIdAndDelete(req.params.id);
                    if (!deleted) return res.status(404).json({ message: 'Not found' });
                    return res.json({ message: 'Deleted successfully' });
                }
                const doc = await findLiveById(req.params.id);
                if (!doc) return res.status(404).json({ message: 'Not found' });
                const impactModule = DELETE_IMPACT_MODULES[Model.modelName];
                if (impactModule) {
                    const snapshot = await detachForDelete(impactModule, doc);
                    if (snapshot) doc.set('deletedLinks', snapshot);
                }
                applySoftDelete(Model, doc, req.user?._id);
                await doc.save();
                res.json({ message: 'Deleted successfully' });
            } catch (error) { res.status(500).json({ message: error.message }); }
        }
    };
};

module.exports = genericController;
