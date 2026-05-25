ALTER TABLE users
  MODIFY rol ENUM('tecnico','admin','user','superadmin') NOT NULL DEFAULT 'superadmin';