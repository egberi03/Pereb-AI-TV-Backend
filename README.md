# PerebAI TV Backend — fixed

## What was wrong

1. `POST /api/auth/login` returned **404** because the deployed `server.js` had no `/api/auth/login` route.
2. The root URL `/` returned `Cannot GET /`; that was not proof the server was offline, only that no root route existed.
3. The frontend can report “Backend not connected” when its fetch request fails. The backend now exposes `/api/health` and `/` as explicit JSON endpoints.
4. Video URLs are returned as absolute URLs so a GitHub Pages frontend can play videos served by Render.
5. Unknown routes now return JSON instead of an HTML error page, preventing `Unexpected token '<' ... is not valid JSON` when the frontend blindly calls `response.json()`.

## Deploy on Render

Build command:
```bash
npm install
```

Start command:
```bash
npm start
```

The service must use the Render-assigned `PORT`; this backend already does that.

## Required frontend API base

Because the frontend is on GitHub Pages and the backend is on Render, frontend API calls must point to:

```text
https://viewing-center-backend-1.onrender.com
```

Do NOT use `http://localhost:3000` in the deployed GitHub Pages site.

Example:
```js
const API_BASE = "https://viewing-center-backend-1.onrender.com";
fetch(`${API_BASE}/api/health`);
```

## Test commands

Health:
```bash
curl -i https://viewing-center-backend-1.onrender.com/api/health
```

Root:
```bash
curl -i https://viewing-center-backend-1.onrender.com/
```

Register:
```bash
curl -i -X POST "https://viewing-center-backend-1.onrender.com/api/auth/register"   -H "Content-Type: application/json"   -d '{"email":"test@example.com","password":"TestPassword123","name":"Test Creator"}'
```

Login:
```bash
curl -i -X POST "https://viewing-center-backend-1.onrender.com/api/auth/login"   -H "Content-Type: application/json"   -d '{"email":"test@example.com","password":"TestPassword123"}'
```

Videos:
```bash
curl -i https://viewing-center-backend-1.onrender.com/api/videos
```

## Important production note

Render Free service storage is not durable for a real video platform. `data.json` and `/uploads` can be lost on redeploy/restart. For production, move video files to object storage (Cloudinary, S3-compatible storage, etc.) and use PostgreSQL for users/videos/views/earnings.
