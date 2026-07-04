-- ═══════════════════════════════════════════════════════════════════════════
-- PISOX — 005_chat_ausencias_roles.sql
-- Ejecutar DESPUÉS de 004_geografia.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Agregar rol 'relevador' al ENUM de users ──────────────────────────────
ALTER TABLE users
  MODIFY rol ENUM('tecnico','admin','user','superadmin','relevador')
  NOT NULL DEFAULT 'user';

-- ── 2. Solicitudes de ausencia (vacaciones/día libre) ────────────────────────
CREATE TABLE IF NOT EXISTS solicitudes_ausencia (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL,
  tipo             ENUM('vacaciones','dia_libre','enfermedad') NOT NULL,
  fecha_desde      DATE         NOT NULL,
  fecha_hasta      DATE         NOT NULL,
  motivo           TEXT         DEFAULT NULL,
  estado           ENUM('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
  respuesta_admin  TEXT         DEFAULT NULL,
  respondido_por   INT UNSIGNED DEFAULT NULL,
  respondido_at    DATETIME     DEFAULT NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_aus_user  FOREIGN KEY (user_id)        REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_aus_admin FOREIGN KEY (respondido_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. Conversaciones de chat ────────────────────────────────────────────────
-- tipo:
--   'interno'  — staff entre sí (admin↔técnico, admin↔relevador, superadmin↔todos)
--   'soporte'  — cliente↔admin/superadmin
--   'visita'   — cliente↔relevador asignado a esa visita
--   'trabajo'  — cliente↔técnico asignado a ese trabajo
CREATE TABLE IF NOT EXISTS conversaciones (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo             ENUM('interno','soporte','visita','trabajo') NOT NULL,
  -- Referencia al objeto relacionado (opcional según tipo)
  visita_id        INT UNSIGNED DEFAULT NULL,
  trabajo_id       INT UNSIGNED DEFAULT NULL,
  -- Participante A (quien inicia o es asignado)
  user_a_id        INT UNSIGNED NOT NULL,
  -- Participante B
  user_b_id        INT UNSIGNED NOT NULL,
  -- Si fue transferida, quién la transfirió y a quién
  transferida_de   INT UNSIGNED DEFAULT NULL,  -- user_id que la cedió
  transferida_a    INT UNSIGNED DEFAULT NULL,  -- user_id que la recibió
  transferida_at   DATETIME     DEFAULT NULL,
  -- Estado
  estado           ENUM('activa','cerrada','transferida') NOT NULL DEFAULT 'activa',
  -- Último mensaje para preview
  ultimo_mensaje   TEXT         DEFAULT NULL,
  ultimo_mensaje_at DATETIME    DEFAULT NULL,
  -- Sin leer por cada participante
  no_leidos_a      INT UNSIGNED NOT NULL DEFAULT 0,
  no_leidos_b      INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_conv_ua      FOREIGN KEY (user_a_id)      REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_ub      FOREIGN KEY (user_b_id)      REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_visita  FOREIGN KEY (visita_id)      REFERENCES visitas_tecnicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_conv_trabajo FOREIGN KEY (trabajo_id)     REFERENCES trabajos_cliente(id) ON DELETE SET NULL,
  CONSTRAINT fk_conv_transde FOREIGN KEY (transferida_de) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_conv_transa  FOREIGN KEY (transferida_a)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para búsqueda rápida
CREATE INDEX idx_conv_ua     ON conversaciones(user_a_id);
CREATE INDEX idx_conv_ub     ON conversaciones(user_b_id);
CREATE INDEX idx_conv_visita ON conversaciones(visita_id);
CREATE INDEX idx_conv_trab   ON conversaciones(trabajo_id);
CREATE INDEX idx_conv_estado ON conversaciones(estado);

-- ── 4. Mensajes de chat ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mensajes_chat (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversacion_id  INT UNSIGNED NOT NULL,
  remitente_id     INT UNSIGNED NOT NULL,
  contenido        TEXT         NOT NULL,
  tipo_contenido   ENUM('texto','imagen','archivo') NOT NULL DEFAULT 'texto',
  archivo_url      VARCHAR(500) DEFAULT NULL,  -- URL Drive si es imagen/archivo
  leido_por_b      TINYINT(1)   NOT NULL DEFAULT 0,
  leido_at         DATETIME     DEFAULT NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_conv FOREIGN KEY (conversacion_id) REFERENCES conversaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_rem  FOREIGN KEY (remitente_id)    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_msg_conv      ON mensajes_chat(conversacion_id);
CREATE INDEX idx_msg_remitente ON mensajes_chat(remitente_id);
CREATE INDEX idx_msg_created   ON mensajes_chat(created_at);

-- ── 5. Tabla de relevamiento vinculada a visita (se crea al solicitar visita) ─
-- Nota: ya existe la tabla 'relevamientos' del 003_sistema_clientes.sql
-- Solo agregamos que se puede crear vacía (borrador) al crear la visita
-- El campo estado='borrador' ya existe, no hay cambio estructural

-- ── 6. Agregar campo 'relevador_asignado_id' a visitas_tecnicas ──────────────
ALTER TABLE visitas_tecnicas
  ADD COLUMN IF NOT EXISTS relevador_asignado_id INT UNSIGNED DEFAULT NULL,
  ADD CONSTRAINT fk_vis_relevador
    FOREIGN KEY (relevador_asignado_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── 7. Agregar campo 'tecnico_en_camino' a turnos_agendados ─────────────────
-- Cuando el técnico marca "en camino" se habilita el chat con el cliente
ALTER TABLE turnos_agendados
  ADD COLUMN IF NOT EXISTS en_camino      TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS en_camino_at   DATETIME   DEFAULT NULL;

-- ── 8. Config adicional ───────────────────────────────────────────────────────
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('chat_habilitado',          '1',    'Habilitar sistema de chat'),
  ('max_dias_vacaciones',      '15',   'Días máximos de vacaciones por año'),
  ('anticipacion_ausencia_dias','3',   'Días mínimos de anticipación para solicitar ausencia'),
  ('chat_tecnico_cliente_trigger', 'en_camino', 'Cuándo se habilita el chat técnico-cliente: en_camino | agendado')
ON DUPLICATE KEY UPDATE valor = VALUES(valor);
