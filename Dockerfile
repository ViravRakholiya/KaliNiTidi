# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy the full source first so the postinstall step can build the React
# client (app/client), which has its own package.json outside the root.
COPY . .

# Install server deps; the root "postinstall" hook then installs the client's
# dev deps and builds app/client/dist (served by Express in production).
RUN npm install --omit=dev

# Create directory for logs if needed
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "index.js"]
