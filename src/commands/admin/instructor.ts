import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ContainerBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js"
import { db } from "../../database"
import { formatInstructor } from "../../utils/format"
import { paginate } from "../../utils/paginate"

export const command = new SlashCommandBuilder()
  .setName("instructor")
  .setDescription("[ADMIN] Manage LIVE instructors")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("[ADMIN] List all instructors"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("[ADMIN] Add a new instructor")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to add as an instructor")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("email")
          .setDescription("The email of the instructor")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("[ADMIN] Get information about a specific instructor")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The instructor to get info about")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("edit")
      .setDescription("[ADMIN] Edit an instructor's information")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The instructor to edit")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("name").setDescription("The new name of the instructor"),
      ),
  )

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const subcommand = interaction.options.getSubcommand(true) as
    | "list"
    | "add"
    | "info"
    | "edit"

  if (subcommand === "list") {
    const instructors = db.getAllInstructors()
    if (instructors.length === 0) {
      await interaction.reply({
        content: "No instructors found.",
        flags: "Ephemeral",
      })
      return
    }
    await interaction.reply(getInstructorListMessage(0))
  } else if (subcommand === "add") {
    const user = interaction.options.getUser("user", true)
    const email = interaction.options.getString("email", true)
    const name = user.displayName
    db.addInstructor(user.id, name, email)
    await interaction.reply({
      content: `Instructor ${name} (<@${user.id}>) has been added.`,
      allowedMentions: { users: [] },
    })
  } else if (subcommand === "info") {
    const user = interaction.options.getUser("user", true)
    const instructor = db.getInstructorByDiscordId(user.id)
    if (!instructor) {
      await interaction.reply({
        content: `User <@${user.id}> is not an instructor.`,
        flags: "Ephemeral",
      })
      return
    }
    await interaction.reply({
      content: `Instructor Info:\nName: ${instructor.name}\nUser: ${instructor.discord_id ? `<@${instructor.discord_id}>` : "Unknown"}`,
      allowedMentions: { users: [] },
    })
  } else if (subcommand === "edit") {
    const user = interaction.options.getUser("user", true)
    const name = interaction.options.getString("name")
    const instructor = db.getInstructorByDiscordId(user.id)
    if (!instructor) {
      await interaction.reply({
        content: `User <@${user.id}> is not an instructor.`,
        flags: "Ephemeral",
      })
      return
    }
    await interaction.deferReply()
    if (name) instructor.name = name
    db.updateInstructor(instructor)
    if (name) {
      const lessons = db.getInstructorLessons(instructor.id)
      for (const lesson of lessons) {
        lesson.google_event_outdated = 1
        db.updateLesson(lesson)
      }
    }
    await interaction.editReply({
      content: `Instructor ${formatInstructor(instructor)} has been updated.`,
      allowedMentions: { users: [] },
    })
  }
}

export const events = {
  interactionCreate: async (interaction) => {
    if (!interaction.isButton()) return
    const match = interaction.customId.match(/^instructors_list_page_(\d+)$/)
    if (!match) return
    const page = parseInt(match[1]!, 10)
    const message = getInstructorListMessage(page)
    return interaction.update({ ...message, flags: "IsComponentsV2" })
  },
} satisfies Partial<ClientEventHandlers>

function getInstructorListMessage(page: number) {
  const instructors = db.getAllInstructors()
  const flags = ["IsComponentsV2", "Ephemeral"] as const
  if (instructors.length === 0) {
    return {
      flags,
      components: [
        new TextDisplayBuilder().setContent("No instructors found."),
      ],
    } as const
  }
  const paginatedInstructors = paginate(
    instructors.map((i) => ({
      content: `- ${formatInstructor(i, { discord: false })} (${formatInstructor(i)})`,
    })),
  )
  if (page < 0 || page >= paginatedInstructors.length) {
    page = 0
  }
  const titleText = new TextDisplayBuilder().setContent(`## Instructors`)
  const instructorsText = new TextDisplayBuilder().setContent(
    `${paginatedInstructors[page]!.content}`,
  )
  const pageText = new TextDisplayBuilder().setContent(
    `-# Page ${page + 1} of ${paginatedInstructors.length}`,
  )
  const prevPage = new ButtonBuilder()
    .setCustomId(`instructors_list_page_${page - 1}`)
    .setLabel("Last page")
    .setEmoji("◀️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0)
  const nextPage = new ButtonBuilder()
    .setCustomId(`instructors_list_page_${page + 1}`)
    .setLabel("Next page")
    .setEmoji("▶️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === paginatedInstructors.length - 1)
  const actionRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    prevPage,
    nextPage,
  )
  const container = new ContainerBuilder()
    .addTextDisplayComponents(titleText, instructorsText, pageText)
    .addActionRowComponents(actionRow1)
  return {
    flags,
    components: [container],
    allowedMentions: { users: [] },
  } as const
}
