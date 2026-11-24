const {
    NOT_DELETED,
    supportsSoftDelete,
    applySoftDelete,
} = require('../utils/softDelete');
const { duplicateKeyMessage } = require('../utils/duplicateKey');
const Product = require('../models/Product');
const Category = require('../models/Category');

// Delete guards: a record that LIVE records still point at cannot be
// trashed — the references would dangle (products would keep naming a
// trashed category/brand on their rows, a subcategory a trashed
// parent, and the category's sales would silently drop out of the
// dashboard's Top Categories while its revenue still counted). Each
// guard returns a refusal message, or null when the delete may
// proceed. Trashed referrers never block: they are already in
// Deleted Items themselves.
const deleteRefusal = async (Model, doc) => {
    if (Model.modelName === 'Category') {
        const [products, subcategories] = await Promise.all([
            Product.countDocuments({ category: doc._id, ...NOT_DELETED }),
            Category.countDocuments({ parent: doc._id, ...NOT_DELETED }),
        ]);
        const parts = [];
        if (products) parts.push(`${products} product${products === 1 ? '' : 's'}`);
        if (subcategories) parts.push(`${subcategories} subcategor${subcategories === 1 ? 'y' : 'ies'}`);
        if (!parts.length) return null;
        const tail = parts.length === 2
            ? 'Move or delete those first, then delete the category.'
            : `Move or delete those ${products ? 'products' : 'subcategories'} first, then delete the category.`;
        return `This category still has ${parts.join(' and ')}. ${tail}`;
    }
    if (Model.modelName === 'Brand') {
        const products = await Product.countDocuments({ brand: doc._id, ...NOT_DELETED });
        if (!products) return null;
        return `This brand still has ${products} product${products === 1 ? '' : 's'}. Move or delete those products first, then delete the brand.`;
    }
    return null;
};

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
                const refusal = await deleteRefusal(Model, doc);
                if (refusal) return res.status(400).json({ message: refusal });
                applySoftDelete(Model, doc, req.user?._id);
                await doc.save();
                res.json({ message: 'Deleted successfully' });
            } catch (error) { res.status(500).json({ message: error.message }); }
        }
    };
};

module.exports = genericController;
