#!/usr/bin/env node
/**
 * Generate Zerodha Kite Connect access token (valid until market close).
 * Run: node server/kite-login.js <request_token>
 *
 * 1. Open: https://kite.zerodha.com/connect/login?api_key=YOUR_API_KEY&v=3
 * 2. Login with Zerodha credentials
 * 3. You'll be redirected to a URL like: http://127.0.0.1/?request_token=xxx&action=login&status=success
 * 4. Copy the request_token and run: node server/kite-login.js xxx
 */

import 'dotenv/config';
import { KiteConnect } from 'kiteconnect';

const requestToken = process.argv[2];
if (!requestToken) {
  console.log('Usage: node server/kite-login.js <request_token>');
  console.log('');
  console.log('1. Open:', `https://kite.zerodha.com/connect/login?api_key=${process.env.KITE_API_KEY || 'YOUR_API_KEY'}&v=3`);
  console.log('2. Login, then copy request_token from redirect URL');
  console.log('3. Run: node server/kite-login.js <request_token>');
  process.exit(1);
}

const apiKey = process.env.KITE_API_KEY;
const apiSecret = process.env.KITE_API_SECRET;
if (!apiKey || !apiSecret) {
  console.error('Set KITE_API_KEY and KITE_API_SECRET in .env');
  process.exit(1);
}

const kite = new KiteConnect({ api_key: apiKey });
kite.generateSession(requestToken, apiSecret)
  .then((session) => {
    console.log('');
    console.log('Add to .env:');
    console.log('KITE_ACCESS_TOKEN=' + session.access_token);
    console.log('');
    console.log('Token valid until market close. Regenerate daily.');
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
