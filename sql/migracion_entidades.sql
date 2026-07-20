-- ══════════════════════════════════════════════════════════════════════════
-- Migración: sistema de Entidades (equipos/elementos por habitación)
-- Ejecutar en phpMyAdmin sobre la base de producción.
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Tabla nueva: entidades (ej: "Aire acondicionado Samsung" en "Dormitorio")
CREATE TABLE IF NOT EXISTS entidades (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propiedad_id        INT UNSIGNED NOT NULL,
  nombre              VARCHAR(150) NOT NULL,             -- ej: "Aire acondicionado Samsung"
  habitacion          VARCHAR(100) NOT NULL,             -- texto libre, ej: "Dormitorio principal"
  tipo_trabajo_id     INT UNSIGNED DEFAULT NULL,
  subtipo_trabajo_id  INT UNSIGNED DEFAULT NULL,
  foto_perfil_url     VARCHAR(500) DEFAULT NULL,
  datos_tecnicos      JSON DEFAULT NULL,                 -- array libre [{etiqueta, valor}]
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ent_propiedad FOREIGN KEY (propiedad_id)        REFERENCES propiedades(id)      ON DELETE CASCADE,
  CONSTRAINT fk_ent_tipo      FOREIGN KEY (tipo_trabajo_id)     REFERENCES tipos_trabajo(id)     ON DELETE SET NULL,
  CONSTRAINT fk_ent_subtipo   FOREIGN KEY (subtipo_trabajo_id)  REFERENCES subtipos_trabajo(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. relevamientos: cada relevamiento pasa a ser "sobre" una entidad
ALTER TABLE relevamientos
  ADD COLUMN entidad_id INT UNSIGNED DEFAULT NULL AFTER visita_id;
ALTER TABLE relevamientos
  ADD CONSTRAINT fk_rel_entidad FOREIGN KEY (entidad_id) REFERENCES entidades(id) ON DELETE SET NULL;

-- 3. trabajos_cliente: cada trabajo hecho queda vinculado a la entidad
--    (para poder armar el historial dentro de cada ficha)
ALTER TABLE trabajos_cliente
  ADD COLUMN entidad_id INT UNSIGNED DEFAULT NULL AFTER propiedad_id;
ALTER TABLE trabajos_cliente
  ADD CONSTRAINT fk_tc_entidad FOREIGN KEY (entidad_id) REFERENCES entidades(id) ON DELETE SET NULL;
