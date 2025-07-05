import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"
import { db } from "../database"

export const command = new SlashCommandBuilder()
  .setName("course")
  .setDescription("Manage and view courses")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all courses"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Get information about a specific course")
      .addNumberOption((option) =>
        option
          .setName("id")
          .setDescription("ID of the course")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a new course")
      .addNumberOption((option) =>
        option
          .setName("id")
          .setDescription("ID of the course")
          .setRequired(true),
      )
      .addNumberOption((option) =>
        option
          .setName("module")
          .setDescription("Module number of the course")
          .setRequired(true)
          .setChoices(
            [0, 1, 2, 3, 4, 5].map((m) => ({
              name: `Module ${m}`,
              value: m,
            })),
          ),
      ),
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand(true) as "list" | "add"
  if (subcommand === "list") {
    const courses = db.getAllCourses()
    if (courses.length === 0) {
      return interaction.reply({
        content: "No courses found.",
        flags: "Ephemeral",
      })
    }
    const courseList = courses
      .map((course) => `- LIVE #${course.id} (Module ${course.module})`)
      .join("\n")
    await interaction.reply({
      content: `Existing courses:\n${courseList}`,
      flags: "Ephemeral",
    })
  } else if (subcommand === "add") {
    const id = interaction.options.getNumber("id", true)
    const module = interaction.options.getNumber("module", true)

    // Check if course already exists
    const existingCourse = db.getCourse(id)
    if (existingCourse) {
      return interaction.reply({
        content: `Course with ID ${id} already exists.`,
        flags: "Ephemeral",
      })
    }

    await interaction.reply({
      content:
        `Please enter the dates for LIVE #${id} M${module}, one date per line, in the following format:\n\n` +
        "`YYYY-MM-DD HH:MM` (e.g. `2025-07-06 20:00`)\n\n" +
        "You can also use `cancel` to cancel the course creation. All dates should be in UTC.",
    })

    const handlerCleanup = () => {
      interaction.client.off("messageCreate", handler)
      clearTimeout(timeout)
    }

    const handler: ClientEventHandlers["messageCreate"] = async (message) => {
      if (message.author.bot) return

      // Check for cancellation
      if (message.content.toLowerCase() === "cancel") {
        handlerCleanup()
        await message.reply({
          content: "Course creation cancelled.",
        })
        return
      }

      // Process date input
      const dates: Date[] = []
      const lines = message.content.split("\n")
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue // Skip empty lines

        const date = new Date(trimmed)
        if (isNaN(date.getTime())) {
          await message.delete()
          return message.reply({
            content: "Invalid date format. Please use `YYYY-MM-DD HH:MM`.",
          })
        }

        dates.push(date)
      }

      db.addCourse(id, module)
      for (const date of dates) {
        db.addCourseDate(id, date)
      }

      handlerCleanup()
      await interaction.followUp({
        content: `Course LIVE #${id} M${module} created successfully with ${dates.length} date(s).`,
      })
      return
    }

    const timeout = setTimeout(
      () => {
        interaction.followUp({
          content: "Course creation timed out. Please try again.",
        })
        interaction.client.off("messageCreate", handler)
      },
      10 * 60 * 1000,
    ) // 10 minutes

    interaction.client.on("messageCreate", handler)
  } else if (subcommand === "info") {
    const id = interaction.options.getNumber("id", true)
    const course = db.getCourse(id)
    if (!course) {
      return interaction.reply({
        content: `Course with ID ${id} not found.`,
        flags: "Ephemeral",
      })
    }
    const dates = db.getCourseDates(id)
    if (dates.length === 0) {
      return interaction.reply({
        content: `Course LIVE #${id} (Module ${course.module}) has no dates scheduled.`,
      })
    }
    const dateList = dates
      .map((date) => `- ${date.toISOString().replace("T", " ")}`)
      .join("\n")
    await interaction.reply({
      content: `Course LIVE #${id} (Module ${course.module}) has the following dates scheduled:\n${dateList}`,
    })
  }
}

export const events = {
  interactionCreate: async (interaction) => {
    if (!interaction.isAutocomplete()) return

    if (interaction.commandName !== "course") return

    if (interaction.options.getSubcommand(true) !== "info") return

    const focused = interaction.options.getFocused(true)
    if (focused.name !== "id") return

    const courses = db.getAllCourses()
    const choices = courses
      .map((course) => ({
        name: `LIVE #${course.id} (Module ${course.module})`,
        value: course.id,
      }))
      .filter((choice) =>
        choice.name.toLowerCase().includes(focused.value.toLowerCase()),
      )

    await interaction.respond(choices)
  },
} satisfies Partial<ClientEventHandlers>
