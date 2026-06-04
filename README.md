# Bullseye Daily Signal Emails

This repo now includes a logged-in daily stock email system:

- account-level notification settings
- automatic top-10 ranked stock emails
- user-selected delivery time after market close
- consent capture and unsubscribe flow
- stored model runs, signals, outcomes, email logs, and audit logs

## Setup

1. Run the SQL migration in Supabase:

```sql
-- database/daily_signal_notifications.sql
```

2. Copy `.env.example` into your local frontend/backend env files.

3. Start the backend:

```bash
cd backend
uvicorn main:app --reload
```

4. Start the frontend:

```bash
cd frontend
npm run dev
```

## How to use

1. Sign in.
2. Open the account icon.
3. Open `Notification Settings`.
4. Turn on `Daily 10 Stock Signals Email`.
5. Pick market, risk level, signal type, and preferred email time.
6. Accept the consent notice.

The setting is shown only for logged-in users and the email runs automatically on trading days once enabled.

## How to test

### UI

1. Sign in on the homepage.
2. Open `Notification Settings`.
3. Save a time after market close, such as `18:00`.
4. Toggle the daily email on and accept consent.

### Backend endpoints

Use your Supabase bearer token for user endpoints.

```bash
curl http://127.0.0.1:8000/api/v1/signals/today

curl -X GET http://127.0.0.1:8000/api/v1/notification-preferences \
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN"

curl -X POST http://127.0.0.1:8000/api/v1/admin/run-daily-stock-prediction \
  -H "Content-Type: application/json" \
  -H "x-alert-admin-key: choose-a-secret-key" \
  -d "{\"market\":\"NSE\",\"risk_level\":\"Balanced\",\"signal_type\":\"Next-day swing\",\"send_email\":true,\"force\":true}"
```

To inspect status:

```bash
curl http://127.0.0.1:8000/api/v1/admin/daily-stock-prediction/status \
  -H "x-alert-admin-key: choose-a-secret-key"
```

### Scheduler

When `DAILY_UPDATES_ENABLED=true`, the backend loop checks every minute:

- whether any opted-in users are due for an email
- whether the day’s next-day signals already exist
- whether prior signals need next-day outcome tracking

For quick local testing, use the admin run endpoint with `force=true`.

For production, `.github/workflows/daily-alert-emails.yml` also calls the backend
every 15 minutes after market close. Add these GitHub secrets:

- `BACKEND_URL`: your deployed backend base URL
- `ALERT_ADMIN_KEY`: same value configured on the backend

That workflow calls `/api/v1/daily-updates/run-scheduled`, which respects each
user's selected `email_time` and skips duplicate sends for the same target date.

## Notes

- The current engine is modular and ready for a real market data or ML provider later.
- Groq or Gemini is not required for this first version because ranking and explanations are generated locally.
- Outcome tracking uses daily OHLC data today; intraday sequencing can be improved later with lower-timeframe data.
