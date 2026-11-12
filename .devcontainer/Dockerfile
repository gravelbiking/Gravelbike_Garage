FROM mcr.microsoft.com/devcontainers/php:4-8.4-bookworm
USER root
RUN docker-php-ext-install pdo_mysql \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*
