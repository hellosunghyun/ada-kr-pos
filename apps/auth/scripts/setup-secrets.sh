#!/bin/bash

# Setup secrets for ADA Auth Server on Cloudflare Pages
# Run this script to configure all required secrets in your Cloudflare Pages environment

set -e

echo "Setting up secrets for ada-kr-pos..."

wrangler secret put APPLE_CLIENT_ID
wrangler secret put APPLE_TEAM_ID
wrangler secret put APPLE_KEY_ID
wrangler secret put APPLE_PRIVATE_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put AUTH_SECRET

echo "✓ All secrets configured successfully!"
