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
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

// File filter - allow zip and tar.gz
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.zip', '.tar.gz', '.tgz'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .zip, .tar.gz archives are allowed'), false);
  }
};

const upload = multer({ storage, fileFilter });

module.exports = upload;