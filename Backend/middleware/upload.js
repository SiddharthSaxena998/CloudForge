const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage config - keep original filename with timestamp to avoid conflicts
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    // keep the real archive suffix so utils/archive.js can pick unzip vs tar
    const ext = name.endsWith('.zip') ? '.zip' : name.endsWith('.tgz') ? '.tgz' : '.gz';
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});

// File filter - allow zip and tar.gz
const ALLOWED_SUFFIXES = ['.zip', '.tar.gz', '.tgz'];
const fileFilter = (req, file, cb) => {
  // Note: path.extname('a.tar.gz') is only '.gz', so match on the full suffix.
  const name = file.originalname.toLowerCase();
  if (ALLOWED_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
    cb(null, true);
  } else {
    cb(new Error('Only .zip, .tar.gz archives are allowed'), false);
  }
};

const maxBytes = (Number(process.env.MAX_UPLOAD_MB) || 100) * 1024 * 1024;
const upload = multer({ storage, fileFilter, limits: { fileSize: maxBytes, files: 1 } });

module.exports = upload;