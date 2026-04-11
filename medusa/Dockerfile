FROM node:20-alpine

WORKDIR /server

COPY package.json package-lock.json ./

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 9000 5173

ENTRYPOINT ["./start.sh"]
