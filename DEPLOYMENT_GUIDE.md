# Deployment & Networking Guide — Production Database Hardening

This guide explains how the Intraday Trading Display Dashboard handles MongoDB connection resilience, authentication, and secure docker networking across environments.

---

## 1. Environment Modes

The system operates in two environments determined by the `NODE_ENV` environment variable:

### Development Mode (`NODE_ENV=development`)
- **Authentication**: Non-blocking. If `MONGO_USERNAME` or `MONGO_PASSWORD` are missing, the backend logs a clear warning message and falls back to connecting anonymously.
- **Port Exposure**: Enabled. Docker Compose merges the base `docker-compose.yml` with `docker-compose.override.yml` to automatically expose port `27017:27017` to `localhost`.
- **Developer Tools**: Developers can connect to `mongodb://localhost:27017/stock_dashboard` using MongoDB Compass, Robomongo, or other local IDE tools.

### Production Mode (`NODE_ENV=production`)
- **Authentication**: Strictly enforced. If `MONGO_USERNAME` or `MONGO_PASSWORD` are missing from environment variables, the backend will print validation warnings and terminate startup instantly with an exit code of `1` (producing no messy stack traces).
- **Port Exposure**: Blocked. The public ports field is completely absent from the base configurations. External traffic cannot access port `27017` on the host machine.
- **Internal Networking**: Backend services communicate with the MongoDB container entirely through the private internal Docker bridge network (`mongodb:27017`).

---

## 2. Environment Variables Configuration

The following variables must be configured in your environment or `.env` files:

| Environment Variable | Description | Example (Development) | Example (Production) |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Environment identifier | `development` | `production` |
| `MONGODB_URI` | MongoDB connection URI string | `mongodb://localhost:27017/stock_dashboard` | `mongodb://mongodb:27017/stock_dashboard` |
| `MONGO_USERNAME` | MongoDB Root username | (Empty / Optional) | `admin` |
| `MONGO_PASSWORD` | MongoDB Root password | (Empty / Optional) | `SecureProdPassword2026` |

---

## 3. How to Deploy Safely

### Running in Development
Simply run:
```bash
docker-compose up
```
This automatically merges `docker-compose.yml` and `docker-compose.override.yml`, exposing port `27017` to localhost.

### Running in Production
Deploy using ONLY the base production compose configurations by running:
```bash
docker-compose -f docker-compose.yml up --build -d
```
This avoids loading the override settings and ensures MongoDB remains strictly private and authenticated on the internal network.
