import { Database } from "bun:sqlite"
import { Course } from "./models/course"
import { CourseCreationFlow } from "./models/course_creation"
import { Instructor } from "./models/instructor"

const { DB_FILENAME = "data.db" } = process.env

class ConfigValue {
  constructor(public value: string) {}
}

class LiveDatabase {
  private database: Database

  constructor(filename: string) {
    this.database = new Database(filename)
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
    return this.database
      .query("SELECT * FROM instructors")
      .as(Instructor)
      .all()
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
    return this.database
      .query("SELECT id, module FROM courses")
      .as(Course)
      .all()
  }
  getCourse(id: number): Course | null {
    return (
      this.database
        .query("SELECT id, module FROM courses WHERE id = ?")
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

  addCourseCreation(
    channelId: string,
    userId: string,
    webhookId: string,
    courseId: number,
    module: number,
  ) {
    const now = Date.now()
    this.database
      .query(
        `INSERT INTO d_course_creation (channel_id, user_id, webhook_id, course_id, module, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(channelId, userId, webhookId, courseId, module, now)
  }
  getCourseCreation(channelId: string, userId: string) {
    return this.database
      .query(
        `SELECT * FROM d_course_creation WHERE channel_id = ? AND user_id = ?`,
      )
      .as(CourseCreationFlow)
      .get(channelId, userId)
  }
  removeCourseCreation(channelId: string, userId: string) {
    this.database
      .query(
        `DELETE FROM d_course_creation WHERE channel_id = ? AND user_id = ?`,
      )
      .run(channelId, userId)
  }

  addCourseDate(courseId: number, date: Date): void {
    this.database
      .query("INSERT INTO lessons (course_id, date) VALUES (?, ?)")
      .run(courseId, date.getTime())
  }
  getCourseDates(courseId: number): Date[] {
    return this.database
      .query<{ date: number }, number>(
        "SELECT date FROM lessons WHERE course_id = ?",
      )
      .all(courseId)
      .map((row) => new Date(row.date))
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
  FOREIGN KEY (course_id) REFERENCES courses(id),
  FOREIGN KEY (instructor_id) REFERENCES instructors(id),
  PRIMARY KEY (course_id, instructor_id)
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  date REAL NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id)
);
CREATE TABLE IF NOT EXISTS lesson_instructors (
  lesson_id INTEGER NOT NULL,
  instructor_id INTEGER NOT NULL,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  FOREIGN KEY (instructor_id) REFERENCES instructors(id),
  PRIMARY KEY (lesson_id, instructor_id)
);
CREATE TABLE IF NOT EXISTS lesson_sub_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  instructor_id INTEGER NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1,
  opened_at REAL NOT NULL,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  FOREIGN KEY (instructor_id) REFERENCES instructors(id)
);
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- specifically discord related tables

CREATE TABLE IF NOT EXISTS d_course_creation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  course_id INTEGER NOT NULL,
  module INTEGER NOT NULL,
  -- stage 0: waiting for dates
  stage INTEGER NOT NULL DEFAULT 0,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_d_course_creation_channel_user ON d_course_creation (channel_id, user_id);
`
