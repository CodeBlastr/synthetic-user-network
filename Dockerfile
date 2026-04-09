FROM mcr.microsoft.com/playwright:v1.53.1-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 3020

CMD ["npm", "run", "mvp"]
