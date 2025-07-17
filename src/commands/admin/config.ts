import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"
import { db } from "../../database"

export const command = new SlashCommandBuilder()
  .setName("config")
  .setDescription("[ADMIN] Configure the bot settings")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("sub-channel")
      .setDescription("[ADMIN] Set the channel for posting sub requests")
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
      .setDescription(
        "[ADMIN] Set the channel for posting sub request notifications for admins",
      )
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
      .setName("filled-sub-channel")
      .setDescription("[ADMIN] Set the channel for posting filled sub requests")
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
      .setName("admin-role")
      .setDescription("[ADMIN] Set the admin role")
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("The role to set as admin")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("teaching-role")
      .setDescription("[ADMIN] Set the teaching role")
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("The role to set as @Teaching")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("get").setDescription("[ADMIN] Get the current configuration"),
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand(true) as
    | "sub-channel"
    | "sub-notify-channel"
    | "filled-sub-channel"
    | "admin-role"
    | "teaching-role"
    | "get"
  if (subcommand == "sub-channel") {
    db.subChannelId = interaction.options.getChannel("channel", true).id
    await interaction.reply({
      content: `Sub channel set to <#${db.subChannelId}>.`,
    })
  } else if (subcommand == "sub-notify-channel") {
    db.subNotifyChannelId = interaction.options.getChannel("channel", true).id
    await interaction.reply({
      content: `Sub notify channel set to <#${db.subNotifyChannelId}>.`,
    })
  } else if (subcommand == "filled-sub-channel") {
    db.filledSubChannelId = interaction.options.getChannel("channel", true).id
    await interaction.reply({
      content: `Filled sub channel set to <#${db.filledSubChannelId}>.`,
    })
  } else if (subcommand == "admin-role") {
    db.adminRoleId = interaction.options.getRole("role", true).id
    await interaction.reply({
      content: `Admin role set to <@&${db.adminRoleId}>.`,
      allowedMentions: { roles: [] },
    })
  } else if (subcommand == "teaching-role") {
    db.teachingRoleId = interaction.options.getRole("role", true).id
    await interaction.reply({
      content: `Teaching role set to <@&${db.teachingRoleId}>.`,
      allowedMentions: { roles: [] },
    })
  } else if (subcommand == "get") {
    const subChannel = db.subChannelId ? `<#${db.subChannelId}>` : "not set"
    const subNotifyChannel = db.subNotifyChannelId
      ? `<#${db.subNotifyChannelId}>`
      : "not set"
    const filledSubChannel = db.filledSubChannelId
      ? `<#${db.filledSubChannelId}>`
      : "not set"
    const adminRole = db.adminRoleId ? `<@&${db.adminRoleId}>` : "not set"
    const teachingRole = db.teachingRoleId
      ? `<@&${db.teachingRoleId}>`
      : "not set"
    await interaction.reply({
      content:
        `Current configuration:\n` +
        `- Sub channel: ${subChannel}\n` +
        `- Sub notify channel: ${subNotifyChannel}\n` +
        `- Filled sub channel: ${filledSubChannel}\n` +
        `- Admin role: ${adminRole}\n` +
        `- Teaching role: ${teachingRole}`,
      allowedMentions: { roles: [] },
    })
  }
}
