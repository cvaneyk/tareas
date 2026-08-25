# Dockerfile para Coolify (PHP + Apache con extensiones PDO MySQL y PostgreSQL)
FROM php:8.2-apache

# Instalar extensiones necesarias para MySQL y PostgreSQL
RUN apt-get update && apt-get install -y \
    libpq-dev \
    libsqlite3-dev \
    && docker-php-ext-install pdo pdo_mysql pdo_pgsql pdo_sqlite \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de la aplicación al directorio web de Apache
COPY . /var/www/html/

# Configurar permisos
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
CMD ["apache2-foreground"]
