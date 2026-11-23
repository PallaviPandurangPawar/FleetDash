# FleetDash - Frontend

React + TypeScript dashboard: a live Google map in a cyber style, a vehicle list, geofence alerts and admin tools.

## Quick start

```bash
cd Frontend
npm install
copy .env.example .env      # Mac and Linux: cp .env.example .env
npm run dev                 # http://localhost:5173
npm run build               # type check (tsc) and production build
```

The backend must be running (see the root README). Fill in the `.env` file:

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | REST API, for example `http://localhost:5000/api` |
| `VITE_SOCKET_URL` | Socket.io server, for example `http://localhost:5000` |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps key for the map (see below) |

Vite reads `.env` only at startup: restart `npm run dev` after changing it. The `.env` file is git-ignored.

## Google Maps key

1. In the Google Cloud console, create a project, link a billing account and enable the **Maps JavaScript API**.
2. Create an API key. Restrict it to **Websites** (`http://localhost:5173/*` while developing, your real address later)
   and to the **Maps JavaScript API** only. The key is visible to anyone who inspects the page, so these restrictions are
   what protect it.
3. Set a budget alert (and optionally a daily quota) in the console. The map is billed per map load after a monthly free
   allowance; check Google's current pricing.

Without a key, or when Google rejects it, the map shows a message that says why.

## What the dashboard does

- **Live map**: vehicles (arrows for live ones) and geofences on the Google map. Starts on the whole world; **Fit** zooms to
  the fleet. Drag, wheel and the zoom buttons work.
- **Vehicle list**: search, status filter, live speed and fuel.
- **Alerts**: the header button shows the number of unacknowledged geofence alerts. The panel lists them (New and All) with
  acknowledge buttons; pop-ups appear when a vehicle crosses a zone edge.
- **Admin mode**: **Unlock admin** asks for the admin key (the server's `ADMIN_API_KEY`), checks it, and keeps it for this
  browser tab only. It unlocks:
  - **+ Add vehicle**, **Edit** and **Delete** on each vehicle (delete can also remove its history)
  - **Fleet tools**: start, restart and stop the vehicle simulator, set the number of sample vehicles, reset the sample data
  - **Geofences**: list, switch on or off, delete, and draw a new one by clicking its corners on the map

## Code layout

| Folder | Content |
|---|---|
| `src/pages` | `DashboardPage`: loads the data and connects everything |
| `src/components` | `layout`, `map`, `vehicles`, `alerts` and `admin` (forms and panels) |
| `src/canvas` | Drawing on the map canvas (`renderer`, `geofenceLayer`), the map style and small geometry helpers |
| `src/hooks` | `useSocket`, `useVehicleStream`, `useAlerts`, `useAdminKey` |
| `src/services` | `api.ts` (REST calls), `socketClient.ts`, `googleMaps.ts` (script loader), `adminAuth.ts` (admin key) |
| `src/types` | Types shared by the components |