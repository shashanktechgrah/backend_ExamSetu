-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'TRUE_FALSE', 'INTEGER', 'SHORT', 'SUBJECTIVE');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('MOCK', 'TEACHER_EXAM');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('STARTED', 'SUBMITTED', 'AUTO_SUBMITTED');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('Pass', 'Fail');

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "phone" VARCHAR(20),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "classes" (
    "class_id" SERIAL NOT NULL,
    "class_name" VARCHAR(20) NOT NULL,
    "section" VARCHAR(10) NOT NULL DEFAULT 'A',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("class_id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "subject_id" SERIAL NOT NULL,
    "subject_name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("subject_id")
);

-- CreateTable
CREATE TABLE "students" (
    "student_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "class_id" INTEGER NOT NULL,
    "roll_no" VARCHAR(30),
    "guardian_name" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "teacher_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "department" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("teacher_id")
);

-- CreateTable
CREATE TABLE "question_sources" (
    "source_id" SERIAL NOT NULL,
    "board" VARCHAR(80),
    "paper_name" VARCHAR(120),
    "year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_sources_pkey" PRIMARY KEY ("source_id")
);

-- CreateTable
CREATE TABLE "question_bank" (
    "qb_question_id" SERIAL NOT NULL,
    "class_id" INTEGER NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "source_id" INTEGER,
    "question_text" TEXT NOT NULL,
    "question_type" "QuestionType" NOT NULL,
    "marks" DECIMAL(6,2) NOT NULL DEFAULT 1.0,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("qb_question_id")
);

-- CreateTable
CREATE TABLE "question_bank_options" (
    "qb_option_id" SERIAL NOT NULL,
    "qb_question_id" INTEGER NOT NULL,
    "option_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order_no" INTEGER NOT NULL,

    CONSTRAINT "question_bank_options_pkey" PRIMARY KEY ("qb_option_id")
);

-- CreateTable
CREATE TABLE "question_bank_correct_answers" (
    "qb_answer_id" SERIAL NOT NULL,
    "qb_question_id" INTEGER NOT NULL,
    "correct_answer" TEXT NOT NULL,

    CONSTRAINT "question_bank_correct_answers_pkey" PRIMARY KEY ("qb_answer_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "tag_id" SERIAL NOT NULL,
    "tag_name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("tag_id")
);

-- CreateTable
CREATE TABLE "question_tags" (
    "qb_question_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "question_tags_pkey" PRIMARY KEY ("qb_question_id","tag_id")
);

-- CreateTable
CREATE TABLE "tests" (
    "test_id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "test_type" "TestType" NOT NULL,
    "class_id" INTEGER NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "created_by" INTEGER,
    "total_marks" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "duration_minutes" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "status" "TestStatus" NOT NULL DEFAULT 'DRAFT',
    "negative_marking" BOOLEAN NOT NULL DEFAULT false,
    "negative_marks_per_wrong" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT true,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT true,
    "passing_marks" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("test_id")
);

-- CreateTable
CREATE TABLE "mock_test_config" (
    "mock_config_id" SERIAL NOT NULL,
    "test_id" INTEGER NOT NULL,
    "number_of_questions" INTEGER NOT NULL,
    "difficulty_filter" "Difficulty",
    "year_from" INTEGER,
    "year_to" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mock_test_config_pkey" PRIMARY KEY ("mock_config_id")
);

-- CreateTable
CREATE TABLE "test_questions" (
    "test_question_id" SERIAL NOT NULL,
    "test_id" INTEGER NOT NULL,
    "qb_question_id" INTEGER NOT NULL,
    "order_no" INTEGER NOT NULL,

    CONSTRAINT "test_questions_pkey" PRIMARY KEY ("test_question_id")
);

-- CreateTable
CREATE TABLE "test_assignments" (
    "assignment_id" SERIAL NOT NULL,
    "test_id" INTEGER NOT NULL,
    "class_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "attempt_id" SERIAL NOT NULL,
    "test_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "total_score" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "percentage" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    "is_result_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("attempt_id")
);

-- CreateTable
CREATE TABLE "answers" (
    "answer_id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "qb_question_id" INTEGER NOT NULL,
    "selected_option_id" INTEGER,
    "answer_text" TEXT,
    "subjective_image_url" TEXT,
    "is_correct" BOOLEAN,
    "marks_obtained" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("answer_id")
);

-- CreateTable
CREATE TABLE "results" (
    "result_id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "total_marks" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "obtained_marks" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "percentage" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ResultStatus" NOT NULL DEFAULT 'Fail',

    CONSTRAINT "results_pkey" PRIMARY KEY ("result_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" VARCHAR(150) NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "classes_class_name_section_key" ON "classes"("class_name", "section");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_subject_name_key" ON "subjects"("subject_name");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");

-- CreateIndex
CREATE INDEX "idx_qb_class_subject" ON "question_bank"("class_id", "subject_id");

-- CreateIndex
CREATE INDEX "idx_qb_source" ON "question_bank"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_bank_options_qb_question_id_order_no_key" ON "question_bank_options"("qb_question_id", "order_no");

-- CreateIndex
CREATE UNIQUE INDEX "question_bank_correct_answers_qb_question_id_key" ON "question_bank_correct_answers"("qb_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_tag_name_key" ON "tags"("tag_name");

-- CreateIndex
CREATE INDEX "idx_tests_class_subject_type" ON "tests"("class_id", "subject_id", "test_type");

-- CreateIndex
CREATE UNIQUE INDEX "mock_test_config_test_id_key" ON "mock_test_config"("test_id");

-- CreateIndex
CREATE INDEX "idx_test_questions_test" ON "test_questions"("test_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_questions_test_id_order_no_key" ON "test_questions"("test_id", "order_no");

-- CreateIndex
CREATE UNIQUE INDEX "test_questions_test_id_qb_question_id_key" ON "test_questions"("test_id", "qb_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_assignments_test_id_class_id_key" ON "test_assignments"("test_id", "class_id");

-- CreateIndex
CREATE INDEX "idx_attempts_student" ON "attempts"("student_id");

-- CreateIndex
CREATE INDEX "idx_answers_attempt" ON "answers"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "answers_attempt_id_qb_question_id_key" ON "answers"("attempt_id", "qb_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_attempt_id_key" ON "results"("attempt_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "question_sources"("source_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_options" ADD CONSTRAINT "question_bank_options_qb_question_id_fkey" FOREIGN KEY ("qb_question_id") REFERENCES "question_bank"("qb_question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_correct_answers" ADD CONSTRAINT "question_bank_correct_answers_qb_question_id_fkey" FOREIGN KEY ("qb_question_id") REFERENCES "question_bank"("qb_question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_qb_question_id_fkey" FOREIGN KEY ("qb_question_id") REFERENCES "question_bank"("qb_question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("tag_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_test_config" ADD CONSTRAINT "mock_test_config_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("test_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_questions" ADD CONSTRAINT "test_questions_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("test_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_questions" ADD CONSTRAINT "test_questions_qb_question_id_fkey" FOREIGN KEY ("qb_question_id") REFERENCES "question_bank"("qb_question_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assignments" ADD CONSTRAINT "test_assignments_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("test_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assignments" ADD CONSTRAINT "test_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("class_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("test_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("attempt_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_qb_question_id_fkey" FOREIGN KEY ("qb_question_id") REFERENCES "question_bank"("qb_question_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "question_bank_options"("qb_option_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("attempt_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
