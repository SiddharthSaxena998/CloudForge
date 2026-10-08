// Diagnostic script: run server startup steps individually with flushed output
const fs = require('fs');
const origLog = console.log;
const origErr = console.error;
function flushLog(...args) {
  process.stdout.write(args.join(' ') + '\n');
}
console.log = flushLog;
console.error = flushLog;

console.log('STEP 1: requiring express');
const express = require('express');
console.log('STEP 2: requiring mongoose');
const mongoose = require('mongoose');
console.log('STEP 3: requiring dotenv');
require('dotenv').config();
console.log('STEP 4: MONGO_URI present =', !!process.env.MONGO_URI);

console.log('STEP 5: connecting mongoose');
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 8000,
}).then(() => {
  console.log('STEP 6: MONGOOSE CONNECTED');
  const http = require('http');
  const app = express();
  const server = http.createServer(app);
  server.listen(5000, () => {
    console.log('STEP 7: SERVER LISTENING ON 5000');
    process.exit(0);
  });
}).catch(e => {
  console.log('MONGOOSE CONNECT FAILED:', e.message);
  process.exit(1);
});