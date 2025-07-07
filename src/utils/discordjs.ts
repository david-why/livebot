import {
  ApplicationCommandOptionBase,
  ApplicationCommandOptionWithAutocompleteMixin,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type ApplicationCommandOptionChoiceData,
  type SlashCommandSubcommandsOnlyBuilder,
} from "discord.js"

type SlashCommandHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<unknown>

type AutocompleteHandler = (
  interaction: AutocompleteInteraction,
) => Promise<readonly ApplicationCommandOptionChoiceData[]>

class SubcommandExecuteBuilder {
  constructor(
    private _setHandler: (handler: SlashCommandHandler) => void,
    private builder: SlashCommandSubcommandBuilder,
  ) {}

  setHandler(handler: SlashCommandHandler): SlashCommandSubcommandBuilder {
    this._setHandler(handler)
    return this.builder
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function wrapEventHandler<Params extends any[]>(
  handler: ((...args: Params) => Promise<any>) | undefined,
  outer: (...args: Params) => Promise<any>,
): (...args: Params) => Promise<any> {
  return async (...args: Params): Promise<any> => {
    await outer(...args)
    return handler?.(...args)
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function createCommandGroup(
  builder: (builder: SlashCommandBuilder) => SlashCommandBuilder,
  subcommands: Record<
    string,
    (builder: SubcommandExecuteBuilder) => SlashCommandSubcommandBuilder
  >,
  options: {
    autocomplete?: Record<string, Record<string, AutocompleteHandler>>
    events?: Partial<ClientEventHandlers>
  } = {},
): {
  command: SlashCommandSubcommandsOnlyBuilder
  execute: SlashCommandHandler
  events: Partial<ClientEventHandlers>
} {
  const { autocomplete = {}, events = {} } = options
  let subcommanded: SlashCommandSubcommandsOnlyBuilder = builder(
    new SlashCommandBuilder(),
  )
  const handlers: Record<string, SlashCommandHandler> = {}
  for (const [name, subcommand] of Object.entries(subcommands)) {
    const subcommandBuilder = subcommand(
      new SubcommandExecuteBuilder((handler) => {
        handlers[name] = handler
      }, new SlashCommandSubcommandBuilder().setName(name)),
    )
    for (const option of subcommandBuilder.options) {
      if (autocomplete[name]?.[option.name]) {
        ;(
          option as ApplicationCommandOptionBase &
            ApplicationCommandOptionWithAutocompleteMixin
        ).setAutocomplete(true)
      }
    }
    subcommanded = subcommanded.addSubcommand(subcommandBuilder)
  }
  if (Object.keys(autocomplete).length > 0) {
    events.interactionCreate = wrapEventHandler(
      events.interactionCreate,
      async (interaction) => {
        if (!interaction.isAutocomplete()) return
        if (interaction.commandName !== subcommanded.name) return
        const subcommandName = interaction.options.getSubcommand(true)
        const focusedOption = interaction.options.getFocused(true)
        const subcommandAutocomplete = autocomplete[subcommandName]
        if (!subcommandAutocomplete) return
        const handler = subcommandAutocomplete[focusedOption.name]
        if (!handler) return
        const choices = await handler(interaction)
        await interaction.respond(
          choices.slice(0, 25).map((choice) => ({
            name: choice.name,
            value: choice.value,
          })),
        )
      },
    )
  }
  return {
    command: subcommanded,
    execute: (interaction) => {
      const subcommandName = interaction.options.getSubcommand(true)
      const handler = handlers[subcommandName]
      if (!handler) {
        throw new Error(`Unknown subcommand: ${subcommandName}`)
      }
      return handler(interaction)
    },
    events,
  }
}
