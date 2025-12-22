# Build Stage (Tetap sama)
FROM node:20-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage [SECURITY FIX]
# Menggunakan image Nginx Unprivileged (Jalan di user nginx, port 8080)
FROM nginxinc/nginx-unprivileged:alpine

# Copy hasil build React
COPY --from=build /usr/src/app/build /usr/share/nginx/html

# Copy konfigurasi custom
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Expose port 8080 (Bukan 80)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
