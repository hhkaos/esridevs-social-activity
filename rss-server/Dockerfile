# ── Build stage: install only production dependencies ─────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Run as non-root user (node user is built into the official image)
USER node
WORKDIR /app

# Copy only what's needed
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node server.js package.json ./

# Default port — override with -e PORT=xxxx
EXPOSE 3001

# node directly (no shell wrapper) so SIGTERM reaches the process
CMD ["node", "server.js"]
