# Cloud Run-ready image for Kisan Mitra
FROM node:20-alpine

WORKDIR /app

# Install prod deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest of the app
COPY . .

# Cloud Run injects PORT (usually 8080). The app already honors process.env.PORT.
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
