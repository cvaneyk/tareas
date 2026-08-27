-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('RECURRENT', 'SINGLE', 'CHAPUZA', 'BIG_CLEAN');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SubtaskStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "avatar" TEXT NOT NULL DEFAULT '👤',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "house_name" TEXT NOT NULL DEFAULT 'Nuestra Casa 🏠',
    "start_day" TEXT NOT NULL DEFAULT 'monday',
    "theme" TEXT NOT NULL DEFAULT 'light',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "house_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TaskType" NOT NULL DEFAULT 'RECURRENT',
    "category" TEXT NOT NULL DEFAULT 'hogar',
    "suggestible" BOOLEAN NOT NULL DEFAULT false,
    "rule" JSONB NOT NULL,
    "assignment" JSONB NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 15,
    "priority" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_subtasks" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assignee_user_id" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "template_subtasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_occurrences" (
    "id" TEXT NOT NULL,
    "template_id" TEXT,
    "seq" INTEGER,
    "name" TEXT NOT NULL,
    "type" "TaskType" NOT NULL DEFAULT 'SINGLE',
    "category" TEXT NOT NULL DEFAULT 'hogar',
    "assigned_to_id" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "suggestible" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 15,
    "priority" TEXT,
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_subtasks" (
    "id" TEXT NOT NULL,
    "occurrence_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assignee_user_id" TEXT NOT NULL,
    "status" "SubtaskStatus" NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,

    CONSTRAINT "occurrence_subtasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "task_name" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_templates_active_idx" ON "task_templates"("active");

-- CreateIndex
CREATE INDEX "template_subtasks_template_id_idx" ON "template_subtasks"("template_id");

-- CreateIndex
CREATE INDEX "task_occurrences_due_date_idx" ON "task_occurrences"("due_date");

-- CreateIndex
CREATE INDEX "task_occurrences_status_idx" ON "task_occurrences"("status");

-- CreateIndex
CREATE UNIQUE INDEX "task_occurrences_template_id_due_date_key" ON "task_occurrences"("template_id", "due_date");

-- CreateIndex
CREATE INDEX "occurrence_subtasks_occurrence_id_idx" ON "occurrence_subtasks"("occurrence_id");

-- CreateIndex
CREATE INDEX "activity_log_created_at_idx" ON "activity_log"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "template_subtasks" ADD CONSTRAINT "template_subtasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_subtasks" ADD CONSTRAINT "template_subtasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence_subtasks" ADD CONSTRAINT "occurrence_subtasks_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "task_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence_subtasks" ADD CONSTRAINT "occurrence_subtasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence_subtasks" ADD CONSTRAINT "occurrence_subtasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
