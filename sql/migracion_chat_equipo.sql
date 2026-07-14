-- migracion_chat_equipo.sql
--
-- Agrega el tipo 'equipo' a los chats: una consulta interna del equipo
-- (técnico o relevador) sobre un cliente/visita o un ticket de trabajo,
-- distinta de una consulta general de soporte. Siempre queda vinculada a
-- una visita o a un ticket — nunca "suelta". También permite vincular un
-- chat a un ticket interno (tabla `tickets`), igual que ya se podía
-- vincular a una visita.
--
-- Correr una sola vez sobre bases de datos existentes (las nuevas ya la
-- incluyen mediante initDb.js).

ALTER TABLE chats
  MODIFY COLUMN tipo ENUM('soporte','tecnico','equipo') NOT NULL DEFAULT 'soporte';

ALTER TABLE chats
  ADD COLUMN ticket_id INT UNSIGNED DEFAULT NULL AFTER visita_id;

ALTER TABLE chats
  ADD CONSTRAINT fk_chat_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
