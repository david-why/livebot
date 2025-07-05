import { Database } from "bun:sqlite"

const { DB_FILENAME = "data.db" } = process.env

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
    `)
  }
}

export const db = new LiveDatabase(DB_FILENAME)
