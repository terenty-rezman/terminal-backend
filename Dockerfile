FROM node
WORKDIR /usr/src/terminal-backend
COPY package.json .
COPY package-lock.json .
RUN npm i
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
