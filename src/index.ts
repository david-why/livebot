import { Client } from "discord.js"
import commands from "./commands"
import { formatOptions } from "./utils/format"

const { DISCORD_TOKEN } = process.env

const client = new Client({
  intents: 131071, // All intents
})

client.once("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}!`)
  for (const command of commands.values()) {
    if (command.events) {
      for (const [event, handler] of Object.entries(command.events)) {
        client.on(event, handler)
      }
    }
  }
})

client.on("error", (error) => {
  console.error(error)
})

client.on("interactionCreate", async (interaction) => {
  // handle slash commands
  if (interaction.isChatInputCommand()) {
    console.log(
      `[SLASH] /${interaction.commandName}`,
      formatOptions(interaction.options.data),
      `(@${interaction.user.tag}, <#${interaction.channelId}>)`,
    )
    try {
      await commands.get(interaction.commandName)?.execute(interaction)
    } catch (error) {
      console.error("Error executing command:", error)
      await (
        interaction.replied || interaction.deferred
          ? interaction.followUp
          : interaction.reply
      )({
        content: "There was an error while executing this command.",
        flags: "Ephemeral",
      })
    }
  }
})

console.log("Starting bot...")

client.login(DISCORD_TOKEN)
