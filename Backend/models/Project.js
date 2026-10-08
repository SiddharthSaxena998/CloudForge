// const mongoose = require('mongoose');

// const envVarSchema = new mongoose.Schema({
//   key: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   value: {
//     type: String,
//     default: ''
//   }
// });

// const projectSchema = new mongoose.Schema({
//   owner: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   name: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   description: {
//     type: String,
//     default: ''
//   },
//   sourceType: {
//     type: String,
//     enum: ['upload', 'github'],
//     required: true
//   },
//   repoUrl: {
//     type: String,
//     default: ''
//   },
//   branch: {
//     type: String,
//     default: ''
//   },
//   sourcePath: {
//     type: String,
//     default: ''
//   },
//   framework: {
//     type: String,
//     default: ''
//   },
//   envVars: [envVarSchema],
//   status: {
//     type: String,
//     enum: ['active', 'building', 'failed', 'stopped'],
//     default: 'active'
//   }
// }, {
//   timestamps: true
// });

// module.exports = mongoose.model('Project', projectSchema);


const mongoose = require('mongoose');

const envVarSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, default: '' },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // globally unique: domain isi se bante hain aur folder bhi isi naam ka hai
    name: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, default: '' },
    sourceType: { type: String, enum: ['archive', 'github'], required: true },
    repoUrl: { type: String, default: '' },
    archiveName: { type: String, default: '' },
    branch: { type: String, default: '' },
    sourcePath: { type: String, default: '' },
    framework: { type: String, default: '' },
    region: { type: String, default: 'ap-south-1' },
    envVars: { type: [envVarSchema], default: [] },
    status: {
      type: String,
      enum: ['running', 'building', 'failed', 'stopped'],
      default: 'stopped',
    },
    lastDeployedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

projectSchema.virtual('domain').get(function () {
  return `${this.name}.cloudforge.app`; // apna base domain yahan daal lena
});

projectSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = String(ret._id);
    ret.repo = ret.repoUrl;
    delete ret._id;
    delete ret.repoUrl;
    delete ret.sourcePath; // server ka internal path
    delete ret.envVars;    // secrets, sirf /env endpoint se milenge
    delete ret.owner;
    return ret;
  },
});

module.exports = mongoose.model('Project', projectSchema);