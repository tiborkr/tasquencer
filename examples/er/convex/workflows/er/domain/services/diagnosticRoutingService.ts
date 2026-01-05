export type DiagnosticRoute = 'emergency' | 'review'

export function decideDiagnosticRoute(xrayResult: {
  isCritical: boolean
}): DiagnosticRoute {
  if (xrayResult.isCritical) {
    return 'emergency'
  }
  return 'review'
}
