-- migracion_chat.sql
-- Ejecutar directo en tu base MySQL si ya tenés el resto de las tablas creadas.
-- (Estas mismas tablas también quedaron agregadas a src/utils/initDb.js
--  por si en algún momento corrés initDb.js de cero en una base nueva)

-- ── Chat — soporte y conversaciones internas ────────────────────────────────
-- tipo 'soporte'  = cliente↔soporte o técnico/relevador↔soporte (responsable_id puede ser admin o superadmin)
-- tipo 'tecnico'  = cliente↔técnico asignado a una visita puntual
CREATE TABLE IF NOT EXISTS chats (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  iniciado_por_id INT UNSIGNED NOT NULL,
  responsable_id  INT UNSIGNED DEFAULT NULL,
  tipo            ENUM('soporte','tecnico') NOT NULL DEFAULT 'soporte',
  visita_id       INT UNSIGNED DEFAULT NULL,
  titulo          VARCHAR(150) DEFAULT NULL,
  estado          ENUM('abierto','cerrado') NOT NULL DEFAULT 'abierto',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at       DATETIME DEFAULT NULL,
  CONSTRAINT fk_chat_iniciador   FOREIGN KEY (iniciado_por_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_responsable FOREIGN KEY (responsable_id)  REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_chat_visita      FOREIGN KEY (visita_id)       REFERENCES visitas_tecnicas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_mensajes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  chat_id    INT UNSIGNED NOT NULL,
  autor_id   INT UNSIGNED NOT NULL,
  mensaje    TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_chat  FOREIGN KEY (chat_id)  REFERENCES chats(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_autor FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
