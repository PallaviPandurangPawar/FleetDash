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
