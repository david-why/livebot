import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextChannel,
} from "discord.js"
import { db } from "../database"
import { formatTimestamp } from "../utils/format"
import { modules } from "../consts"

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
          .setChoices(modules),
      )
      .addUserOption((option) =>
        option
          .setName("instructor1")
          .setDescription("First instructor for the course")
          .setRequired(true),
      )
      .addUserOption((option) =>
        option
          .setName("instructor2")
          .setDescription("Second instructor for the course")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("edit")
      .setDescription("Edit an existing course")
      .addNumberOption((option) =>
        option
          .setName("id")
          .setDescription("ID of the course to edit")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addNumberOption((option) =>
        option
          .setName("module")
          .setDescription("Module number of the course")
          .setRequired(false)
          .setChoices(modules),
      )
      .addBooleanOption((option) =>
        option
          .setName("dates")
          .setDescription("Whether to edit the course dates")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove an existing course")
      .addNumberOption((option) =>
        option
          .setName("id")
          .setDescription("ID of the course to remove")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand(true) as
    | "list"
    | "info"
    | "add"
    | "edit"
    | "remove"
  if (subcommand === "list") {
    const courses = db.getAllCourses()
    if (courses.length === 0) {
      return interaction.reply({
        content: "No courses found.",
      })
    }
    const courseList = courses
      .map((course) => `- LIVE #${course.id} (Module ${course.module})`)
      .join("\n")
    await interaction.reply({
      content: `Existing courses:\n${courseList}`,
    })
  } else if (subcommand === "add") {
    const id = interaction.options.getNumber("id", true)
    const module = interaction.options.getNumber("module", true)
    const instructor1User = interaction.options.getUser("instructor1", true)
    const instructor2User = interaction.options.getUser("instructor2", true)

    // Check if course already exists
    const existingCourse = db.getCourse(id)
    if (existingCourse) {
      return interaction.reply({
        content: `Course with ID ${id} already exists.`,
        flags: "Ephemeral",
      })
    }

    const instructorUsers = [instructor1User, instructor2User]
    const instructorIds: number[] = []
    for (const user of instructorUsers) {
      // Check if instructor already exists
      const instructor = db.getInstructor(user.id)
      if (!instructor) {
        return interaction.reply({
          content: `Instructor <@${user.id}> is not registered. Please register them first using the \`/instructor add\` command.`,
          flags: "Ephemeral",
        })
      }
      instructorIds.push(instructor.id)
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
      if (message.channel.id !== interaction.channelId) return
      if (message.author.id !== interaction.user.id) return

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

        // Parse date
        const [datePart, timePart] = trimmed.split(" ")
        const dateTimeString = `${datePart}T${timePart}:00Z` // Append seconds and Z for UTC
        const date = new Date(dateTimeString)
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
        db.addCourseLesson(id, date)
      }
      db.addCourseInstructors(id, instructorIds)

      handlerCleanup()
      await interaction.followUp({
        content: `Course LIVE #${id} M${module} created successfully with ${dates.length} date(s).`,
      })
      return
    }

    const timeout = setTimeout(
      async () => {
        await interaction.followUp({
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
    const instructors = db.getCourseInstructors(id)
    const lessons = db.getCourseLessons(id)
    const scheduledDates = lessons
      .map((lesson) => `- ${formatTimestamp(lesson.date)}`)
      .join("\n")
    await interaction.reply({
      content:
        `Course LIVE #${id} (Module ${course.module})\n` +
        `Instructors: ${instructors.map((i) => `<@${i.discord_id}>`).join(", ")}\n` +
        `Scheduled dates:\n${scheduledDates}`,
      allowedMentions: { users: [] },
    })
  } else if (subcommand === "edit") {
    const id = interaction.options.getNumber("id", true)
    const module = interaction.options.getNumber("module")
    const editDates = interaction.options.getBoolean("dates") ?? false

    const course = db.getCourse(id)
    if (!course) {
      return interaction.reply({
        content: `Course with ID ${id} not found.`,
        flags: "Ephemeral",
      })
    }

    if (module) course.module = module
    db.updateCourse(course)

    if (editDates) {
      const userTimezone = db.getUserTimezone(interaction.user.id) ?? "UTC"
      const lessons = db.getCourseLessons(id)
      const response = await interaction.reply({
        content: `Please select a lesson from LIVE #${id} below to edit.\n\n-# Times are in \`${userTimezone}\`; use /timezone to change it.`,
        components: [
          new ActionRowBuilder()
            .addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`edit`)
                .setPlaceholder("Select a lesson to edit")
                .addOptions(
                  lessons.map((lesson) => ({
                    label: lesson.date.toLocaleString("en-US", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: userTimezone,
                    }),
                    value: lesson.id.toString(),
                  })),
                ),
            )
            .toJSON(),
          new ActionRowBuilder()
            .addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`delete`)
                .setPlaceholder("Select a lesson to delete")
                .addOptions(
                  lessons.map((lesson) => ({
                    label: lesson.date.toLocaleString("en-US", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: userTimezone,
                    }),
                    value: lesson.id.toString(),
                  })),
                ),
            )
            .toJSON(),
        ],
        withResponse: true,
      })
      const message = response.resource!.message!
      let selectedLessonId: number
      let action: "edit" | "delete"
      try {
        const result = await message.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          time: 10 * 60 * 1000,
        }) // 10 minutes
        await result.deferUpdate()
        selectedLessonId = Number(result.values[0])
        action = result.customId as "edit" | "delete"
      } catch {
        return interaction.editReply({
          components: [],
        })
      }
      const selectedLesson = lessons.find(
        (lesson) => lesson.id === selectedLessonId,
      )!
      if (action === "edit") {
        const response = await interaction.followUp({
          content: `Please enter the new date for the lesson on ${selectedLesson.date.toLocaleString(
            "en-US",
            {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: userTimezone,
            },
          )} (in UTC):\n\nUse \`cancel\` to cancel.`,
          withResponse: true,
        })
        let newDate: Date | null = null
        try {
          const message = await (response.channel as TextChannel).awaitMessages(
            {
              filter: (m) => m.author.id === interaction.user.id,
              max: 1,
              time: 10 * 60 * 1000,
              errors: ["time"],
            },
          )
          const content = message.first()!.content.trim()
          if (content === "cancel") {
            return interaction.followUp("Canceled.")
          }
          // FIXME: Parse as UTC date like in /course add
          const parsedDate = Date.parse(content)
          if (!isNaN(parsedDate)) {
            newDate = new Date(parsedDate)
          }
        } catch {
          return interaction.followUp({
            content: "No date provided in the given time. Please try again.",
          })
        }
        if (!newDate) {
          return interaction.followUp({
            content: "Invalid date format. Please use `YYYY-MM-DD HH:MM`.",
          })
        }
        // Update lesson date
        selectedLesson.date = newDate
        db.updateLesson(selectedLesson)
        return interaction.followUp({
          content: `Lesson has been updated successfully.`,
        })
      } else if (action === "delete") {
        // Delete lesson
        db.removeLesson(selectedLessonId)
        return interaction.followUp({
          content: `Lesson has been deleted successfully.`,
        })
      }
    } else {
      await interaction.reply({
        content: `Course LIVE #${id} has been updated successfully.`,
      })
    }
  } else if (subcommand === "remove") {
    const id = interaction.options.getNumber("id", true)
    const course = db.getCourse(id)
    if (!course) {
      return interaction.reply({
        content: `Course with ID ${id} not found.`,
        flags: "Ephemeral",
      })
    }

    // Remove course and its lessons
    db.removeCourse(id)

    await interaction.reply({
      content: `Course LIVE #${id} has been removed successfully.`,
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
