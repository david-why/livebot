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

    // Insert new course
    db.addCourse(id, module)
    await interaction.reply({
      content: `Course #${id} (Module ${module}) added successfully.`,
      flags: "Ephemeral",
    })
  }
}

export const events = {
  messageCreate: async (message) => {
    console.log(message.content)
  },
} satisfies ClientEventHandlers
