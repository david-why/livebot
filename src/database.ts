import { Database } from "bun:sqlite"
import { Course } from "./models/course"
import { Instructor } from "./models/instructor"
import { Lesson } from "./models/lesson"
import { SubRequest } from "./models/sub_request"

const { DB_FILENAME = "data.db" } = process.env

class ConfigValue {
  constructor(public value: string) {}
}

class LiveDatabase {
  private database: Database

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

  getAllInstructors(): Instructor[] {
    return this.database.query("SELECT * FROM instructors").as(Instructor).all()
  }
  getInstructor(discordId: string): Instructor | null {
    return (
      this.database
        .query("SELECT * FROM instructors WHERE discord_id = ?")
        .as(Instructor)
        .get(discordId) || null
    )
  }
  addInstructor(discordId: string, name: string): void {
    this.database
      .query("INSERT INTO instructors (discord_id, name) VALUES (?, ?)")
      .run(discordId, name)
  }
  updateInstructor(instructor: Instructor): void {
    this.database
      .query("UPDATE instructors SET name = ? WHERE discord_id = ?")
      .run(instructor.name, instructor.discord_id)
  }

  getAllCourses(): Course[] {
    return this.database.query("SELECT * FROM courses").as(Course).all()
  }
  getCourse(id: number): Course | null {
    return (
      this.database
        .query("SELECT * FROM courses WHERE id = ?")
        .as(Course)
        .get(id) || null
    )
  }
  addCourse(id: number, module: number): void {
    // Insert new course
    this.database
      .query("INSERT INTO courses (id, module) VALUES (?, ?)")
      .run(id, module)
  }
  updateCourse(course: Course): void {
    this.database
      .query("UPDATE courses SET module = ? WHERE id = ?")
      .run(course.module, course.id)
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

  addCourseLesson(
    courseId: number,
    date: Date,
    name: string,
    abbrev: string,
  ): void {
    const changes = this.database
      .query(
        "INSERT INTO lessons (course_id, date_timestamp, name, abbrev) VALUES (?, ?, ?, ?)",
      )
      .run(courseId, date.getTime(), name, abbrev)
    // add instructors same as the course
    const lessonId = changes.lastInsertRowid
    const instructors = this.getCourseInstructors(courseId)
    if (instructors.length > 0) {
      const placeholders = instructors.map(() => "(?, ?, 0)").join(", ")
      const values = instructors.flatMap((instructor) => [
        lessonId,
        instructor.id,
      ])
      this.database
        .query(
          `INSERT INTO lesson_instructors (lesson_id, instructor_id, is_sub) VALUES ${placeholders}`,
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
  getLesson(lessonId: number): Lesson | null {
    return (
      this.database
        .query("SELECT * FROM lessons WHERE id = ?")
        .as(Lesson)
        .get(lessonId) || null
    )
  }
  updateLesson(lesson: Lesson): void {
    this.database
      .query(
        "UPDATE lessons SET date_timestamp = ?, name = ?, abbrev = ? WHERE id = ?",
      )
      .run(lesson.date.getTime(), lesson.name, lesson.abbrev, lesson.id)
  }
  getLessonInstructors(lessonId: number): Instructor[] {
    return this.database
      .query(
        `SELECT i.* FROM lesson_instructors li
         JOIN instructors i ON li.instructor_id = i.id
         WHERE li.lesson_id = ?`,
      )
      .as(Instructor)
      .all(lessonId)
  }
  deleteLessonInstructor(lessonId: number, instructorId: number): void {
    this.database
      .query(
        "DELETE FROM lesson_instructors WHERE lesson_id = ? AND instructor_id = ?",
      )
      .run(lessonId, instructorId)
  }
  addLessonInstructor(
    lessonId: number,
    instructorId: number,
    isSub: boolean = false,
  ): void {
    this.database
      .query(
        "INSERT INTO lesson_instructors (lesson_id, instructor_id, is_sub) VALUES (?, ?, ?)",
      )
      .run(lessonId, instructorId, isSub ? 1 : 0)
  }
  removeLesson(lessonId: number): void {
    this.database.query("DELETE FROM lessons WHERE id = ?").run(lessonId)
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
  getSubRequest(id: number): SubRequest | null {
    return (
      this.database
        .query("SELECT * FROM sub_requests WHERE id = ?")
        .as(SubRequest)
        .get(id) || null
    )
  }
  updateSubRequest(subRequest: SubRequest) {
    this.database
      .query(
        "UPDATE sub_requests SET lesson_id = ?, instructor_id = ?, is_open = ?, opened_at = ?, reason = ? WHERE id = ?",
      )
      .run(
        subRequest.lesson_id,
        subRequest.instructor_id,
        subRequest.is_open,
        subRequest.opened_at,
        subRequest.reason,
        subRequest.id,
      )
  }
}

export const db = new LiveDatabase(DB_FILENAME)

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS instructors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module INTEGER NOT NULL
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
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lesson_instructors (
  lesson_id INTEGER NOT NULL,
  instructor_id INTEGER NOT NULL,
  is_sub INTEGER NOT NULL DEFAULT 0,
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
  reason TEXT,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES instructors(id)
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
)
`
