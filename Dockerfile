FROM node:alpine
WORKDIR /usr/src/terminal-backend
COPY package.json .
COPY package-lock.json .
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
