import { Database } from "bun:sqlite"
import { Course } from "./models/course"
import { Instructor, LessonInstructor } from "./models/instructor"
import { Lesson } from "./models/lesson"
import { SubRequest } from "./models/sub_request"

const { DB_FILENAME = "data.db" } = process.env

interface AddLessonInstructorOptions {
  isSub?: boolean
  isFreeWill?: boolean
}

class ConfigValue {
  constructor(public value: string) {}
}

class LiveDatabase {
  private database: Database

  private cachedCourses: Map<number, Course> = new Map()
  private cachedInstructors: Map<number, Instructor> = new Map()

  constructor(filename: string) {
    this.database = new Database(filename)
    this.database.exec("PRAGMA foreign_keys = ON")
  }

  public createTables(): void {
    this.database.run(INIT_SQL)
  }

  private _configCache = new Map<string, string | null>()
  private fetchConfigValue(key: string): string | null {
    if (!this._configCache.has(key)) {
      const row = this.database
        .query("SELECT value FROM config WHERE key = ?")
        .as(ConfigValue)
        .get(key)
      this._configCache.set(key, row ? row.value : null)
    }
    return this._configCache.get(key) || null
  }
  private setConfigValue(key: string, value: string | null): void {
    this._configCache.set(key, value)
    if (value === null) {
      this.database.query("DELETE FROM config WHERE key = ?").run(key)
    } else {
      this.database
        .query("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)")
        .run(key, value)
    }
  }

  get googleCalendarCredentials(): string | null {
    return this.fetchConfigValue("google_calendar_credentials")
  }
  set googleCalendarCredentials(value: string | null) {
    this.setConfigValue("google_calendar_credentials", value)
  }

  get subChannelId(): string | null {
    return this.fetchConfigValue("sub_channel_id")
  }
  set subChannelId(value: string | null) {
    this.setConfigValue("sub_channel_id", value)
  }

  get subNotifyChannelId(): string | null {
    return this.fetchConfigValue("sub_notify_channel_id")
  }
  set subNotifyChannelId(value: string | null) {
    this.setConfigValue("sub_notify_channel_id", value)
  }

  get filledSubChannelId(): string | null {
    return this.fetchConfigValue("filled_sub_channel_id")
  }
  set filledSubChannelId(value: string | null) {
    this.setConfigValue("filled_sub_channel_id", value)
  }

  get adminRoleId(): string | null {
    return this.fetchConfigValue("admin_role_id")
  }
  set adminRoleId(value: string | null) {
    this.setConfigValue("admin_role_id", value)
  }

  get teachingRoleId(): string | null {
    return this.fetchConfigValue("teaching_role_id")
  }
  set teachingRoleId(value: string | null) {
    this.setConfigValue("teaching_role_id", value)
  }

  getAllInstructors(): Instructor[] {
    return this.database.query("SELECT * FROM instructors").as(Instructor).all()
  }
  getInstructor(id: number): Instructor | null {
    return (
      this.cachedInstructors.get(id) ??
      this.database
        .query("SELECT * FROM instructors WHERE id = ?")
        .as(Instructor)
        .get(id)
    )
  }
  getInstructorByDiscordId(discordId: string): Instructor | null {
    return this.database
      .query("SELECT * FROM instructors WHERE discord_id = ?")
      .as(Instructor)
      .get(discordId)
  }
  addInstructor(discordId: string, name: string, email: string): void {
    this.database
      .query(
        "INSERT INTO instructors (discord_id, name, email) VALUES (?, ?, ?)",
      )
      .run(discordId, name, email)
  }
  updateInstructor(instructor: Instructor): void {
    this.database
      .query(
        "UPDATE instructors SET discord_id = ?, name = ?, email = ? WHERE id = ?",
      )
      .run(
        instructor.discord_id,
        instructor.name,
        instructor.email,
        instructor.id,
      )
  }

  getAllCourses(): Course[] {
    return this.database.query("SELECT * FROM courses").as(Course).all()
  }
  getCourse(id: number): Course | null {
    return (
      this.cachedCourses.get(id) ??
      this.database
        .query("SELECT * FROM courses WHERE id = ?")
        .as(Course)
        .get(id)
    )
  }
  addCourse(
    id: number,
    module: number,
    duration: number,
    flags: number = 0,
  ): void {
    this.database
      .query(
        "INSERT INTO courses (id, module, duration, flags) VALUES (?, ?, ?, ?)",
      )
      .run(id, module, duration, flags)
  }
  updateCourse(course: Course): void {
    this.database
      .query(
        "UPDATE courses SET module = ?, duration = ?, flags = ? WHERE id = ?",
      )
      .run(course.module, course.duration, course.flags, course.id)
  }
  removeCourse(id: number): void {
    this.database.query("DELETE FROM courses WHERE id = ?").run(id)
  }

  addCourseInstructors(courseId: number, instructorIds: number[]): void {
    if (instructorIds.length === 0) return
    const placeholders = instructorIds.map(() => "(?, ?)").join(", ")
    const values = instructorIds.flatMap((instructorId) => [
      courseId,
      instructorId,
    ])
    this.database
      .query(
        `INSERT INTO course_instructors (course_id, instructor_id) VALUES ${placeholders}`,
      )
      .run(...values)
  }
  getCourseInstructors(courseId: number): Instructor[] {
    return this.database
      .query(
        `SELECT i.* FROM course_instructors ci
         JOIN instructors i ON ci.instructor_id = i.id
         WHERE ci.course_id = ?`,
      )
      .as(Instructor)
      .all(courseId)
  }
  removeCourseInstructor(courseId: number, instructorId: number): void {
    this.database
      .query(
        "DELETE FROM course_instructors WHERE course_id = ? AND instructor_id = ?",
      )
      .run(courseId, instructorId)
  }

  addCourseLesson(
    courseId: number,
    date: Date,
    name: string,
    abbrev: string,
    description: string = "",
  ): void {
    const changes = this.database
      .query(
        "INSERT INTO lessons (course_id, date_timestamp, name, abbrev, description) VALUES (?, ?, ?, ?, ?)",
      )
      .run(courseId, date.getTime(), name, abbrev, description)
    // add instructors same as the course
    const lessonId = changes.lastInsertRowid
    const instructors = this.getCourseInstructors(courseId)
    if (instructors.length > 0) {
      const placeholders = instructors.map(() => "(?, ?)").join(", ")
      const values = instructors.flatMap((instructor) => [
        lessonId,
        instructor.id,
      ])
      this.database
        .query(
          `INSERT INTO lesson_instructors (lesson_id, instructor_id) VALUES ${placeholders}`,
        )
        .run(...values)
    }
  }
  getCourseLessons(courseId: number): Lesson[] {
    return this.database
      .query("SELECT * FROM lessons WHERE course_id = ?")
      .as(Lesson)
      .all(courseId)
  }
  getAllCalendarOutdatedLessons(): Lesson[] {
    return this.database
      .query("SELECT * FROM lessons WHERE google_event_outdated = 1")
      .as(Lesson)
      .all()
  }
  getAllLessons(): Lesson[] {
    return this.database.query("SELECT * FROM lessons").as(Lesson).all()
  }
  getLesson(lessonId: number): Lesson | null {
    return this.database
      .query("SELECT * FROM lessons WHERE id = ?")
      .as(Lesson)
      .get(lessonId)
  }
  updateLesson(lesson: Lesson): void {
    this.database
      .query(
        "UPDATE lessons SET date_timestamp = ?, name = ?, abbrev = ?, google_event_id = ?, google_event_outdated = ?, description = ? WHERE id = ?",
      )
      .run(
        lesson.date.getTime(),
        lesson.name,
        lesson.abbrev,
        lesson.google_event_id,
        lesson.google_event_outdated,
        lesson.description,
        lesson.id,
      )
  }
  getLessonInstructors(lessonId: number): LessonInstructor[] {
    return this.database
      .query(
        `SELECT li.flags, i.* FROM lesson_instructors li
         JOIN instructors i ON li.instructor_id = i.id
         WHERE li.lesson_id = ?`,
      )
      .as(Instructor)
      .all(lessonId) as LessonInstructor[]
  }
  removeLessonInstructor(lessonId: number, instructorId: number): void {
    this.database
      .query(
        "DELETE FROM lesson_instructors WHERE lesson_id = ? AND instructor_id = ?",
      )
      .run(lessonId, instructorId)
  }
  addLessonInstructor(
    lessonId: number,
    instructorId: number,
    options: AddLessonInstructorOptions = {},
  ): void {
    const { isSub = false, isFreeWill = false } = options
    this.database
      .query(
        "INSERT INTO lesson_instructors (lesson_id, instructor_id, flags) VALUES (?, ?, ?)",
      )
      .run(lessonId, instructorId, (isSub ? 1 : 0) | (isFreeWill ? 2 : 0))
  }
  removeLesson(lessonId: number): void {
    this.database.query("DELETE FROM lessons WHERE id = ?").run(lessonId)
  }
  getLessonSubRequests(lessonId: number): SubRequest[] {
    return this.database
      .query("SELECT * FROM sub_requests WHERE lesson_id = ?")
      .as(SubRequest)
      .all(lessonId)
  }
  getLessonOpenSubRequests(lessonId: number): SubRequest[] {
    return this.database
      .query("SELECT * FROM sub_requests WHERE lesson_id = ? AND is_open = 1")
      .as(SubRequest)
      .all(lessonId)
  }

  getUserTimezone(discordId: string): string | null {
    return (
      this.database
        .query(
          "SELECT value FROM user_config WHERE user_id = ? AND key = 'timezone'",
        )
        .as(ConfigValue)
        .get(discordId)?.value || null
    )
  }
  setUserTimezone(discordId: string, timezone: string): void {
    this.database
      .query(
        "INSERT OR REPLACE INTO user_config (user_id, key, value) VALUES (?, 'timezone', ?)",
      )
      .run(discordId, timezone)
  }

  getInstructorLessons(instructorId: number): Lesson[] {
    return this.database
      .query(
        `SELECT l.* FROM lessons l
         JOIN lesson_instructors li ON l.id = li.lesson_id
         WHERE li.instructor_id = ?`,
      )
      .as(Lesson)
      .all(instructorId)
  }
  getFutureInstructorLessons(instructorId: number): Lesson[] {
    return this.database
      .query(
        `SELECT l.* FROM lessons l
         JOIN lesson_instructors li ON l.id = li.lesson_id
         WHERE li.instructor_id = ? AND l.date_timestamp > ?`,
      )
      .as(Lesson)
      .all(instructorId, Date.now())
  }

  addSubRequest(
    lessonId: number,
    instructorId: number,
    reason: string | null,
  ): number {
    return this.database
      .query(
        "INSERT INTO sub_requests (lesson_id, instructor_id, opened_at, reason) VALUES (?, ?, ?, ?)",
      )
      .run(lessonId, instructorId, Date.now(), reason).lastInsertRowid as number
  }
  getAllSubRequests(): SubRequest[] {
    return this.database
      .query("SELECT * FROM sub_requests")
      .as(SubRequest)
      .all()
  }
  getOpenSubRequests(): SubRequest[] {
    return this.database
      .query("SELECT * FROM sub_requests WHERE is_open = 1")
      .as(SubRequest)
      .all()
  }
  getSubRequest(id: number): SubRequest | null {
    return this.database
      .query("SELECT * FROM sub_requests WHERE id = ?")
      .as(SubRequest)
      .get(id)
  }
  updateSubRequest(subRequest: SubRequest) {
    this.database
      .query(
        "UPDATE sub_requests SET lesson_id = ?, instructor_id = ?, is_open = ?, opened_at = ?, reason = ?, sent_notification = ?, filled_by = ?, filled_at = ? WHERE id = ?",
      )
      .run(
        subRequest.lesson_id,
        subRequest.instructor_id,
        subRequest.is_open,
        subRequest.opened_at,
        subRequest.reason,
        subRequest.sent_notification,
        subRequest.filled_by,
        subRequest.filled_at,
        subRequest.id,
      )
  }

  getSubBotMessages(): string[] {
    return this.database
      .query("SELECT id AS value FROM sub_bot_messages")
      .as(ConfigValue)
      .all()
      .map((row) => row.value)
  }
  addSubBotMessages(messageIds: string[]): void {
    if (messageIds.length === 0) return
    const placeholders = messageIds.map(() => "(?)").join(", ")
    this.database
      .query(`INSERT INTO sub_bot_messages (id) VALUES ${placeholders}`)
      .run(...messageIds)
  }
  removeSubBotMessages(messageIds: string[]): void {
    if (messageIds.length === 0) return
    const placeholders = messageIds.map(() => "?").join(", ")
    this.database
      .query(`DELETE FROM sub_bot_messages WHERE id IN (${placeholders})`)
      .run(...messageIds)
  }

  getAllIncompleteFutureLessons(): Lesson[] {
    // less than 2 instructors
    return this.database
      .query(
        `SELECT * FROM lessons l
         WHERE l.date_timestamp > ? AND (
           SELECT COUNT(*) FROM lesson_instructors li2 WHERE li2.lesson_id = l.id
         ) < 2`,
      )
      .as(Lesson)
      .all(Date.now())
  }
  getAllFutureLessons(): Lesson[] {
    return this.database
      .query(`SELECT * FROM lessons l WHERE l.date_timestamp > ?`)
      .as(Lesson)
      .all(Date.now())
  }
}

export const db = new LiveDatabase(DB_FILENAME)

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS instructors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module INTEGER NOT NULL,
  duration INTEGER NOT NULL,  -- in minutes
  flags INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS course_instructors (
  course_id INTEGER NOT NULL,
  instructor_id INTEGER NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES instructors(id),
  PRIMARY KEY (course_id, instructor_id)
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  date_timestamp REAL NOT NULL,
  name TEXT NOT NULL,
  abbrev TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  google_event_id TEXT,
  google_event_outdated INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lessons_date_timestamp ON lessons (date_timestamp);
CREATE TABLE IF NOT EXISTS lesson_instructors (
  lesson_id INTEGER NOT NULL,
  instructor_id INTEGER NOT NULL,
  flags INTEGER NOT NULL DEFAULT 0,
  -- is_sub INTEGER NOT NULL DEFAULT 0, -- This is not used anymore, use flags instead
  -- 1 = is sub
  -- 2 = is free-will
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES instructors(id),
  PRIMARY KEY (lesson_id, instructor_id)
);
CREATE TABLE IF NOT EXISTS sub_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  instructor_id INTEGER NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1,
  opened_at REAL NOT NULL,
  filled_by INTEGER,
  filled_at REAL,
  reason TEXT,
  sent_notification INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES instructors(id),
  FOREIGN KEY (filled_by) REFERENCES instructors(id)
);
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- specifically discord related tables

CREATE TABLE IF NOT EXISTS user_config (
  user_id TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS sub_bot_messages (
  id TEXT PRIMARY KEY
);
`
