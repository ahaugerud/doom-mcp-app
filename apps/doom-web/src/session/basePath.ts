export function getDoomBasePath() {
  return ''
}

export function buildDoomPath(path: string) {
  return `${getDoomBasePath()}${path}`
}
