const https = require('https');

const options = {
  hostname: 'gowmmmjlfijsydxvftaj.supabase.co',
  port: 443,
  path: '/functions/v1/create-checkout-session',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data}`);
  });
});

req.on('error', error => console.error(error));

req.write(JSON.stringify({
  priceId: 'price_1U8RlSBjCb453CpTSlVJMaEg',
  userId: 'test-user-id',
  credits: 10,
  successUrl: 'https://test.com',
  cancelUrl: 'https://test.com'
}));
req.end();
