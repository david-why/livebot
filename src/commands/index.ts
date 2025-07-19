import {
  ChatInputCommandInteraction,
  Collection,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  SharedSlashCommand,
  type ClientEvents,
} from "discord.js"

declare global {
  type ClientEventHandlers = {
    [K in keyof ClientEvents]: (...args: ClientEvents[K]) => Promise<unknown>
  }
}

function register<T extends { command: { name: string } }>(
  commands: Collection<string, T>,
  command: T,
): void {
  commands.set(command.command.name, command)
}

import * as adminsub from "./admin/adminsub"
import * as calendar from "./admin/calendar"
import * as config from "./admin/config"
import * as course from "./admin/course"
import * as debug from "./admin/debug"
import * as exportCommand from "./admin/export"
import * as instructor from "./admin/instructor"
import * as lesson from "./admin/lesson"
import * as lessons from "./lessons"
import * as sub from "./sub"
import * as timezone from "./timezone"

const commands = new Collection<
  string,
  {
    command: SharedSlashCommand
    execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>
    events?: Partial<ClientEventHandlers>
  }
>()

register(commands, adminsub)
register(commands, calendar)
register(commands, config)
register(commands, course)
register(commands, debug)
register(commands, exportCommand)
register(commands, instructor)
register(commands, lesson)
register(commands, lessons)
register(commands, sub)
register(commands, timezone)

export default commands

export const contextCommands = new Collection<
  string,
  {
    command: ContextMenuCommandBuilder
    execute: (interaction: ContextMenuCommandInteraction) => Promise<unknown>
    events?: Partial<ClientEventHandlers>
  }
>()
