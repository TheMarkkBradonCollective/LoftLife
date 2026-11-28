FROM node:24-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs ./
ENV NODE_ENV=production
ENV PORT=8788
EXPOSE 8788
CMD ["npm","start"]
