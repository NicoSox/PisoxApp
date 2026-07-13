-- Migración: inventario de infraestructura de Mercado Libre + auditoría.
-- Son tablas NUEVAS, no tocan nada existente — es seguro correrla una sola
-- vez en phpMyAdmin.

CREATE TABLE IF NOT EXISTS ml_inventario (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  icono       VARCHAR(50)  NOT NULL DEFAULT 'cube-outline',
  cantidad    INT          NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  creado_por  INT UNSIGNED DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ml_inv_nombre (nombre),
  CONSTRAINT fk_ml_inv_creado FOREIGN KEY (creado_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ml_inventario_auditoria (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id          INT UNSIGNED NOT NULL,
  item_nombre      VARCHAR(100) NOT NULL,
  accion           ENUM('creado','cantidad_actualizada','editado','eliminado') NOT NULL,
  cantidad_antes   INT DEFAULT NULL,
  cantidad_despues INT DEFAULT NULL,
  usuario_id       INT UNSIGNED DEFAULT NULL,
  usuario_nombre   VARCHAR(100) DEFAULT NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ml_inv_aud_usuario FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
