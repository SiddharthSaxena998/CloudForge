const ownershipCheck = async (req, res, next) => {
  const { id } = req.params;

  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ message: 'Invalid project ID format' });
  }

  const Model = require('../models/Project');
  const project = await Model.findById(id);

  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }

  if (project.owner.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Access denied: not your project' });
  }

  req.project = project;
  next();
};

module.exports = ownershipCheck;