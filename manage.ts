import { REST, Routes } from "discord.js"
import { parseArgs } from "util"
import commands, { contextCommands } from "./src/commands"
import { db } from "./src/database"

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
  console.error(`Unknown command: ${command}`)
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

  console.log(`Successfully registered ${commands.size + contextCommands.size} commands.`)
} else if (command === "initdb") {
  db.createTables()
  console.log(`Database initialized at ${DB_FILENAME}.`)
}
