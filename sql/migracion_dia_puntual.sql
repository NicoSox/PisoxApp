-- Migración: permitir asignar a un técnico un día PUNTUAL (no parte del
-- bucle de rotación) en schedule_mercadolibre.
--
-- Hoy la tabla exige siempre semana_del_mes + dia_semana (1-4 y 1-5), no hay
-- forma de guardar una fecha concreta. Esta migración:
--   1. Permite que semana_del_mes y dia_semana queden en NULL (para las
--      asignaciones puntuales, que no usan esos campos).
--   2. Agrega una columna `fecha` (fecha concreta, solo para asignaciones
--      puntuales; queda NULL en las de bucle).
--   3. Agrega una clave única (tecnico_id, fecha) para no duplicar el mismo
--      día puntual dos veces para el mismo técnico.
--
-- Ejecutar UNA SOLA VEZ en phpMyAdmin. No borra ni modifica datos existentes.

ALTER TABLE schedule_mercadolibre
  MODIFY COLUMN semana_del_mes TINYINT NULL,
  MODIFY COLUMN dia_semana     TINYINT NULL,
  ADD COLUMN fecha DATE NULL AFTER dia_semana,
  ADD UNIQUE KEY uq_sml_fecha (tecnico_id, fecha);
