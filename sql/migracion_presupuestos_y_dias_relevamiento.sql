-- ══════════════════════════════════════════════════════════════════════════
-- Migración: días de relevamiento configurables + auto-generación de
-- presupuestos desde relevamientos.
-- Ejecutar en phpMyAdmin sobre la base de producción.
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Nueva clave de configuración: días habilitados para SOLICITAR relevamiento.
--    Se edita luego desde la app (Configuración, como superadmin).
--    Formato: '1,2,3,4,5' = lunes a viernes (default). '3' = solo miércoles.
--    '1,5' = solo lunes y viernes.
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('dias_relevamiento', '1,2,3,4,5', 'Días habilitados para SOLICITAR relevamiento (1=lunes...5=viernes, separados por coma)')
ON DUPLICATE KEY UPDATE valor = VALUES(valor);

-- 2. Nuevo valor de estado en trabajos_cliente: 'presupuestando'.
--    Es un estado INTERNO (el cliente no lo ve como "pendiente de acción"):
--    se usa entre que el relevador termina el relevamiento y el admin
--    efectivamente envía el presupuesto ya armado. Recién ahí pasa a
--    'presupuestado', que es el que el cliente puede aprobar/rechazar.
ALTER TABLE trabajos_cliente
  MODIFY estado ENUM('presupuestando','presupuestado','aprobado','agendado','en_curso','completado','cancelado','reprogramar')
  NOT NULL DEFAULT 'presupuestado';
