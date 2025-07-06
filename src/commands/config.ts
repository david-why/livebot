import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"
import { db } from "../database"

export const command = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configure the bot settings")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("sub-channel")
      .setDescription("Set the channel for posting sub request summaries")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to set")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("sub-notify-channel")
      .setDescription("Set the channel for posting sub request notifications")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to set")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("get").setDescription("Get the current configuration"),
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand(true) as
    | "sub-channel"
    | "sub-notify-channel"
    | "get"
  if (subcommand == "sub-channel") {
    db.subChannelId = interaction.options.getChannel("channel", true).id
    await interaction.reply({
      content: `Sub channel set to <#${db.subChannelId}>`,
    })
  } else if (subcommand == "sub-notify-channel") {
    db.subNotifyChannelId = interaction.options.getChannel("channel", true).id
    await interaction.reply({
      content: `Sub notify channel set to <#${db.subNotifyChannelId}>`,
    })
  } else if (subcommand == "get") {
    const subChannel = db.subChannelId ? `<#${db.subChannelId}>` : "not set"
    const subNotifyChannel = db.subNotifyChannelId
      ? `<#${db.subNotifyChannelId}>`
      : "not set"
    await interaction.reply({
      content:
        `Current configuration:\n` +
        `- Sub channel: ${subChannel}\n` +
        `- Sub notify channel: ${subNotifyChannel}`,
    })
  }
}
