// config.js
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Determine the URL based on the environment variable
const getUrl = () => {
  if (process.env.USE_CUSTOM_URL) {
    return 'https://confused-mite-bandanna.app';
  }
  return `http://localhost:3000/`;
};

// Export the URL
const URL = getUrl();
module.exports = { URL };
