FROM node:18-bullseye

WORKDIR /config

COPY ./package.json ./yarn.lock ./
COPY ./prisma ./prisma

RUN yarn install --immutable

COPY . ./
RUN yarn build

ENTRYPOINT [ "yarn", "run", "start:migrate:prod" ]
