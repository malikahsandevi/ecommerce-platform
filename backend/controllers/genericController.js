const {
    NOT_DELETED,
    supportsSoftDelete,
    applySoftDelete,
} = require('../utils/softDelete');

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
                const item = new Model(req.body);
                const saved = await item.save();
                res.status(201).json(saved);
            } catch (error) { res.status(400).json({ message: error.message }); }
        },
        update: async (req, res) => {
            try {
                const updated = soft
                    ? await Model.findOneAndUpdate(
                          { _id: req.params.id, ...NOT_DELETED },
                          req.body,
                          { new: true, runValidators: true }
                      )
                    : await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
                if (!updated) return res.status(404).json({ message: 'Not found' });
                res.json(updated);
            } catch (error) { res.status(400).json({ message: error.message }); }
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
                applySoftDelete(Model, doc, req.user?._id);
                await doc.save();
                res.json({ message: 'Deleted successfully' });
            } catch (error) { res.status(500).json({ message: error.message }); }
        }
    };
};

module.exports = genericController;
