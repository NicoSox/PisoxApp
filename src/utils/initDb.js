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
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre        VARCHAR(150) NOT NULL,
  email         VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol           ENUM('tecnico','admin','user','superadmin','relevador') NOT NULL DEFAULT 'user',
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_activo (activo),
  KEY idx_users_rol (rol)
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
 ALTER TABLE users
  MODIFY rol ENUM('tecnico','admin','user','superadmin','relevador') NOT NULL DEFAULT 'superadmin';
CREATE TABLE IF NOT EXISTS presupuestos (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero                INT UNSIGNED NOT NULL,
  fecha                 DATE         NOT NULL,
  cliente_nombre        VARCHAR(150) DEFAULT '',
  cliente_telefono      VARCHAR(50)  DEFAULT '',
  cliente_domicilio     VARCHAR(255) DEFAULT '',
  mano_obra             JSON         DEFAULT NULL,
  materiales            JSON         DEFAULT NULL,
  incluir_materiales    TINYINT(1)   NOT NULL DEFAULT 0,
  iva_porcentaje        DECIMAL(5,2) NOT NULL DEFAULT 0,
  solicitar_adelanto    TINYINT(1)   NOT NULL DEFAULT 0,
  porcentaje_adelanto   DECIMAL(5,2) NOT NULL DEFAULT 50,
  subtotal_mano_obra    DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal_materiales   DECIMAL(12,2) NOT NULL DEFAULT 0,
  total                 DECIMAL(12,2) NOT NULL DEFAULT 0,
  notas                 TEXT         DEFAULT NULL,
  estado                ENUM('borrador','enviado','aprobado','rechazado') NOT NULL DEFAULT 'borrador',
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_presupuesto_numero (numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asistencias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  fecha       DATE         NOT NULL,
  presente    TINYINT(1)   NOT NULL DEFAULT 1,
  nota        VARCHAR(255) DEFAULT NULL,
  creado_por  INT UNSIGNED DEFAULT NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asistencia (user_id, fecha),
  CONSTRAINT fk_asis_user  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_asis_admin FOREIGN KEY (creado_por) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- ═══════════════════════════════════════════════════════════════════════════
-- PISOX — Extensión de DB para sistema de clientes
-- ⚠ No modifica tablas existentes: users, tickets, ticket_historial,
--   ticket_comentarios, presupuestos, asistencias
-- Ejecutar en orden
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Push tokens (se agrega columna a users existente) ────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS expo_push_token VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_activo TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ml_habilitado TINYINT(1) NOT NULL DEFAULT 0;

-- ── 2. Zonas de cobertura ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zonas (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT DEFAULT NULL,
  activo      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_zonas_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. Técnicos → Zonas (un técnico puede cubrir varias zonas) ──────────────
CREATE TABLE IF NOT EXISTS tecnico_zonas (
  tecnico_id  INT UNSIGNED NOT NULL,
  zona_id     INT UNSIGNED NOT NULL,
  PRIMARY KEY (tecnico_id, zona_id),
  CONSTRAINT fk_tz_tecnico FOREIGN KEY (tecnico_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tz_zona    FOREIGN KEY (zona_id)    REFERENCES zonas(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. Tipos de trabajo (catálogo configurable por superadmin) ───────────────
CREATE TABLE IF NOT EXISTS tipos_trabajo (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  descripcion TEXT DEFAULT NULL,
  icono       VARCHAR(50)  DEFAULT 'construct-outline',  -- nombre de Ionicons
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. Subtipos de trabajo (ej: service, instalación, reparación) ────────────
CREATE TABLE IF NOT EXISTS subtipos_trabajo (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo_trabajo_id  INT UNSIGNED NOT NULL,
  nombre           VARCHAR(150) NOT NULL,
  descripcion      TEXT DEFAULT NULL,
  garantia_meses   INT UNSIGNED NOT NULL DEFAULT 0,  -- 0 = sin garantía
  activo           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_st_tipo FOREIGN KEY (tipo_trabajo_id) REFERENCES tipos_trabajo(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 6. Schedule Mercado Libre (rotación configurable) ───────────────────────
-- semana_del_mes: 1=primera, 2=segunda, 3=tercera, 4=cuarta
-- dia_semana: 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes
CREATE TABLE IF NOT EXISTS schedule_mercadolibre (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tecnico_id     INT UNSIGNED NOT NULL,
  semana_del_mes TINYINT      NOT NULL CHECK (semana_del_mes BETWEEN 1 AND 4),
  dia_semana     TINYINT      NOT NULL CHECK (dia_semana BETWEEN 1 AND 5),
  es_bucle       TINYINT(1)   NOT NULL DEFAULT 1,  -- se repite cada mes
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sml (tecnico_id, semana_del_mes, dia_semana),
  CONSTRAINT fk_sml_tecnico FOREIGN KEY (tecnico_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 7. Clientes (datos extra del user con rol='user') ────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL UNIQUE,
  telefono   VARCHAR(30)  DEFAULT NULL,
  documento  VARCHAR(30)  DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cli_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 8. Propiedades del cliente ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS propiedades (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id            INT UNSIGNED NOT NULL,
  zona_id               INT UNSIGNED DEFAULT NULL,
  tipo                  ENUM('casa','negocio','empresa') NOT NULL DEFAULT 'casa',
  nombre                VARCHAR(150) NOT NULL,             -- ej: "Mi casa", "Local centro"
  direccion             VARCHAR(255) NOT NULL,
  referencia            VARCHAR(255) DEFAULT NULL,          -- ej: "portón azul"
  foto_portada_url      VARCHAR(500) DEFAULT NULL,          -- URL Drive
  activo                TINYINT(1)   NOT NULL DEFAULT 1,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prop_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_prop_zona    FOREIGN KEY (zona_id)    REFERENCES zonas(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 9. Disponibilidad diaria de técnicos (precalculada) ─────────────────────
-- Se genera/actualiza cuando: se crea un trabajo, se cambia el schedule ML,
-- o el admin regenera manualmente para un rango de fechas
CREATE TABLE IF NOT EXISTS disponibilidad_tecnicos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tecnico_id        INT UNSIGNED NOT NULL,
  fecha             DATE         NOT NULL,
  franja            ENUM('mañana','tarde') NOT NULL,
  horas_disponibles DECIMAL(4,2) NOT NULL DEFAULT 8.00,  -- máx 8hs por franja combinada
  bloqueado_ml      TINYINT(1)   NOT NULL DEFAULT 0,      -- ese día va a ML
  activo            TINYINT(1)   NOT NULL DEFAULT 1,
  UNIQUE KEY uq_disp (tecnico_id, fecha, franja),
  CONSTRAINT fk_disp_tecnico FOREIGN KEY (tecnico_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 10. Visitas técnicas (solicitud del cliente) ─────────────────────────────
CREATE TABLE IF NOT EXISTS visitas_tecnicas (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propiedad_id        INT UNSIGNED NOT NULL,
  cliente_id          INT UNSIGNED NOT NULL,
  tecnico_asignado_id INT UNSIGNED DEFAULT NULL,
  zona_id             INT UNSIGNED DEFAULT NULL,
  fecha_solicitada    DATE         NOT NULL,
  franja              ENUM('mañana','tarde') NOT NULL,
  fecha_confirmada    DATE         DEFAULT NULL,
  franja_confirmada   ENUM('mañana','tarde') DEFAULT NULL,
  estado              ENUM('pendiente','confirmada','realizada','cancelada') NOT NULL DEFAULT 'pendiente',
  notas_cliente       TEXT DEFAULT NULL,
  notas_admin         TEXT DEFAULT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vis_propiedad FOREIGN KEY (propiedad_id)        REFERENCES propiedades(id) ON DELETE CASCADE,
  CONSTRAINT fk_vis_cliente   FOREIGN KEY (cliente_id)          REFERENCES clientes(id)    ON DELETE CASCADE,
  CONSTRAINT fk_vis_tecnico   FOREIGN KEY (tecnico_asignado_id) REFERENCES users(id)       ON DELETE SET NULL,
  CONSTRAINT fk_vis_zona      FOREIGN KEY (zona_id)             REFERENCES zonas(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 11. Relevamientos (lo que registra el técnico en la visita) ──────────────
CREATE TABLE IF NOT EXISTS relevamientos (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  visita_id           INT UNSIGNED NOT NULL,
  tecnico_id          INT UNSIGNED NOT NULL,
  tipo_trabajo_id     INT UNSIGNED DEFAULT NULL,
  subtipo_trabajo_id  INT UNSIGNED DEFAULT NULL,
  descripcion         TEXT         NOT NULL,
  herramientas        TEXT         DEFAULT NULL,  -- herramientas necesarias
  horas_estimadas     DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  materiales_notas    TEXT         DEFAULT NULL,  -- notas sobre materiales
  fotos_drive         JSON         DEFAULT NULL,  -- array de URLs de Drive
  notas_adicionales   TEXT         DEFAULT NULL,
  estado              ENUM('borrador','enviado') NOT NULL DEFAULT 'borrador',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rel_visita   FOREIGN KEY (visita_id)          REFERENCES visitas_tecnicas(id) ON DELETE CASCADE,
  CONSTRAINT fk_rel_tecnico  FOREIGN KEY (tecnico_id)         REFERENCES users(id)            ON DELETE CASCADE,
  CONSTRAINT fk_rel_tipo     FOREIGN KEY (tipo_trabajo_id)    REFERENCES tipos_trabajo(id)    ON DELETE SET NULL,
  CONSTRAINT fk_rel_subtipo  FOREIGN KEY (subtipo_trabajo_id) REFERENCES subtipos_trabajo(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 12. Trabajos del cliente (histórico completo) ────────────────────────────
CREATE TABLE IF NOT EXISTS trabajos_cliente (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propiedad_id          INT UNSIGNED NOT NULL,
  cliente_id            INT UNSIGNED NOT NULL,
  tecnico_id            INT UNSIGNED DEFAULT NULL,
  tipo_trabajo_id       INT UNSIGNED DEFAULT NULL,
  subtipo_trabajo_id    INT UNSIGNED DEFAULT NULL,
  visita_id             INT UNSIGNED DEFAULT NULL,
  relevamiento_id       INT UNSIGNED DEFAULT NULL,
  presupuesto_id        INT          DEFAULT NULL,  -- FK a presupuestos existente
  titulo                VARCHAR(255) NOT NULL,
  descripcion           TEXT         DEFAULT NULL,
  notas_tecnico         TEXT         DEFAULT NULL,
  foto_portada_url      VARCHAR(500) DEFAULT NULL,  -- URL Drive — foto principal del trabajo
  fotos_adicionales     JSON         DEFAULT NULL,  -- array de URLs Drive
  fecha_inicio          DATE         DEFAULT NULL,
  fecha_fin             DATE         DEFAULT NULL,
  garantia_meses        INT UNSIGNED DEFAULT 0,
  garantia_hasta        DATE         DEFAULT NULL,  -- calculado: fecha_fin + garantia_meses
  respuesta_cliente     TEXT         DEFAULT NULL,  -- motivo opcional si el cliente rechaza el presupuesto
  motivo_reprogramacion TEXT         DEFAULT NULL,  -- motivo cuando técnico/admin pide reprogramar
  estado                ENUM('presupuestado','aprobado','agendado','en_curso','completado','cancelado','reprogramar')
                        NOT NULL DEFAULT 'presupuestado',
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tc_propiedad  FOREIGN KEY (propiedad_id)       REFERENCES propiedades(id)      ON DELETE CASCADE,
  CONSTRAINT fk_tc_cliente    FOREIGN KEY (cliente_id)         REFERENCES clientes(id)         ON DELETE CASCADE,
  CONSTRAINT fk_tc_tecnico    FOREIGN KEY (tecnico_id)         REFERENCES users(id)            ON DELETE SET NULL,
  CONSTRAINT fk_tc_tipo       FOREIGN KEY (tipo_trabajo_id)    REFERENCES tipos_trabajo(id)    ON DELETE SET NULL,
  CONSTRAINT fk_tc_subtipo    FOREIGN KEY (subtipo_trabajo_id) REFERENCES subtipos_trabajo(id) ON DELETE SET NULL,
  CONSTRAINT fk_tc_visita     FOREIGN KEY (visita_id)          REFERENCES visitas_tecnicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_tc_relev      FOREIGN KEY (relevamiento_id)    REFERENCES relevamientos(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Por si trabajos_cliente ya existía sin estas columnas/estado
ALTER TABLE trabajos_cliente
  ADD COLUMN IF NOT EXISTS respuesta_cliente TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS motivo_reprogramacion TEXT DEFAULT NULL;
ALTER TABLE trabajos_cliente
  MODIFY estado ENUM('presupuestado','aprobado','agendado','en_curso','completado','cancelado','reprogramar')
  NOT NULL DEFAULT 'presupuestado';

-- ── 13. Turnos agendados (trabajo confirmado con fecha y técnico) ─────────────
CREATE TABLE IF NOT EXISTS turnos_agendados (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trabajo_id      INT UNSIGNED NOT NULL,
  tecnico_id      INT UNSIGNED NOT NULL,
  fecha           DATE         NOT NULL,
  franja          ENUM('mañana','tarde') NOT NULL,
  horas_asignadas DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  estado          ENUM('agendado','en_curso','completado','cancelado') NOT NULL DEFAULT 'agendado',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ta_trabajo  FOREIGN KEY (trabajo_id) REFERENCES trabajos_cliente(id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_tecnico  FOREIGN KEY (tecnico_id) REFERENCES users(id)            ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 14. Notificaciones push ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificaciones (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  titulo       VARCHAR(200) NOT NULL,
  cuerpo       TEXT         NOT NULL,
  tipo         VARCHAR(50)  DEFAULT NULL,   -- 'presupuesto','turno','trabajo','visita'
  referencia_id INT UNSIGNED DEFAULT NULL,  -- id del objeto relacionado
  leida        TINYINT(1)   NOT NULL DEFAULT 0,
  enviada_push TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 14b. Chat — soporte y conversaciones internas ────────────────────────────
-- tipo 'soporte'  = cliente↔soporte o técnico/relevador↔soporte (responsable_id puede ser admin o superadmin), sin vincular a nada puntual
-- tipo 'tecnico'  = cliente↔técnico asignado a una visita puntual (puede iniciarlo cualquiera de los dos)
-- tipo 'equipo'   = consulta interna del equipo sobre un cliente/visita o un ticket de trabajo — siempre vinculada a visita_id o ticket_id, va a la cola de admin/superadmin
CREATE TABLE IF NOT EXISTS chats (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  iniciado_por_id INT UNSIGNED NOT NULL,
  responsable_id  INT UNSIGNED DEFAULT NULL,
  tipo            ENUM('soporte','tecnico','equipo') NOT NULL DEFAULT 'soporte',
  visita_id       INT UNSIGNED DEFAULT NULL,
  ticket_id       INT UNSIGNED DEFAULT NULL,
  titulo          VARCHAR(150) DEFAULT NULL,
  estado          ENUM('abierto','cerrado') NOT NULL DEFAULT 'abierto',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at       DATETIME DEFAULT NULL,
  CONSTRAINT fk_chat_iniciador   FOREIGN KEY (iniciado_por_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_responsable FOREIGN KEY (responsable_id)  REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_chat_visita      FOREIGN KEY (visita_id)       REFERENCES visitas_tecnicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_chat_ticket      FOREIGN KEY (ticket_id)       REFERENCES tickets(id) ON DELETE SET NULL
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

-- ── 15. Configuración global (superadmin) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion (
  clave      VARCHAR(100) NOT NULL PRIMARY KEY,
  valor      TEXT         NOT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valores por defecto de configuración
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('jornada_horas',          '8',     'Horas de jornada laboral diaria por técnico'),
  ('dias_laborales',         '1,2,3,4,5', 'Días laborales: 1=lunes...5=viernes'),
  ('franjas',                'mañana,tarde', 'Franjas horarias disponibles'),
  ('anticipacion_minima_dias','1',    'Días mínimos de anticipación para solicitar visita'),
  ('anticipacion_maxima_dias','30',   'Días máximos hacia adelante para solicitar visita'),
  ('mensaje_bienvenida',     'Bienvenido a Pisox. Estamos para ayudarte.', 'Mensaje de bienvenida en la app cliente')
ON DUPLICATE KEY UPDATE valor = VALUES(valor);

-- ── 16. Datos de ejemplo — tipos de trabajo iniciales ────────────────────────
INSERT INTO tipos_trabajo (nombre, descripcion, icono) VALUES
  ('Aire Acondicionado', 'Instalación, service y reparación de equipos de climatización', 'snow-outline'),
  ('Electricidad',       'Instalaciones y reparaciones eléctricas',                       'flash-outline'),
  ('Pintura',            'Pintura de interiores y exteriores',                            'color-palette-outline'),
  ('Plomería',           'Instalaciones y reparaciones de plomería',                      'water-outline'),
  ('General',            'Trabajos de mantenimiento general',                             'construct-outline')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- Subtipos de Aire Acondicionado
INSERT INTO subtipos_trabajo (tipo_trabajo_id, nombre, garantia_meses) VALUES
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Aire Acondicionado'), 'Instalación',        6),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Aire Acondicionado'), 'Service',            3),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Aire Acondicionado'), 'Cambio de capacitor',3),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Aire Acondicionado'), 'Carga de gas',       3),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Aire Acondicionado'), 'Reparación general', 3);

-- Subtipos de Electricidad
INSERT INTO subtipos_trabajo (tipo_trabajo_id, nombre, garantia_meses) VALUES
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Electricidad'), 'Instalación',         6),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Electricidad'), 'Reparación',          3),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Electricidad'), 'Tablero eléctrico',   6),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Electricidad'), 'Iluminación',         6);

-- Subtipos de Pintura
INSERT INTO subtipos_trabajo (tipo_trabajo_id, nombre, garantia_meses) VALUES
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Pintura'), 'Interior', 0),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Pintura'), 'Exterior', 0),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Pintura'), 'Cielorraso', 0);

-- Subtipos de Plomería
INSERT INTO subtipos_trabajo (tipo_trabajo_id, nombre, garantia_meses) VALUES
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Plomería'), 'Instalación', 6),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Plomería'), 'Reparación',  3),
  ((SELECT id FROM tipos_trabajo WHERE nombre = 'Plomería'), 'Destapación', 0);

-- Zonas iniciales de San Miguel de Tucumán
INSERT INTO zonas (nombre, descripcion) VALUES
  ('Centro',         'San Miguel de Tucumán — Centro y alrededores'),
  ('Norte',          'San Miguel de Tucumán — Zona Norte'),
  ('Sur',            'San Miguel de Tucumán — Zona Sur'),
  ('Este',           'San Miguel de Tucumán — Zona Este'),
  ('Oeste',          'San Miguel de Tucumán — Zona Oeste'),
  ('Gran Tucumán',   'Localidades del Gran Tucumán — Yerba Buena, Tafí Viejo, etc.')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);
-- ═══════════════════════════════════════════════════════════════════════════
-- PISOX — Geografía: provincias, localidades y vinculación con zonas
-- Ejecutar DESPUÉS de 003_sistema_clientes.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Provincias ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provincias (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(100) NOT NULL,
  codigo     VARCHAR(10)  DEFAULT NULL,  -- ej: 'TUC', 'BUE', 'CBA'
  activo     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provincia_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Localidades ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS localidades (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provincia_id INT UNSIGNED NOT NULL,
  nombre       VARCHAR(150) NOT NULL,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_localidad (provincia_id, nombre),
  CONSTRAINT fk_loc_provincia FOREIGN KEY (provincia_id) REFERENCES provincias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. Agregar localidad_id a zonas ──────────────────────────────────────────
ALTER TABLE zonas
  ADD COLUMN IF NOT EXISTS localidad_id INT UNSIGNED DEFAULT NULL;

-- MySQL no soporta "ADD CONSTRAINT IF NOT EXISTS", así que lo chequeamos
-- a mano contra information_schema antes de intentar agregarla.
SET @c1 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_zona_localidad');
SET @sql1 = IF(@c1 = 0,
  'ALTER TABLE zonas ADD CONSTRAINT fk_zona_localidad FOREIGN KEY (localidad_id) REFERENCES localidades(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- ── 4. Agregar provincia_id a propiedades ────────────────────────────────────
ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS localidad_id INT UNSIGNED DEFAULT NULL;

SET @c2 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_prop_localidad');
SET @sql2 = IF(@c2 = 0,
  'ALTER TABLE propiedades ADD CONSTRAINT fk_prop_localidad FOREIGN KEY (localidad_id) REFERENCES localidades(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ── 5. Datos iniciales — Tucumán ─────────────────────────────────────────────
INSERT INTO provincias (nombre, codigo) VALUES
  ('Tucumán',        'TUC'),
  ('Buenos Aires',   'BUE'),
  ('Córdoba',        'CBA'),
  ('Salta',          'SAL'),
  ('Jujuy',          'JUJ'),
  ('Santiago del Estero', 'SDE'),
  ('Catamarca',      'CAT'),
  ('La Rioja',       'LRI')
ON DUPLICATE KEY UPDATE codigo = VALUES(codigo);

-- Localidades de Tucumán
INSERT INTO localidades (provincia_id, nombre)
SELECT p.id, loc.nombre FROM provincias p,
(SELECT 'San Miguel de Tucumán' AS nombre UNION ALL
 SELECT 'Yerba Buena'           UNION ALL
 SELECT 'Tafí Viejo'            UNION ALL
 SELECT 'Banda del Río Salí'    UNION ALL
 SELECT 'Alderetes'             UNION ALL
 SELECT 'Las Talitas'           UNION ALL
 SELECT 'El Manantial'          UNION ALL
 SELECT 'Lules'                 UNION ALL
 SELECT 'Famaillá'              UNION ALL
 SELECT 'Monteros'              UNION ALL
 SELECT 'Concepción'            UNION ALL
 SELECT 'Aguilares'             UNION ALL
 SELECT 'Bella Vista'           UNION ALL
 SELECT 'Río Chico') loc
WHERE p.nombre = 'Tucumán'
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- ── 6. Vincular zonas existentes a San Miguel de Tucumán ────────────────────
UPDATE zonas z
JOIN localidades l ON l.nombre = 'San Miguel de Tucumán'
JOIN provincias p  ON p.nombre = 'Tucumán' AND l.provincia_id = p.id
SET z.localidad_id = l.id
WHERE z.nombre IN ('Centro','Norte','Sur','Este','Oeste');

UPDATE zonas z
JOIN localidades l ON l.nombre = 'Yerba Buena'
JOIN provincias p  ON p.nombre = 'Tucumán' AND l.provincia_id = p.id
SET z.localidad_id = l.id
WHERE z.nombre = 'Gran Tucumán';

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
