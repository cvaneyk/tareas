-- Separa la ranura de recurrencia de la fecha de vencimiento, y añade borrado
-- suave.
--
-- Sin esto, borrar o posponer una tarea que viene de una recurrente liberaba su
-- ranura del día y el generador la volvía a crear en el siguiente render: desde
-- fuera parecía que el botón no hacía nada.

-- 1. Columnas nuevas.
ALTER TABLE "task_occurrences" ADD COLUMN "slot_date" DATE;
ALTER TABLE "task_occurrences" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- 2. Las tareas que ya existen ocupan la ranura de su propia fecha. Las sueltas
--    (sin plantilla) se quedan con slot_date NULL: no ocupan ninguna.
UPDATE "task_occurrences" SET "slot_date" = "due_date" WHERE "template_id" IS NOT NULL;

-- 3. La restricción pasa a ser (plantilla, ranura).
DROP INDEX "task_occurrences_template_id_due_date_key";
CREATE UNIQUE INDEX "task_occurrences_template_id_slot_date_key"
  ON "task_occurrences"("template_id", "slot_date");

CREATE INDEX "task_occurrences_deleted_at_idx" ON "task_occurrences"("deleted_at");
