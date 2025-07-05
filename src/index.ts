import { Client, MessageFlags } from "discord.js"
import commands from "./commands"

const { DISCORD_TOKEN } = process.env

const client = new Client({
  intents: 131071, // All intents
})

client.once("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}!`)
})

client.on("interactionCreate", async (interaction) => {
  // handle slash commands
  if (interaction.isChatInputCommand()) {
    try {
      await commands.get(interaction.commandName)?.execute(interaction)
    } catch (error) {
      console.error("Error executing command:", error)
      await (
        interaction.replied || interaction.deferred
          ? interaction.followUp
          : interaction.reply
      )({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      })
    }
  }
})

client.login(DISCORD_TOKEN)
