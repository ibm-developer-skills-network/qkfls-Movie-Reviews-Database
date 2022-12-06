FROM node:18.12.1-bullseye-slim

RUN npm install -g npm@9.1.3

ADD views /app/views
ADD package.json /app
ADD server.js /app
ADD .env* /app
ADD utils/strings.json /app/utils/

RUN cd /app; npm install; npm audit fix --force

ENV NODE_ENV production
ENV PORT 8080
EXPOSE 8080

WORKDIR "/app"
CMD [ "npm", "start" ]
