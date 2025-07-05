import { Database } from "bun:sqlite"
import { Course } from "./models/course"

const { DB_FILENAME = "data.db" } = process.env

class ConfigValue {
  constructor(public value: string) {}
}

class LiveDatabase {
  private database: Database

  constructor(private filename: string) {
    this.database = new Database(filename)
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS instructors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module INTEGER NOT NULL
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
    `)
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
}

export const db = new LiveDatabase(DB_FILENAME)
