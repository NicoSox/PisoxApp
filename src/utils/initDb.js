/**
 * node src/utils/initDb.js
 * Crea las tablas en MySQL si no existen.
 * Corré esto una sola vez al instalar el proyecto.
 */
import 'dotenv/config'
import pool from './db.js'

const SQL = `
CREATE TABLE IF NOT EXISTS tickets (
  id            INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  codigo        VARCHAR(50)       NOT NULL,
  titulo        VARCHAR(255)      NOT NULL,
  sitio         VARCHAR(150)      DEFAULT NULL,
  rubro         VARCHAR(150)      DEFAULT NULL,
  sub_rubro     VARCHAR(150)      DEFAULT NULL,
  descripcion   TEXT              DEFAULT NULL,
  prioridad     ENUM('Baja','Media','Alta','Crítica') NOT NULL DEFAULT 'Media',
  estado        ENUM('Pendiente','En Proceso','Resuelto','Cerrado') NOT NULL DEFAULT 'Pendiente',
  asignado_a    VARCHAR(150)      DEFAULT NULL,
  imagen_path   VARCHAR(500)      DEFAULT NULL,
  texto_ocr_raw LONGTEXT          DEFAULT NULL,
  ocr_confianza TINYINT UNSIGNED  DEFAULT NULL,
  notas         TEXT              DEFAULT NULL,
  created_at    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_codigo (codigo),
  KEY idx_estado    (estado),
  KEY idx_prioridad (prioridad),
  KEY idx_sitio     (sitio),
  KEY idx_created   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_historial (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id      INT UNSIGNED NOT NULL,
  campo          VARCHAR(80)  NOT NULL,
  valor_antes    TEXT         DEFAULT NULL,
  valor_despues  TEXT         DEFAULT NULL,
  modificado_por VARCHAR(150) NOT NULL DEFAULT 'sistema',
  modificado_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ticket (ticket_id),
  CONSTRAINT fk_hist_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_comentarios (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id  INT UNSIGNED NOT NULL,
  autor      VARCHAR(150) NOT NULL DEFAULT 'Anónimo',
  comentario TEXT         NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ticket (ticket_id),
  CONSTRAINT fk_com_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`

async function init() {
  const conn = await pool.getConnection()
  try {
    // Ejecutar cada CREATE TABLE por separado
    const statements = SQL.split(';').map(s => s.trim()).filter(Boolean)
    for (const stmt of statements) {
      await conn.query(stmt)
    }
    console.log('✅ Tablas creadas correctamente en MySQL')
  } catch (err) {
    console.error('❌ Error creando tablas:', err.message)
    process.exit(1)
  } finally {
    conn.release()
    await pool.end()
  }
}

init()
