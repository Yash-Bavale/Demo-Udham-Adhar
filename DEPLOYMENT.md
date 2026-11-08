# Deployment Guide - Udyamadhar Backend

## Quick Start Deployment Checklist

### 1. Required Environment Variables for Production

```bash
# Supabase
SUPABASE_URL=https://mrcmgfkyqyslvbsfkgtw.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=[ASK SUPABASE]  # ✅ MUST ADD

# Zoho Mail (For email system)
ZOHO_MAIL_REFRESH_TOKEN=[GET FROM ZOHO]  # ✅ MUST ADD
ZOHO_MAIL_CLIENT_ID=[GET FROM ZOHO]      # ✅ MUST ADD
ZOHO_MAIL_CLIENT_SECRET=[GET FROM ZOHO]  # ✅ MUST ADD
ZOHO_MAIL_DC=in                          # India datacenter
ZOHO_FROM_EMAIL=help@businesshelpservices.com
ZOHO_MAIL_ACCOUNT_ID=[OPTIONAL]

# Zoho Mail SMTP (For backup)
SMTP_HOST=smtp.zoho.in                   # ✅ OPTIONAL but recommended
SMTP_PORT=465
SMTP_USER=help@businesshelpservices.com
SMTP_PASS=[GET FROM ZOHO]

# PayU Webhooks (If using PayU)
PAYU_MERCHANT_KEY=[GET FROM PAYU]        # ✅ IF USING PayU
PAYU_MERCHANT_SALT=[GET FROM PAYU]
PAYU_PHONE_2_KEY=[GET FROM PAYU]

# Cron/Scheduler
CRON_SECRET=[GENERATE RANDOM]            # For cron endpoints

# Optional: Lovable/Debugging
LOVABLE_ENABLE_ERROR_REPORTING=true
```

### 2. Get Missing Values

#### A. Supabase Service Role Key
```bash
# In Supabase Dashboard:
1. Go to: Settings → API
2. Copy: "service_role" key (not anon key)
3. Save as: SUPABASE_SERVICE_ROLE_KEY
```

#### B. Zoho Mail Credentials
```bash
# Steps:
1. Go to https://mail.zoho.in/cpanel
2. Navigate to: Settings → Connected Apps → OAuth
3. Find/Create OAuth app for help@businesshelpservices.com
4. Copy: Client ID, Client Secret, Refresh Token
5. Datacenter: in (India)
```

#### C. PayU (if using)
```bash
# In PayU Dashboard:
1. Go to: Integration → API Keys
2. Copy: Merchant Key, Salt, Phone2 Key
```

### 3. Deploy Steps

#### Option A: Via Lovable (Recommended)
```bash
# Push changes (already done ✅)
git push origin main

# In Lovable Dashboard:
1. Go to your project
2. Settings → Deployment
3. Add all environment variables above
4. Click "Deploy"
```

#### Option B: Via Command Line
```bash
# Build
npm run build

# This generates files in:
# - dist/ (static files)
# - .output/ (server bundle)

# Test locally
npm run preview

# Deploy to your platform
# (Vercel / Cloudflare / custom server)
```

#### Option C: Docker (Self-hosted)
```bash
# Create Dockerfile in root (see below)
docker build -t udyamadhar .
docker run -e SUPABASE_URL=... -p 3000:3000 udyamadhar
```

### 4. Verify Deployment

After deploying, test these endpoints:

```bash
# Test email system (requires auth)
POST /api/emails/test
Body: { "toEmail": "your@email.com" }

# Manual inbox poll (requires auth)
POST /admin.inbox-management
Body: null  # Uses server function

# Public cron (requires CRON_SECRET header)
POST /api/public/cron/poll-zoho-inbox
Header: apikey: [CRON_SECRET]
```

### 5. Post-Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied (auto in Supabase)
- [ ] Email system tested (use diagnostic script)
- [ ] Admin panel accessible at `/admin`
- [ ] Inbox management at `/admin/inbox-management`
- [ ] Support tickets system working
- [ ] Email polling running every 2 minutes

### 6. Troubleshooting

#### "Module not found" errors
```bash
npm install
npm run build
```

#### Email not sending
```bash
# Run diagnostic
npx tsx src/lib/mail/diagnostic.ts

# Check logs
- SUPABASE_SERVICE_ROLE_KEY is set
- Zoho credentials are valid
- Email templates exist in database
```

#### Build fails
```bash
# Clear cache and rebuild
rm -rf dist/ .output/ node_modules/
npm install
npm run build
```

### 7. Database Migrations

All migrations are in `supabase/migrations/`. They auto-apply when you connect Supabase.

Key tables for new features:
- `email_logs` - Email tracking
- `support_tickets` - Support system
- `ticket_replies` - Ticket conversations
- `inbound_email_quarantine` - Unmatched emails
- `smtp_settings` - Email configuration

### 8. Monitoring & Logs

Monitor in production:
```bash
# Supabase Dashboard → Logs
# Check for:
- Email queue errors
- SMTP failures  
- API errors

# Lovable Dashboard → Deployments → Logs
# (if deploying via Lovable)
```

### 9. Backup & Recovery

```bash
# Backup Supabase
supabase db pull  # Download schema
supabase db dump --file backup.sql

# Restore if needed
supabase db push
```

---

## Production Deployment Commands

```bash
# 1. Build production bundle
npm run build

# 2. Test locally
npm run preview

# 3. Push to git (already done ✅)
git push origin main

# 4. Deploy via Lovable OR your platform
# (See "Deploy Steps" above)
```

## Support & Emergency Contacts

- **Email System**: help@businesshelpservices.com
- **Support Tickets**: Managed via `/admin/tickets`
- **Diagnostics**: `npx tsx src/lib/mail/diagnostic.ts`
