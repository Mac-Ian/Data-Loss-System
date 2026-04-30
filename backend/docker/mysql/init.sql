-- docker/mysql/init.sql
-- DLMS – Riba & Company Limited
-- Runs once when the MySQL Docker container first starts.

CREATE DATABASE IF NOT EXISTS dlms_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Grant all privileges to the app user
GRANT ALL PRIVILEGES ON dlms_db.* TO 'dlms_user'@'%';
FLUSH PRIVILEGES;
