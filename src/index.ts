import { Client } from "discord.js"
import commands, { contextCommands } from "./commands"
import { formatOptions } from "./utils/format"

const { DISCORD_TOKEN } = process.env

const client = new Client({
  intents: 131071, // All intents
})

for (const command of commands.values()) {
  if (command.events) {
    for (const [event, handler] of Object.entries(command.events)) {
      client.on(event, handler)
    }
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}!`)
})

client.on("debug", (info) => {
  console.debug(info)
})

client.on("warn", (info) => {
  console.warn(info)
})

client.on("error", (error) => {
  console.error(error.message)
  console.error(error.stack)
})

client.on("interactionCreate", async (interaction) => {
  // handle slash commands
  let handler: Promise<unknown> | undefined
  if (interaction.isChatInputCommand()) {
    console.log(
      `[SLASH] /${interaction.commandName}`,
      formatOptions(interaction.options.data),
      `(@${interaction.user.tag}, <#${interaction.channelId}>)`,
    )
    handler = commands.get(interaction.commandName)?.execute(interaction)
  } else if (interaction.isContextMenuCommand()) {
    // handle context menu commands
    console.log(
      `[CNTXT] ${interaction.commandName} (@${interaction.user.tag}, <#${interaction.channelId}>)`,
    )
    handler = contextCommands.get(interaction.commandName)?.execute(interaction)
  }
  try {
    await handler
  } catch (error) {
    console.error("Error executing context command:", error)
    if (interaction.isRepliable()) {
      await (
        interaction.replied || interaction.deferred
          ? interaction.followUp
          : interaction.reply
      ).call(interaction, {
        content: "There was an error while executing this command.",
        flags: "Ephemeral",
      })
    }
  }
})

console.log("Starting bot...")

client.login(DISCORD_TOKEN)
