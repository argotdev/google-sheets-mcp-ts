FROM node:18-alpine

  WORKDIR /app

  # Copy package files
  COPY package*.json ./

  # Install dependencies
  RUN npm ci --only=production

  # Copy source code
  COPY src/ ./src/
  COPY tsconfig.json ./

  # Install dev dependencies needed for build
  RUN npm install --only=development

  # Build the application
  RUN npm run build

  # Remove dev dependencies to reduce image size
  RUN npm prune --production

  # The built JavaScript files are in ./build/
  CMD ["node", "build/index.js"]