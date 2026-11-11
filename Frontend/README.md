# README.md

# FleetDash Frontend

React + TypeScript dashboard with a Canvas fleet map and Socket.IO live updates.

## Connect to the backend

Copy `.env.example` to `.env.local` and set:

- `VITE_API_URL` to the backend API base URL, for example `http://localhost:5000/api`
- `VITE_SOCKET_URL` to the backend Socket.IO origin, for example `http://localhost:5000`

Start the backend and its MongoDB/Redis dependencies first, then run `npm install` and `npm run dev`.
The dashboard loads vehicles, active geofences, and alerts from the REST API and consumes
`vehicles:binary` and `geofence:alert` Socket.IO events for live updates.

Expand **Fleet tools** at the bottom of the dashboard to manage vehicles and geofences, reset or
generate sample data, and control the simulator. Set `ADMIN_API_KEY` in the backend environment,
then enter that key in the dashboard to unlock protected controls. The key is kept only in the
current browser tab; do not put it in a `VITE_` frontend environment variable.
