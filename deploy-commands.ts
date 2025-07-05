import { REST, Routes } from "discord.js"
import commands from "./src/commands"

const { DISCORD_CLIENT_ID, DISCORD_TOKEN, DEBUG_GUILD } = process.env

const rest = new REST().setToken(DISCORD_TOKEN!)

const route = process.argv.includes("--global")
  ? Routes.applicationCommands(DISCORD_CLIENT_ID!)
  : Routes.applicationGuildCommands(DISCORD_CLIENT_ID!, DEBUG_GUILD!)

await rest.put(route, {
  body: commands.mapValues((command) => command.command.toJSON()),
})

console.log(`Successfully registered ${commands.size} commands.`)
