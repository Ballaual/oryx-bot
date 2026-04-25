FROM node:20

# Arbeitsverzeichnis
WORKDIR /app

# Package Files zuerst (Docker Cache nutzen)
COPY package*.json ./

# Dependencies installieren
RUN npm install

# Nur das Nötigste installieren (kein yt-dlp!)
RUN apt-get update && apt-get install -y \
    ffmpeg \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# App kopieren
COPY . .

# Datenordner erstellen (für SQLite etc.)
RUN mkdir -p /app/data

# Env Default
ENV DATABASE_PATH=/app/data/database.sqlite

# Start
CMD ["node", "src/index.js"]