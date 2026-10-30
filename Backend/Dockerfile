# Backend/Dockerfile
# Builds the FleetDash backend image.  From the project root:  docker compose up -d --build
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install only the production dependencies, with the exact versions from package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The application (tests, load tests and secrets are left out by .dockerignore)
COPY server.js ./
COPY src ./src
COPY scripts ./scripts

# Do not run as root
USER node

EXPOSE 5000

# Docker marks the container "healthy" when the health route answers
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]