FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000
# Applies pending migrations, seeds an empty catalog, then serves the API.
CMD ["npm", "run", "start:prod"]
