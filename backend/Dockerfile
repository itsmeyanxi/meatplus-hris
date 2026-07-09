# Laravel API for Render. Render has no native PHP runtime, so we ship a container.
FROM php:8.3-cli

# pdo_pgsql -> Supabase Postgres.  zip -> required by openspout (employee import).
RUN apt-get update && apt-get install -y --no-install-recommends \
        git unzip libpq-dev libzip-dev \
    && docker-php-ext-install pdo_pgsql zip \
    && rm -rf /var/lib/apt/lists/*

# OPcache: compiles PHP once and serves bytecode from memory.
RUN docker-php-ext-install opcache \
    && { \
        echo 'opcache.enable=1'; \
        echo 'opcache.validate_timestamps=0'; \
        echo 'opcache.memory_consumption=128'; \
        echo 'opcache.max_accelerated_files=10000'; \
    } > /usr/local/etc/php/conf.d/opcache.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY . .

RUN composer install --no-dev --optimize-autoloader --no-interaction

# Render injects $PORT at runtime. config:cache must run here, not at build time,
# because the environment variables only exist once the service starts.
CMD php artisan config:cache \
    && php artisan route:cache \
    && php -S 0.0.0.0:${PORT:-10000} -t public
