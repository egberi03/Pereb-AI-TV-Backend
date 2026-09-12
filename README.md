# PerebAI TV — AI Video Upload & Monetization MVP

## 1. Backend
```bash
cd backend
npm install
npm start
```

The API runs on:
`http://localhost:3000`

Health check:
`GET /api/health`

Upload:
`POST /api/videos/upload`

View:
`POST /api/videos/:id/view`

Dashboard:
`GET /api/dashboard`

## 2. Frontend
Open `frontend/index.html` in a browser while the backend is running.

If frontend and backend are deployed separately, change:
```js
const API = "http://localhost:3000/api";
```
to your deployed backend URL, for example:
```js
const API = "https://your-perebai-backend.onrender.com/api";
```

## 3. MVP monetization
Default rate is ₦0.50 per qualified view.

This MVP is intentionally simple. Before real payouts, add:
- authentication/JWT
- creator-specific dashboards
- database such as PostgreSQL/MongoDB
- cloud video storage
- view-fraud/bot detection
- watch-time qualification
- admin moderation
- payout verification
- Paystack/Flutterwave integration
- rate limiting and security headers
