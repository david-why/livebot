type PaginateItem<T> = T extends undefined
  ? {
      content: string
    }
  : {
      content: string
      value: T
    }

interface PaginateOptions {
  maxLength?: number
  maxItems?: number
  separator?: string
}

interface PaginatePage<T> {
  items: PaginateItem<T>[]
  content: string
}

export function paginate<T = undefined>(
  items: PaginateItem<T>[],
  options: PaginateOptions = {},
): PaginatePage<T>[] {
  const { maxLength = 2000, maxItems = 25, separator = "\n" } = options
  const pages: PaginatePage<T>[] = []
  if (items.length === 0) {
    return pages
  }
  let currentPage: PaginatePage<T> = { items: [], content: "" }
  for (const item of items) {
    const itemLength = item.content.length + separator.length
    if (
      currentPage.content.length + itemLength > maxLength ||
      currentPage.items.length >= maxItems
    ) {
      pages.push(currentPage)
      currentPage = { items: [], content: "" }
    }
    currentPage.items.push(item)
    currentPage.content += item.content + separator
  }
  if (currentPage.items.length > 0) {
    pages.push(currentPage)
  }
  return pages
}
