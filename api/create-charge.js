/**
 * Coinbase Commerce Charge Creator
 * Requires: COINBASE_COMMERCE_API_KEY env variable
 * 
 * For static site hosting (GitHub Pages), this needs to run
 * as a Cloudflare Worker or standalone Express endpoint.
 * 
 * Usage: POST /api/create-charge
 * Body: { amount, currency, name, email, memo }
 * Returns: { hosted_url } — redirect user to this URL
 */

const COINBASE_API = 'https://api.commerce.coinbase.com';

async function createCharge({ amount, currency, name, email, memo }) {
    const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
    if (!apiKey) throw new Error('COINBASE_COMMERCE_API_KEY not configured');

    const response = await fetch(`${COINBASE_API}/charges`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CC-Api-Key': apiKey,
            'X-CC-Version': '2018-03-22'
        },
        body: JSON.stringify({
            name: `AIssisted Consulting — ${memo || 'Payment'}`,
            description: `Payment from ${name} (${email})${memo ? ': ' + memo : ''}`,
            pricing_type: 'fixed_price',
            local_price: {
                amount: amount.toString(),
                currency: currency || 'USD'
            },
            metadata: {
                customer_name: name,
                customer_email: email,
                memo: memo || ''
            },
            redirect_url: 'https://aissistedconsulting.com/pay-success.html',
            cancel_url: 'https://aissistedconsulting.com/pay.html'
        })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || 'Coinbase Commerce API error');
    }

    return {
        hosted_url: data.data.hosted_url,
        charge_id: data.data.id,
        expires_at: data.data.expires_at
    };
}

// Express handler (if running as standalone)
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { amount, currency, name, email, memo } = req.body;
        if (!amount || !name || !email) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await createCharge({ amount, currency, name, email, memo });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Also export for Cloudflare Workers
module.exports.createCharge = createCharge;
