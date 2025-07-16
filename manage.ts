import { REST, Routes } from "discord.js"
import { parseArgs } from "util"
import commands, { contextCommands } from "./src/commands"
import { db } from "./src/database"
import { authenticate } from "@google-cloud/local-auth"
import { readFile } from "fs/promises"
import { getClient } from "./src/services/calendar"
import { google } from "googleapis"

const { DISCORD_CLIENT_ID, DISCORD_TOKEN, DEBUG_GUILD, DB_FILENAME } =
  process.env

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    global: {
      type: "boolean",
      short: "g",
      description: "Register commands globally instead of in a specific guild",
    },
  },
})

const command = positionals[0]
if (!command) {
  console.error(`No command provided.`)
  process.exit(1)
}

if (command === "deploy") {
  const rest = new REST().setToken(DISCORD_TOKEN!)

  const route = values.global
    ? Routes.applicationCommands(DISCORD_CLIENT_ID!)
    : Routes.applicationGuildCommands(DISCORD_CLIENT_ID!, DEBUG_GUILD!)

  await rest.put(route, {
    body: [...commands.values(), ...contextCommands.values()].map((command) =>
      command.command.toJSON(),
    ),
  })

  console.log(
    `Successfully registered ${commands.size + contextCommands.size} commands.`,
  )
} else if (command === "initdb") {
  db.createTables()
  console.log(`Database initialized at ${DB_FILENAME}.`)
} else if (command == "authgoogle") {
  if (positionals.length < 2) {
    console.error("Usage: manage.ts authgoogle <path-to-credentials.json>")
    process.exit(1)
  }
  const credentialsPath = positionals[1]!

  const keys = JSON.parse(await readFile(credentialsPath, "utf-8"))
  const key = keys.installed || keys.web
  if (!key) {
    console.error(
      "Invalid credentials file. Ensure it contains 'installed' or 'web' key.",
    )
    process.exit(1)
  }

  const client = await authenticate({
    scopes: ["https://www.googleapis.com/auth/calendar"],
    keyfilePath: credentialsPath,
  })
  const credentials = {
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  }
  db.googleCalendarCredentials = JSON.stringify(credentials)
  console.log("Google Calendar credentials saved to the database.")
} else if (command == "googletest") {
  const auth = getClient()
  const calendar = google.calendar({ version: "v3", auth })
  // console.log(items)
  const calendarId = process.env.CALENDAR_ID || "primary"
  const data = await calendar.events.list({
    calendarId: calendarId,
    timeMin: new Date().toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  })
  const event = data.data.items![0]!
  // const result = await calendar.events.patch({
  //   calendarId: calendarId,
  //   eventId: event.id!,
  //   requestBody: {
  //     extendedProperties: {
  //       shared: {
  //         test: "This is a test property",
  //       }
  //     }
  //   },
  // })
  console.log(event)
}
