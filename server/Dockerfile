FROM node:22-slim

# Install Python for yt-dlp, FFmpeg, and download the yt-dlp executable.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && curl --fail --location --silent --show-error https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY --chown=node:node . .

RUN mkdir -p /tmp/secret-agent && chown node:node /tmp/secret-agent

ENV PORT=5001
ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV TEMP_DIR=/tmp/secret-agent

EXPOSE 5001

USER node

CMD ["npm", "start"]
