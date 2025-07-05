import { Client } from "discord.js"

const { DISCORD_TOKEN } = process.env

const client = new Client({
  intents: 131071, // All intents
})

client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag}!`)
})

client.login(DISCORD_TOKEN)
