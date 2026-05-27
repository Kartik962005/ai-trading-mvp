# Bullseye Alerts Setup

## 1. Create Supabase tables

Open Supabase SQL Editor and run:

```sql
-- Copy the full contents of backend/supabase_alerts.sql
```

The backend needs `SUPABASE_SERVICE_ROLE_KEY` so the scheduled checker can read active alerts and write alert events.

## 2. Email provider

Recommended free option: Resend.

```env
RESEND_API_KEY=re_xxxxxxxxx
ALERT_FROM_EMAIL=Bullseye <alerts@yourdomain.com>
```

Alternative SMTP:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
ALERT_FROM_EMAIL=your-email@gmail.com
```

## 3. WhatsApp provider

For free testing, use Twilio WhatsApp Sandbox. Each test user must join your sandbox from WhatsApp first.

```env
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

For production, use Meta WhatsApp Cloud API. Business-initiated alert messages usually need an approved template.

```env
WHATSAPP_PROVIDER=meta
META_WHATSAPP_TOKEN=xxxxxxxxx
META_WHATSAPP_PHONE_NUMBER_ID=123456789
META_WHATSAPP_TEMPLATE_NAME=stock_alert
META_WHATSAPP_TEMPLATE_LANGUAGE=en_US
```

## 4. Alert checker

The FastAPI backend checks active alerts automatically.

```env
ALERT_CHECKER_ENABLED=true
ALERT_CHECK_INTERVAL_SECONDS=900
ALERT_CHECK_BATCH_SIZE=100
ALERT_COOLDOWN_SECONDS=21600
ALERT_ADMIN_KEY=choose-a-secret-key
```

You can also trigger checks manually:

```bash
curl -X POST http://localhost:8000/api/v1/alerts/check-now -H "x-alert-admin-key: choose-a-secret-key"
```

## Supported first-version prompts

- Alert me when RSI crosses above 70
- Alert me when RSI goes below 30
- Alert me when price crosses above 2500
- Alert me when close is above SMA 50
- Alert me when volume is above previous 5 day average
- Alert me when volume is 2x previous 20 days
