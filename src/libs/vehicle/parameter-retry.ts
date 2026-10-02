/**
 * Ask the vehicle for parameters by name and ask again for those that do not come back
 * @param {(name: string) => void} request - Sends the request for one parameter
 * @param {string[]} names - The parameters
 * @param {(name: string) => boolean} isReceived - Whether a parameter has come back
 * @param {number} [retries] - How many times to ask again, at most
 * @param {number} [intervalMs] - The wait between two requests, in ms
 * @returns {() => void} Stops asking
 */
export const requestParametersWithRetry = (
  request: (name: string) => void,
  names: string[],
  isReceived: (name: string) => boolean,
  retries = 3,
  intervalMs = 2000
): (() => void) => {
  names.forEach(request)
  // Stub until the retries are implemented
  void isReceived, retries, intervalMs
  return () => undefined
}
