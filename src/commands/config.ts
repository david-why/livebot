import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js"
import { db } from "../database"

export const command = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configure the bot settings")
  .addSubcommand((sub) =>
    sub
      .setName("sub-channel")
      .setDescription("Set the channel for posting sub request summaries")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to set")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("get").setDescription("Get the current configuration"),
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand(true) as
    | "sub-channel"
    | "get"
  if (subcommand == "sub-channel") {
    db.subChannelId = interaction.options.getChannel("channel", true).id
    await interaction.reply({
      content: `Sub channel set to <#${db.subChannelId}>`,
      flags: "Ephemeral",
    })
  } else if (subcommand == "get") {
    const subChannel = db.subChannelId ? `<#${db.subChannelId}>` : "not set"
    await interaction.reply({
      content: `Current configuration:\n- Sub channel: ${subChannel}`,
      flags: "Ephemeral",
    })
  }
}
