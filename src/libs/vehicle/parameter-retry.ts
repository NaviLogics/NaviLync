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
  names.forEach((name) => request(name))
  let retriesLeft = retries
  const timer = setInterval(() => {
    const missing = names.filter((name) => !isReceived(name))
    if (missing.length === 0 || retriesLeft === 0) {
      clearInterval(timer)
      return
    }
    retriesLeft -= 1
    missing.forEach((name) => request(name))
  }, intervalMs)
  return () => clearInterval(timer)
}
