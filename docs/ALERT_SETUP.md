# Bullseye Alerts Setup

## 1. Create Supabase tables

Open Supabase SQL Editor and run:

```sql
-- Copy the full contents of database/supabase_alerts.sql
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

## 3. Daily email watchlist

The backend can email a daily next-trading-day watchlist at 6 PM IST and a same-day result review at 4 PM IST.

```env
DAILY_UPDATES_ENABLED=true
DAILY_STOCK_UNIVERSE_LIMIT=80
DAILY_MIN_AVG_TURNOVER=150000000
DAILY_MIN_CONFIDENCE=62
```

Signed-in users can turn daily emails on or off in the app. For a fixed admin/test recipient list, use:

```env
DAILY_REPORT_EMAILS=you@example.com,team@example.com
```

Run `database/daily_trade_updates.sql` in Supabase before enabling user subscriptions.

## 4. Alert checker and scheduled reports

The FastAPI backend checks active alerts automatically. It also runs daily trade reports when `DAILY_UPDATES_ENABLED=true`.

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
curl -X POST http://localhost:8000/api/v1/daily-updates/run-review -H "x-alert-admin-key: choose-a-secret-key"
curl -X POST http://localhost:8000/api/v1/daily-updates/run-forecast -H "x-alert-admin-key: choose-a-secret-key"
```

## Supported first-version prompts

- Alert me when RSI crosses above 70
- Alert me when RSI goes below 30
- Alert me when price crosses above 2500
- Alert me when close is above SMA 50
- Alert me when volume is above previous 5 day average
- Alert me when volume is 2x previous 20 days
