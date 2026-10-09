const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('<h1>It works! Deployed via Mini Cloud Deployment Platform</h1><p>This is a test app to confirm the deploy pipeline works end-to-end.</p>');
});

app.listen(PORT, () => {
  console.log(`Sample test app running on port ${PORT}`);
});
