FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run prisma:generate

EXPOSE 3000

CMD ["sh", "-c", "npm run prisma:migrate && npm run prisma:seed && npm run build && npm run start -- -H 0.0.0.0 -p 3000"]
