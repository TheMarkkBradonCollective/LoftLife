FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY index.mjs ./
ENV NODE_ENV=production
EXPOSE 8788
CMD ["npm","start"]
